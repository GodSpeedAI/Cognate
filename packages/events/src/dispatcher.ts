import type { DurableStore, Json, OutboxItem, OutboxSettlement } from "./types.ts";

/** Throw from `deliver` when retrying cannot succeed; the item is poisoned for operator replay. */
export class PermanentDeliveryError extends Error {
  override readonly name = "PermanentDeliveryError";
}

export interface Backoff {
  readonly baseMs: number;
  readonly maxMs: number;
  /** Attempts before an item is poisoned. */
  readonly maxAttempts: number;
}

export interface OutboxDispatcherOptions {
  readonly topic: string;
  /** Deliver one item; the target deduplicates by `item.id`. Return a receipt. Throw to retry; throw PermanentDeliveryError to poison. */
  readonly deliver: (item: OutboxItem, signal: AbortSignal) => Promise<Json>;
  readonly backoff: Backoff;
  readonly leaseMs?: number;
  readonly batchSize?: number;
  /** Maximum number of simultaneous deliveries. Defaults to one. Requires fenced lease support above one. */
  readonly concurrency?: number;
  readonly now?: () => number;
}

export interface DrainReport {
  readonly delivered: readonly string[];
  readonly retried: readonly { readonly id: string; readonly retryAt: number }[];
  readonly poisoned: readonly string[];
  readonly lost?: readonly string[];
}

/** At-least-once delivery of committed outbox intents with bounded exponential backoff (spec §11, §13.1). */
export class OutboxDispatcher {
  /** Reservations include claims in flight, so overlapping drains share one local cap. */
  private activeReservations = 0;

  constructor(
    readonly store: DurableStore,
    readonly options: OutboxDispatcherOptions,
  ) {}

  /** Claim and deliver every currently available item once. */
  async drain(): Promise<DrainReport> {
    const concurrency = this.options.concurrency ?? 1;
    const batchSize = this.options.batchSize ?? 100;
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("outbox dispatcher concurrency must be a positive integer");
    if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("outbox dispatcher batchSize must be a positive integer");
    const fenced = Boolean(this.store.claimOutboxLeased && this.store.renewOutboxLease && this.store.settleOutboxLease);
    if (concurrency > 1 && !fenced) throw new Error("outbox dispatcher concurrency above one requires fenced lease support");
    const now = () => this.options.now ? this.options.now() : Date.now();
    const delivered: string[] = [];
    const retried: { readonly id: string; readonly retryAt: number }[] = [];
    const poisoned: string[] = [];
    const lost: string[] = [];

    const handle = async (item: OutboxItem): Promise<{ delivered?: string; retried?: { id: string; retryAt: number }; poisoned?: string; lost?: string }> => {
      const lease = item.lease;
      const controller = new AbortController();
      let claimLost = fenced && (!lease || !this.store.renewOutboxLease || !this.store.settleOutboxLease);
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let heartbeatTask: Promise<void> | undefined;
      const loseClaim = () => {
        claimLost = true;
        controller.abort();
      };
      if (claimLost) {
        controller.abort();
        return { lost: item.id };
      }
      const scheduleHeartbeat = () => {
        if (stopped || claimLost || !lease || !this.store.renewOutboxLease) return;
        const interval = Math.max(1, Math.floor((this.options.leaseMs ?? 30_000) / 3));
        timer = setTimeout(() => {
          heartbeatTask = (async () => {
            try {
              const renewed = await this.store.renewOutboxLease!({ id: item.id, ownerId: lease.ownerId, generation: lease.generation, now: now(), leaseMs: this.options.leaseMs ?? 30_000 });
              if (!renewed) loseClaim();
              else scheduleHeartbeat();
            } catch {
              loseClaim();
            }
          })();
        }, interval);
      };
      if (fenced && !claimLost) scheduleHeartbeat();

      let receipt: Json | undefined;
      let deliveryError: unknown;
      let deliveryFailed = false;
      try {
        receipt = await this.options.deliver(item, controller.signal);
      } catch (error) {
        deliveryError = error;
        deliveryFailed = true;
      }
      stopped = true;
      if (timer) clearTimeout(timer);
      await heartbeatTask;
      if (claimLost) return { lost: item.id };

      let settlement: OutboxSettlement;
      let report: { delivered?: string; retried?: { id: string; retryAt: number }; poisoned?: string };
      if (!deliveryFailed) {
        settlement = { kind: "delivered", receipt: receipt! };
        report = { delivered: item.id };
      } else {
        const message = deliveryError instanceof Error ? deliveryError.message : String(deliveryError);
        if (deliveryError instanceof PermanentDeliveryError || item.attempts >= this.options.backoff.maxAttempts) {
          settlement = { kind: "poisoned", error: message };
          report = { poisoned: item.id };
        } else {
          const retryAt = now() + this.delayFor(item.attempts);
          settlement = { kind: "retry", error: message, retryAt };
          report = { retried: { id: item.id, retryAt } };
        }
      }

      if (fenced && lease && this.store.settleOutboxLease) {
        const settled = await this.store.settleOutboxLease({ id: item.id, ownerId: lease.ownerId, generation: lease.generation, now: now() }, settlement);
        return settled ? report : { lost: item.id };
      }
      await this.store.settleOutbox(item.id, settlement);
      return report;
    };

    // Each worker reserves before awaiting the store. Overlapping drains therefore share
    // the same local cap, and each completed item refills its slot immediately.
    let claimedCount = 0;
    const worker = async () => {
      while (claimedCount < batchSize) {
        if (this.activeReservations >= concurrency) return;
        this.activeReservations++;
        let held = true;
        const release = () => {
          if (!held) return;
          held = false;
          this.activeReservations--;
        };
        try {
          if (claimedCount >= batchSize) return;
          claimedCount++;
          const items = fenced
            ? await this.store.claimOutboxLeased!({ topic: this.options.topic, ownerId: this.ownerId, now: now(), limit: 1, leaseMs: this.options.leaseMs ?? 30_000 })
            : await this.store.claimOutbox({ topic: this.options.topic, now: now(), limit: 1, leaseMs: this.options.leaseMs ?? 30_000 });
          if (items.length === 0) return;
          const result = await handle(items[0]!);
        if (result.delivered) delivered.push(result.delivered);
        if (result.retried) retried.push(result.retried);
        if (result.poisoned) poisoned.push(result.poisoned);
        if (result.lost) lost.push(result.lost);
        } finally {
          release();
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    return { delivered, retried, poisoned, ...(lost.length ? { lost } : {}) };
  }

  private readonly ownerId = crypto.randomUUID();

  /** Retry delay for the given attempt: min(maxMs, baseMs * 2^(attempt-1)). */
  delayFor(attempt: number): number {
    return Math.min(this.options.backoff.maxMs, this.options.backoff.baseMs * 2 ** (attempt - 1));
  }
}
