import { randomUUID } from "node:crypto";
import { fingerprint, OutboxDispatcher, PermanentDeliveryError } from "@godspeedai/cognate-events";
import type { DrainReport, DurableStore, Json, StoredRecord } from "@godspeedai/cognate-events";
import type { Principal } from "@godspeedai/cognate-kernel-api";
import { CommitmentRejectedError, type CommitmentRecord, type CommitmentTarget } from "./types.ts";

export interface CommitmentServiceOptions {
  readonly now?: () => number;
  readonly ids?: () => string;
  readonly backoff?: { readonly baseMs: number; readonly maxMs: number; readonly maxAttempts: number };
}

export interface IntendCommitment {
  readonly targetId: string;
  readonly operation: string;
  readonly idempotencyKey: string;
  readonly payload: Json;
  readonly tenant: string;
  readonly scopeId: string;
  readonly correlationId: string;
  readonly causationId?: string;
}

const COLLECTION = "commitments";
const DISPATCH_TOPIC = "commitment.dispatch";

/** Internal fields we carry alongside the public `CommitmentRecord` shape (spec §9.3 events need tenant/correlation context). */
type StoredValue = Record<string, Json> & {
  readonly tenant: string;
  readonly scopeId: string;
  readonly correlationId: string;
  readonly causationId: string | null;
};

/**
 * External commitments (spec §9.3): INTENT → DISPATCHING → SUCCEEDED | FAILED | UNKNOWN_RECONCILIATION_REQUIRED.
 * Never a reversible effect; compensation is a separate commitment.
 */
export class CommitmentService {
  private readonly now: () => number;
  private readonly ids: () => string;
  private readonly backoff: { readonly baseMs: number; readonly maxMs: number; readonly maxAttempts: number };
  private readonly targets = new Map<string, CommitmentTarget>();

  constructor(
    private readonly store: DurableStore,
    options?: CommitmentServiceOptions,
  ) {
    this.now = options?.now ?? (() => Date.now());
    this.ids = options?.ids ?? (() => randomUUID());
    this.backoff = options?.backoff ?? { baseMs: 1_000, maxMs: 30_000, maxAttempts: 8 };
  }

  registerTarget(target: CommitmentTarget): () => void {
    this.targets.set(target.id, target);
    return () => {
      if (this.targets.get(target.id) === target) this.targets.delete(target.id);
    };
  }

  /** Record intent and its outbox dispatch atomically; the same idempotency key returns the existing commitment. */
  async intend(request: IntendCommitment): Promise<CommitmentRecord> {
    const target = this.targets.get(request.targetId);
    const targetIdempotent = target?.idempotent ?? false;
    const dedupRetentionMs = target?.dedupRetentionMs ?? null;
    const scope = `commitment:${request.targetId}:${request.operation}`;
    const key = request.idempotencyKey;
    const id = this.ids();
    const eventId = this.ids();
    const outboxId = this.ids();
    const causationId = request.causationId ?? null;

    const value: StoredValue = {
      targetId: request.targetId,
      operation: request.operation,
      idempotencyKey: request.idempotencyKey,
      payload: request.payload,
      targetIdempotent,
      dedupRetentionMs,
      attempts: 0,
      remoteRef: null,
      result: null,
      lastError: null,
      state: "INTENDED",
      compensates: null,
      tenant: request.tenant,
      scopeId: request.scopeId,
      correlationId: request.correlationId,
      causationId,
    };

    const resultSnapshot: Json = { id, version: 1, ...value };

    const outcome = await this.store.commit({
      idempotency: {
        scope,
        key,
        fingerprint: fingerprint({ targetId: request.targetId, operation: request.operation, idempotencyKey: key, payload: request.payload }),
      },
      appends: [
        {
          streamId: `commitment-${id}`,
          expectedVersion: 0,
          events: [
            {
              eventId,
              eventType: "commitment.intended",
              schemaVersion: 1,
              occurredAt: new Date(this.now()).toISOString(),
              tenant: request.tenant,
              correlationId: request.correlationId,
              causationId,
              runId: null,
              scopeId: request.scopeId,
              payload: { targetId: request.targetId, operation: request.operation, idempotencyKey: key, payload: request.payload } as Json,
            },
          ],
        },
      ],
      records: [{ collection: COLLECTION, id, expectedVersion: 0, value }],
      outbox: [{ id: outboxId, topic: DISPATCH_TOPIC, payload: { commitmentId: id } }],
      result: resultSnapshot,
    });

    if (outcome.kind === "duplicate") {
      return this.recordFromSnapshot(outcome.result as Record<string, Json>);
    }
    return this.recordFromSnapshot(resultSnapshot as Record<string, Json>);
  }

  async get(id: string): Promise<CommitmentRecord | undefined> {
    const stored = await this.store.getRecord(COLLECTION, id);
    return stored ? this.toRecord(stored) : undefined;
  }

  /** Dispatch available intents. DISPATCHING is committed before the target is called. */
  async dispatch(): Promise<DrainReport> {
    const dispatcher = new OutboxDispatcher(this.store, {
      topic: DISPATCH_TOPIC,
      backoff: this.backoff,
      now: this.now,
      deliver: async (item) => {
        const { commitmentId } = item.payload as { commitmentId: string };
        const stored = await this.store.getRecord(COLLECTION, commitmentId);
        if (!stored) throw new Error(`commitment ${commitmentId} not found`);
        const value = stored.value as StoredValue;
        const state = value.state as CommitmentRecord["state"];

        if (state === "SUCCEEDED" || state === "FAILED") {
          return { skipped: true, state } as Json;
        }

        const target = this.targets.get(value.targetId as string);
        if (!target) throw new Error(`no target registered for ${value.targetId as string}`);

        if (state === "DISPATCHING") {
          // A crash committed DISPATCHING but never recorded an outcome.
          if (!target.idempotent) {
            await this.commitTransition(commitmentId, stored, "commitment.unknown", { reason: "dispatcher crashed before outcome was recorded" }, {
              state: "UNKNOWN_RECONCILIATION_REQUIRED",
              lastError: "dispatcher crashed before outcome was recorded",
            });
            return { unknown: true } as Json;
          }
          // Idempotent target: safe to re-dispatch below.
        }

        const attempts = (value.attempts as number) + 1;
        const dispatching = await this.commitTransition(commitmentId, stored, "commitment.dispatching", { attempt: attempts }, { state: "DISPATCHING", attempts });

        const controller = new AbortController();
        try {
          const { remoteRef, result } = await target.dispatch(
            { commitmentId, idempotencyKey: value.idempotencyKey as string, operation: value.operation as string, payload: (value.payload ?? null) as Json, attempt: attempts },
            controller.signal,
          );
          await this.commitTransition(commitmentId, dispatching.stored, "commitment.succeeded", { remoteRef, result }, { state: "SUCCEEDED", remoteRef, result, lastError: null });
          return { succeeded: true, remoteRef } as Json;
        } catch (error) {
          if (error instanceof CommitmentRejectedError) {
            await this.commitTransition(commitmentId, dispatching.stored, "commitment.failed", { error: error.message }, { state: "FAILED", lastError: error.message });
            return { failed: true } as Json;
          }
          const message = error instanceof Error ? error.message : String(error);
          await this.commitTransition(commitmentId, dispatching.stored, "commitment.unknown", { error: message }, { state: "UNKNOWN_RECONCILIATION_REQUIRED", lastError: message });
          if (target.idempotent) throw new Error(message);
          throw new PermanentDeliveryError(message);
        }
      },
    });
    return dispatcher.drain();
  }

  /** Ask the target for the outcome of an UNKNOWN commitment. */
  async reconcile(id: string): Promise<CommitmentRecord> {
    const stored = await this.store.getRecord(COLLECTION, id);
    if (!stored) throw new Error(`commitment ${id} not found`);
    const value = stored.value as StoredValue;
    if (value.state !== "UNKNOWN_RECONCILIATION_REQUIRED") return this.toRecord(stored);

    const target = this.targets.get(value.targetId as string);
    if (!target?.status) return this.toRecord(stored);

    const outcome = await target.status({ commitmentId: id, idempotencyKey: value.idempotencyKey as string });
    if (outcome.state === "unknown") return this.toRecord(stored);
    if (outcome.state === "succeeded") {
      const result = await this.commitTransition(id, stored, "commitment.succeeded", { remoteRef: outcome.remoteRef, result: outcome.result }, {
        state: "SUCCEEDED",
        remoteRef: outcome.remoteRef,
        result: outcome.result,
        lastError: null,
      });
      return this.toRecord(result.stored);
    }
    const result = await this.commitTransition(id, stored, "commitment.failed", { error: outcome.error }, { state: "FAILED", lastError: outcome.error });
    return this.toRecord(result.stored);
  }

  /** Operator reconciliation of an UNKNOWN commitment, recorded with actor and reason. */
  async resolveManually(
    id: string,
    resolution: {
      readonly actor: Principal;
      readonly reason: string;
      readonly outcome: { readonly state: "succeeded"; readonly remoteRef: string; readonly result: Json } | { readonly state: "failed"; readonly error: string };
    },
  ): Promise<CommitmentRecord> {
    const stored = await this.store.getRecord(COLLECTION, id);
    if (!stored) throw new Error(`commitment ${id} not found`);

    const newFields: Record<string, Json> =
      resolution.outcome.state === "succeeded"
        ? { state: "SUCCEEDED", remoteRef: resolution.outcome.remoteRef, result: resolution.outcome.result, lastError: null }
        : { state: "FAILED", lastError: resolution.outcome.error };

    const result = await this.commitTransition(id, stored, "commitment.reconciled", { actorId: resolution.actor.id, reason: resolution.reason }, newFields);
    return this.toRecord(result.stored);
  }

  /** Intend a compensating commitment for a SUCCEEDED one; the original record is unchanged. */
  async compensate(id: string, request: Omit<IntendCommitment, "tenant" | "scopeId" | "correlationId"> & { readonly correlationId?: string }): Promise<CommitmentRecord> {
    const stored = await this.store.getRecord(COLLECTION, id);
    if (!stored) throw new Error(`commitment ${id} not found`);
    const value = stored.value as StoredValue;
    if (value.state !== "SUCCEEDED") throw new Error(`commitment ${id} has not succeeded; cannot compensate`);

    const compensationId = this.ids();
    const eventId = this.ids();
    const outboxId = this.ids();
    const target = this.targets.get(request.targetId);
    const targetIdempotent = target?.idempotent ?? false;
    const dedupRetentionMs = target?.dedupRetentionMs ?? null;
    const correlationId = request.correlationId ?? (value.correlationId as string);
    const causationId = request.causationId ?? (value.causationId as string | null) ?? null;

    const newValue: StoredValue = {
      targetId: request.targetId,
      operation: request.operation,
      idempotencyKey: request.idempotencyKey,
      payload: request.payload,
      targetIdempotent,
      dedupRetentionMs,
      attempts: 0,
      remoteRef: null,
      result: null,
      lastError: null,
      state: "INTENDED",
      compensates: id,
      tenant: value.tenant,
      scopeId: value.scopeId,
      correlationId,
      causationId,
    };

    const scope = `commitment:${request.targetId}:${request.operation}`;
    const resultSnapshot: Json = { id: compensationId, version: 1, ...newValue };

    const outcome = await this.store.commit({
      idempotency: {
        scope,
        key: request.idempotencyKey,
        fingerprint: fingerprint({ targetId: request.targetId, operation: request.operation, idempotencyKey: request.idempotencyKey, payload: request.payload, compensates: id }),
      },
      appends: [
        {
          streamId: `commitment-${compensationId}`,
          expectedVersion: 0,
          events: [
            {
              eventId,
              eventType: "commitment.intended",
              schemaVersion: 1,
              occurredAt: new Date(this.now()).toISOString(),
              tenant: value.tenant as string,
              correlationId,
              causationId,
              runId: null,
              scopeId: value.scopeId as string,
              payload: { targetId: request.targetId, operation: request.operation, idempotencyKey: request.idempotencyKey, payload: request.payload, compensates: id } as Json,
            },
          ],
        },
      ],
      records: [{ collection: COLLECTION, id: compensationId, expectedVersion: 0, value: newValue }],
      outbox: [{ id: outboxId, topic: DISPATCH_TOPIC, payload: { commitmentId: compensationId } }],
      result: resultSnapshot,
    });

    if (outcome.kind === "duplicate") return this.recordFromSnapshot(outcome.result as Record<string, Json>);
    return this.recordFromSnapshot(resultSnapshot as Record<string, Json>);
  }

  // --- internals ---

  private toRecord(stored: StoredRecord): CommitmentRecord {
    return this.recordFromSnapshot({ id: stored.id, version: stored.version, ...stored.value });
  }

  private recordFromSnapshot(v: Record<string, Json>): CommitmentRecord {
    return {
      id: v.id as string,
      targetId: v.targetId as string,
      operation: v.operation as string,
      idempotencyKey: v.idempotencyKey as string,
      payload: v.payload as Json,
      targetIdempotent: v.targetIdempotent as boolean,
      dedupRetentionMs: (v.dedupRetentionMs ?? null) as number | null,
      attempts: v.attempts as number,
      remoteRef: (v.remoteRef ?? null) as string | null,
      result: (v.result ?? null) as Json,
      lastError: (v.lastError ?? null) as string | null,
      state: v.state as CommitmentRecord["state"],
      compensates: (v.compensates ?? null) as string | null,
      version: v.version as number,
    };
  }

  /** Commit a CAS transition on a commitment record and its stream event; returns the fresh stored record for chaining. */
  private async commitTransition(
    id: string,
    stored: StoredRecord,
    eventType: string,
    eventPayload: Json,
    newFields: Record<string, Json>,
  ): Promise<{ readonly record: CommitmentRecord; readonly stored: StoredRecord }> {
    const value = stored.value as StoredValue;
    const newValue: Record<string, Json> = { ...value, ...newFields };
    const occurredAt = new Date(this.now()).toISOString();
    const streamId = `commitment-${id}`;
    const streamVersion = await this.store.streamVersion(streamId);

    const outcome = await this.store.commit({
      appends: [
        {
          streamId,
          expectedVersion: streamVersion,
          events: [
            {
              eventId: this.ids(),
              eventType,
              schemaVersion: 1,
              occurredAt,
              tenant: value.tenant,
              correlationId: value.correlationId,
              causationId: value.causationId,
              runId: null,
              scopeId: value.scopeId,
              payload: eventPayload,
            },
          ],
        },
      ],
      records: [{ collection: COLLECTION, id, expectedVersion: stored.version, value: newValue }],
    });

    if (outcome.kind !== "committed") throw new Error(`commitment ${id} transition did not commit`);
    const freshStored = outcome.records[0]!;
    return { record: this.toRecord(freshStored), stored: freshStored };
  }
}
