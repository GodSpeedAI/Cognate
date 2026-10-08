import { CheckpointConflictError, type DurableStore, type Json, type StoredEvent } from "@godspeedai/events";
import type { CatchUpResult, Projection, ProjectionState } from "./types.ts";

export interface ProjectionRunnerOptions {
  /** Events read and committed per batch (default 256). */
  readonly batchSize?: number;
}

interface Failure {
  readonly position: number;
  readonly eventId: string;
  readonly message: string;
}

interface Waiter {
  readonly position: number;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

type BatchResult =
  | { readonly status: "ok"; readonly position: number; readonly applied: number }
  | { readonly status: "error"; readonly position: number; readonly error: Failure }
  | { readonly status: "conflict" };

export class ProjectionRunner {
  private readonly store: DurableStore;
  private readonly projection: Projection;
  private readonly batchSize: number;

  /** Serializes every run (manual catchUp/retry/rebuild and live-triggered runs) so they never overlap. */
  private queue: Promise<unknown> = Promise.resolve();
  private unsubscribe: (() => void) | null = null;
  private liveRunQueued = false;
  private waiters: Waiter[] = [];

  constructor(store: DurableStore, projection: Projection, options: ProjectionRunnerOptions = {}) {
    this.store = store;
    this.projection = projection;
    this.batchSize = options.batchSize ?? 256;
  }

  /** Apply every event after the checkpoint; stop at the first failure without advancing past it. */
  catchUp(): Promise<CatchUpResult> {
    return this.enqueue(() => this.runOnce());
  }

  /** Operator replay path: clear a recorded error and try again from the checkpoint. */
  retry(): Promise<CatchUpResult> {
    return this.enqueue(() => this.runOnce({ bypassErrorCheck: true }));
  }

  /** Delete derived state and checkpoint, then rebuild from position 0. */
  rebuild(): Promise<CatchUpResult> {
    return this.enqueue(async () => {
      await this.store.resetProjection(this.projection.name);
      return this.runOnce();
    });
  }

  /** Follow committed events live until `stop`. */
  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.store.onCommitted(() => this.triggerLiveRun());
    this.triggerLiveRun();
  }

  async stop(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    await this.queue.catch(() => {});
  }

  /** Resolves once the runner has processed up to the given store position. */
  async waitFor(position: number, timeoutMs?: number): Promise<void> {
    const checkpoint = await this.store.getProjection(this.projection.name);
    if ((checkpoint?.position ?? 0) >= position) return;
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { position, resolve, reject };
      if (timeoutMs !== undefined) {
        waiter.timer = setTimeout(() => {
          this.waiters = this.waiters.filter((w) => w !== waiter);
          reject(new Error(`projections: waitFor(${position}) timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }
      this.waiters.push(waiter);
    });
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private triggerLiveRun(): void {
    if (this.liveRunQueued) return;
    this.liveRunQueued = true;
    void this.enqueue(async () => {
      this.liveRunQueued = false;
      await this.runOnce().catch(() => {});
    });
  }

  private notifyWaiters(position: number): void {
    this.waiters = this.waiters.filter((waiter) => {
      if (position < waiter.position) return true;
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.resolve();
      return false;
    });
  }

  private async runOnce(opts: { bypassErrorCheck?: boolean } = {}): Promise<CatchUpResult> {
    const checkpoint = await this.store.getProjection(this.projection.name);
    if (checkpoint && checkpoint.version !== this.projection.version) {
      return { status: "rebuild_required", storedVersion: checkpoint.version };
    }
    if (!opts.bypassErrorCheck && checkpoint?.status === "error") {
      return { status: "error", position: checkpoint.position, error: checkpoint.error! };
    }

    let position = checkpoint?.position ?? 0;
    let applied = 0;
    for (;;) {
      const events = await this.store.readAll({ afterPosition: position, limit: this.batchSize });
      if (events.length === 0) break;

      const result = await this.applyBatch(position, events);
      if (result.status === "conflict") {
        const fresh = await this.store.getProjection(this.projection.name);
        position = fresh?.position ?? 0;
        continue;
      }
      if (result.status === "error") {
        return { status: "error", position: result.position, error: result.error };
      }
      position = result.position;
      applied += result.applied;
      if (events.length < this.batchSize) break;
    }
    return { status: "ok", position, applied };
  }

  /** Applies events in order, building writes and state locally, then commits the whole batch (and checkpoint) atomically. */
  private async applyBatch(fromPosition: number, events: readonly StoredEvent[]): Promise<BatchResult> {
    const existing = await this.store.listProjection(this.projection.name);
    const localState = new Map<string, Json>(existing.map((entry) => [entry.key, entry.value]));
    const stateReader: ProjectionState = { get: (key) => localState.get(key) };

    const writes: { key: string; value: Json | null }[] = [];
    let position = fromPosition;
    let applied = 0;
    let failure: Failure | undefined;

    for (const event of events) {
      try {
        const eventWrites = await this.projection.apply(event, stateReader);
        for (const write of eventWrites) {
          if (write.value === null) localState.delete(write.key);
          else localState.set(write.key, write.value);
          writes.push({ key: write.key, value: write.value });
        }
        position = event.position;
        applied++;
      } catch (error) {
        failure = {
          position: event.position,
          eventId: event.eventId,
          message: error instanceof Error ? error.message : String(error),
        };
        break;
      }
    }

    try {
      await this.store.commitProjection({
        name: this.projection.name,
        version: this.projection.version,
        fromPosition,
        toPosition: position,
        writes,
      });
    } catch (error) {
      if (error instanceof CheckpointConflictError) return { status: "conflict" };
      throw error;
    }
    this.notifyWaiters(position);

    if (failure) {
      await this.store.failProjection(this.projection.name, failure);
      return { status: "error", position, error: failure };
    }
    return { status: "ok", position, applied };
  }
}
