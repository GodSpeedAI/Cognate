import type { DurableStore, Json, OutboxItem } from "./types.ts";

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
  readonly now?: () => number;
}

export interface DrainReport {
  readonly delivered: readonly string[];
  readonly retried: readonly { readonly id: string; readonly retryAt: number }[];
  readonly poisoned: readonly string[];
}

/** At-least-once delivery of committed outbox intents with bounded exponential backoff (spec §11, §13.1). */
export class OutboxDispatcher {
  constructor(
    readonly store: DurableStore,
    readonly options: OutboxDispatcherOptions,
  ) {}

  /** Claim and deliver every currently available item once. */
  async drain(): Promise<DrainReport> {
    const now = this.options.now ? this.options.now() : Date.now();
    const items = await this.store.claimOutbox({
      topic: this.options.topic,
      now,
      limit: this.options.batchSize ?? 100,
      leaseMs: this.options.leaseMs ?? 30_000,
    });

    const delivered: string[] = [];
    const retried: { readonly id: string; readonly retryAt: number }[] = [];
    const poisoned: string[] = [];

    for (const item of items) {
      const controller = new AbortController();
      try {
        const receipt = await this.options.deliver(item, controller.signal);
        await this.store.settleOutbox(item.id, { kind: "delivered", receipt });
        delivered.push(item.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof PermanentDeliveryError || item.attempts >= this.options.backoff.maxAttempts) {
          await this.store.settleOutbox(item.id, { kind: "poisoned", error: message });
          poisoned.push(item.id);
        } else {
          const retryAt = now + this.delayFor(item.attempts);
          await this.store.settleOutbox(item.id, { kind: "retry", error: message, retryAt });
          retried.push({ id: item.id, retryAt });
        }
      }
    }

    return { delivered, retried, poisoned };
  }

  /** Retry delay for the given attempt: min(maxMs, baseMs * 2^(attempt-1)). */
  delayFor(attempt: number): number {
    return Math.min(this.options.backoff.maxMs, this.options.backoff.baseMs * 2 ** (attempt - 1));
  }
}
