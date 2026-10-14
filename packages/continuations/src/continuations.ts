import { randomUUID } from "node:crypto";
import { ConcurrencyError, fingerprint, OutboxDispatcher, PermanentDeliveryError, RecordConflictError } from "@godspeedai/cognate-events";
import type { DrainReport, DurableStore, Json, OutboxAdmission, OutboxIntent, StoredRecord } from "@godspeedai/cognate-events";
import type {
  ContinuationAction,
  ContinuationPolicy,
  ContinuationRecord,
  ContinuationStatus,
  OpenContinuation,
  ResumeHandler,
  TransitionOutcome,
} from "./types.ts";

export interface ContinuationServiceOptions {
  readonly policy: ContinuationPolicy;
  readonly now?: () => number;
  readonly ids?: () => string;
  /** Backoff for delivering resumed continuations to handlers. */
  readonly delivery?: { readonly baseMs: number; readonly maxMs: number; readonly maxAttempts: number };
  /** Bounded independent handler deliveries; default one preserves serial compatibility. */
  readonly deliveryConcurrency?: number;
  /** Optional shared pre-claim admission with other native outbox topics. */
  readonly deliveryAdmission?: OutboxAdmission;
}

const COLLECTION = "continuations";
const RESUME_TOPIC = "continuation.resume";

type StoredValue = Record<string, Json> & {
  readonly lastTransition?: { readonly scope: string; readonly key: string } | null;
};

/**
 * Durable continuations (spec §12). Each transition commits the record (CAS), an event on stream
 * `continuation-<id>`, the idempotency result, and any resume outbox intent in one decision.
 */
export class ContinuationService {
  private readonly now: () => number;
  private readonly ids: () => string;
  private readonly handlers = new Map<string, ResumeHandler>();
  private resumeDispatcher: OutboxDispatcher | undefined;

  constructor(
    private readonly store: DurableStore,
    private readonly options: ContinuationServiceOptions,
  ) {
    this.now = options.now ?? (() => Date.now());
    this.ids = options.ids ?? (() => randomUUID());
  }

  /** Register a resume handler; returns an unregister function (a reversible effect for the owning fiber). */
  registerHandler(handler: ResumeHandler): () => void {
    this.handlers.set(handler.id, handler);
    return () => {
      if (this.handlers.get(handler.id) === handler) this.handlers.delete(handler.id);
    };
  }

  async open(input: OpenContinuation): Promise<ContinuationRecord> {
    const id = input.id ?? this.ids();
    const eventId = this.ids();
    const causationId = input.causationId ?? null;
    const occurredAt = new Date(this.now()).toISOString();

    const value: StoredValue = {
      type: input.type,
      tenant: input.tenant,
      runId: input.runId,
      scopeId: input.scopeId,
      correlationId: input.correlationId,
      causationId,
      condition: input.condition,
      payload: input.payload,
      handler: { id: input.handler.id, version: input.handler.version },
      semanticRef: (input.semanticRef ?? null) as unknown as Json,
      semanticProjectionVersion: input.semanticProjectionVersion ?? null,
      expiresAt: input.expiresAt ?? null,
      ownerComponentId: input.ownerComponentId ?? null,
      status: "OPEN",
      createdEventId: eventId,
      resolution: null,
      lastTransition: null,
    };

    const outcome = await this.store.commit({
      appends: [
        {
          streamId: `continuation-${id}`,
          expectedVersion: 0,
          events: [
            {
              eventId,
              eventType: "continuation.opened",
              schemaVersion: 1,
              occurredAt,
              tenant: input.tenant,
              correlationId: input.correlationId,
              causationId,
              runId: input.runId,
              scopeId: input.scopeId,
              payload: { type: input.type, condition: input.condition, payload: input.payload, handler: value.handler } as Json,
            },
          ],
        },
      ],
      records: [{ collection: COLLECTION, id, expectedVersion: 0, value }],
    });

    if (outcome.kind !== "committed") throw new Error("continuation open did not commit");
    return this.recordFromSnapshot({ id, version: outcome.records[0]!.version, ...value });
  }

  async get(id: string): Promise<ContinuationRecord | undefined> {
    const stored = await this.store.getRecord(COLLECTION, id);
    return stored ? this.toRecord(stored) : undefined;
  }

  async list(where?: { readonly status?: ContinuationStatus; readonly runId?: string; readonly tenant?: string }): Promise<ContinuationRecord[]> {
    const filter: { [key: string]: string | number | boolean | null } = {};
    if (where?.status) filter.status = where.status;
    if (where?.runId) filter.runId = where.runId;
    if (where?.tenant) filter.tenant = where.tenant;
    const stored = await this.store.listRecords(COLLECTION, filter);
    return stored.map((s) => this.toRecord(s));
  }

  /** OPEN → RESUMED (or BLOCKED when the registered handler cannot interpret the stored version). */
  async resume(id: string, action: ContinuationAction & { readonly input: Json }): Promise<TransitionOutcome> {
    const scope = `${action.actor.id}:continuation.resume`;
    const key = action.idempotencyKey;

    for (let attempt = 0; attempt < 5; attempt++) {
      const guarded = await this.guard(id, "OPEN", scope, key);
      if (guarded.kind !== "proceed") return guarded;
      const { stored, record } = guarded;

      if (action.expectedVersion !== undefined && action.expectedVersion !== record.version) {
        return { kind: "version_mismatch", record };
      }

      if (record.status === "OPEN") {
        const decision = this.options.policy.authorize({ actor: action.actor, action: "resume", continuation: record });
        if (!decision.allow) return { kind: "denied", reason: decision.reason };
      }

      const handlerEntry = this.handlers.get(record.handler.id);
      const blocked = record.status === "OPEN" && !!handlerEntry && !handlerEntry.supports(record.handler.version);
      const targetStatus: ContinuationStatus = blocked ? "BLOCKED" : "RESUMED";
      const eventType = blocked ? "continuation.blocked" : "continuation.resumed";
      const eventId = this.ids();
      const resolution = { eventId, actorId: action.actor.id, input: action.input, reason: null };
      const outbox: OutboxIntent[] = blocked ? [] : [{ id: this.ids(), topic: RESUME_TOPIC, payload: { continuationId: id } }];

      try {
        const result = await this.commitCas({
          id,
          stored,
          scope,
          key,
          fingerprintInput: { actor: action.actor.id, idempotencyKey: key, input: action.input },
          eventId,
          eventType,
          eventPayload: { actorId: action.actor.id, input: action.input },
          newFields: { status: targetStatus, resolution },
          outbox,
        });
        return { kind: result.kind === "duplicate" ? "duplicate" : "transitioned", record: result.record };
      } catch (error) {
        if (error instanceof RecordConflictError || error instanceof ConcurrencyError) continue;
        throw error;
      }
    }
    return this.terminalFallback(id);
  }

  async cancel(id: string, action: ContinuationAction & { readonly reason: string }): Promise<TransitionOutcome> {
    const scope = `${action.actor.id}:continuation.cancel`;
    const key = action.idempotencyKey;

    for (let attempt = 0; attempt < 5; attempt++) {
      const guarded = await this.guard(id, "OPEN", scope, key);
      if (guarded.kind !== "proceed") return guarded;
      const { stored, record } = guarded;

      if (action.expectedVersion !== undefined && action.expectedVersion !== record.version) {
        return { kind: "version_mismatch", record };
      }

      if (record.status === "OPEN") {
        const decision = this.options.policy.authorize({ actor: action.actor, action: "cancel", continuation: record });
        if (!decision.allow) return { kind: "denied", reason: decision.reason };
      }

      const eventId = this.ids();
      const resolution = { eventId, actorId: action.actor.id, input: null, reason: action.reason };

      try {
        const result = await this.commitCas({
          id,
          stored,
          scope,
          key,
          fingerprintInput: { actor: action.actor.id, idempotencyKey: key, reason: action.reason },
          eventId,
          eventType: "continuation.cancelled",
          eventPayload: { actorId: action.actor.id, reason: action.reason },
          newFields: { status: "CANCELLED", resolution },
        });
        return { kind: result.kind === "duplicate" ? "duplicate" : "transitioned", record: result.record };
      } catch (error) {
        if (error instanceof RecordConflictError || error instanceof ConcurrencyError) continue;
        throw error;
      }
    }
    return this.terminalFallback(id);
  }

  async fail(id: string, action: ContinuationAction & { readonly reason: string }): Promise<TransitionOutcome> {
    const scope = `${action.actor.id}:continuation.fail`;
    const key = action.idempotencyKey;

    for (let attempt = 0; attempt < 5; attempt++) {
      const guarded = await this.guard(id, "OPEN", scope, key);
      if (guarded.kind !== "proceed") return guarded;
      const { stored, record } = guarded;

      if (action.expectedVersion !== undefined && action.expectedVersion !== record.version) {
        return { kind: "version_mismatch", record };
      }

      const eventId = this.ids();
      const resolution = { eventId, actorId: action.actor.id, input: null, reason: action.reason };

      try {
        const result = await this.commitCas({
          id,
          stored,
          scope,
          key,
          fingerprintInput: { actor: action.actor.id, idempotencyKey: key, reason: action.reason },
          eventId,
          eventType: "continuation.failed",
          eventPayload: { actorId: action.actor.id, reason: action.reason },
          newFields: { status: "FAILED", resolution },
        });
        return { kind: result.kind === "duplicate" ? "duplicate" : "transitioned", record: result.record };
      } catch (error) {
        if (error instanceof RecordConflictError || error instanceof ConcurrencyError) continue;
        throw error;
      }
    }
    return this.terminalFallback(id);
  }

  /** Expire every OPEN continuation whose expiresAt <= now. Racing transitions still yield one terminal state. */
  async expireDue(): Promise<ContinuationRecord[]> {
    const now = this.now();
    const openStored = await this.store.listRecords(COLLECTION, { status: "OPEN" });
    const expired: ContinuationRecord[] = [];

    for (const initial of openStored) {
      const expiresAt = initial.value.expiresAt;
      if (typeof expiresAt !== "number" || expiresAt > now) continue;

      const scope = "system:continuation.expire";
      const key = initial.id;
      let current: StoredRecord | undefined = initial;

      for (let attempt = 0; attempt < 5 && current; attempt++) {
        const record = this.toRecord(current);
        if (record.status !== "OPEN") break;

        const eventId = this.ids();
        const resolution = { eventId, actorId: "system", input: null, reason: "expired" };

        try {
          const result = await this.commitCas({
            id: current.id,
            stored: current,
            scope,
            key,
            fingerprintInput: { scope, key, expiresAt },
            eventId,
            eventType: "continuation.expired",
            eventPayload: { reason: "expired" },
            newFields: { status: "EXPIRED", resolution },
          });
          if (result.kind === "committed") expired.push(result.record);
          break;
        } catch (error) {
          if (error instanceof RecordConflictError || error instanceof ConcurrencyError) {
            current = await this.store.getRecord(COLLECTION, initial.id);
            continue;
          }
          throw error;
        }
      }
    }

    return expired;
  }

  /** Deliver RESUMED continuations to registered handlers; missing handlers retry, unsupported versions block. */
  async dispatchResumes(): Promise<DrainReport> {
    const backoff = this.options.delivery ?? { baseMs: 1_000, maxMs: 30_000, maxAttempts: 8 };
    const dispatcher = this.resumeDispatcher ??= new OutboxDispatcher(this.store, {
      topic: RESUME_TOPIC,
      backoff,
      concurrency: this.options.deliveryConcurrency,
      admission: this.options.deliveryAdmission,
      now: this.now,
      deliver: async (item) => {
        const { continuationId } = item.payload as { continuationId: string };
        const stored = await this.store.getRecord(COLLECTION, continuationId);
        if (!stored) throw new Error(`continuation ${continuationId} not found`);
        const record = this.toRecord(stored);
        if (record.status !== "RESUMED") return { skipped: true, status: record.status } as Json;

        const handler = this.handlers.get(record.handler.id);
        if (!handler) throw new Error(`no handler registered for ${record.handler.id}`);

        if (!handler.supports(record.handler.version)) {
          const eventId = this.ids();
          await this.commitCas({
            id: continuationId,
            stored,
            scope: "system:continuation.block",
            key: item.id,
            fingerprintInput: { scope: "system:continuation.block", key: item.id },
            eventId,
            eventType: "continuation.blocked",
            eventPayload: { reason: "handler version unsupported" },
            newFields: { status: "BLOCKED" },
          });
          throw new PermanentDeliveryError(`handler ${handler.id}@${handler.version} does not support stored version ${record.handler.version}`);
        }

        await handler.handle(record);
        return { delivered: true } as Json;
      },
    });
    return dispatcher.drain();
  }

  /** Operator path: BLOCKED → RESUMED with a fresh delivery intent (after migrating or registering a compatible handler). */
  async unblock(id: string, action: ContinuationAction): Promise<TransitionOutcome> {
    const scope = `${action.actor.id}:continuation.unblock`;
    const key = action.idempotencyKey;

    for (let attempt = 0; attempt < 5; attempt++) {
      const guarded = await this.guard(id, "BLOCKED", scope, key);
      if (guarded.kind !== "proceed") return guarded;
      const { stored, record } = guarded;

      if (action.expectedVersion !== undefined && action.expectedVersion !== record.version) {
        return { kind: "version_mismatch", record };
      }

      const eventId = this.ids();

      try {
        const result = await this.commitCas({
          id,
          stored,
          scope,
          key,
          fingerprintInput: { actor: action.actor.id, idempotencyKey: key },
          eventId,
          eventType: "continuation.resumed",
          eventPayload: { actorId: action.actor.id, unblocked: true },
          newFields: { status: "RESUMED" },
          outbox: [{ id: this.ids(), topic: RESUME_TOPIC, payload: { continuationId: id } }],
        });
        return { kind: result.kind === "duplicate" ? "duplicate" : "transitioned", record: result.record };
      } catch (error) {
        if (error instanceof RecordConflictError || error instanceof ConcurrencyError) continue;
        throw error;
      }
    }
    return this.terminalFallback(id);
  }

  /**
   * Erasure cascade (spec §32, DEBT-014): redact every continuation of one run in place. The record's
   * `payload` and `resolution.input` are tombstoned (matching, timing, and status metadata survive),
   * a `continuation.redacted` event is appended, and the transition events that carried payload or
   * resolution copies are erased through the store (their envelope, and the transition idempotency
   * snapshots, are redacted by `erasePayload` itself). Idempotent: already-redacted continuations are
   * skipped, so an interrupted propagation can simply be re-run.
   */
  async redactForRun(runId: string, marker: { readonly reason: string; readonly erasedAt?: string }): Promise<number> {
    const erasedAt = marker.erasedAt ?? new Date().toISOString();
    const records = await this.store.listRecords(COLLECTION, { runId });
    let redacted = 0;
    for (const stored of records) {
      const record = this.toRecord(stored);
      // Erase the transition events that carried payload or resolution copies. erasePayload redacts
      // the transition idempotency snapshots too (their event_ids name these very events).
      for (const eventId of [record.createdEventId, record.resolution?.eventId]) {
        if (!eventId) continue;
        const event = await this.store.getEvent(eventId);
        if (event && !event.erasure) await this.store.erasePayload(eventId, marker.reason, "erasure-cascade");
      }
      if (record.payload !== null || record.resolution?.input != null) {
        const newValue: Record<string, Json> = {
          ...stored.value,
          payload: null,
          resolution: record.resolution ? { ...record.resolution, input: null } : null,
          erasure: { reason: marker.reason, erasedAt },
        };
        try {
          const streamId = `continuation-${record.id}`;
          await this.store.commit({
            appends: [{
              streamId,
              expectedVersion: await this.store.streamVersion(streamId),
              events: [{
                eventType: "continuation.redacted",
                schemaVersion: 1,
                occurredAt: erasedAt,
                tenant: record.tenant,
                correlationId: record.correlationId,
                causationId: null,
                runId: record.runId,
                scopeId: record.scopeId,
                payload: { reason: marker.reason, erasedAt },
              }],
            }],
            records: [{ collection: COLLECTION, id: record.id, expectedVersion: stored.version, value: newValue }],
          });
          redacted += 1;
        } catch (error) {
          if (error instanceof RecordConflictError || error instanceof ConcurrencyError) continue; // a concurrent redaction won; re-run resumes
          throw error;
        }
      }
    }
    return redacted;
  }

  // --- internals ---

  private toRecord(stored: StoredRecord): ContinuationRecord {
    return this.recordFromSnapshot({ id: stored.id, version: stored.version, ...stored.value });
  }

  private recordFromSnapshot(v: Record<string, Json>): ContinuationRecord {
    return {
      id: v.id as string,
      type: v.type as string,
      tenant: v.tenant as string,
      runId: v.runId as string,
      scopeId: v.scopeId as string,
      correlationId: v.correlationId as string,
      condition: v.condition as Json,
      payload: v.payload as Json,
      handler: v.handler as { id: string; version: string },
      semanticRef: (v.semanticRef ?? null) as ContinuationRecord["semanticRef"],
      semanticProjectionVersion: (v.semanticProjectionVersion ?? null) as string | null,
      expiresAt: (v.expiresAt ?? null) as number | null,
      ownerComponentId: (v.ownerComponentId ?? null) as string | null,
      status: v.status as ContinuationStatus,
      version: v.version as number,
      createdEventId: v.createdEventId as string,
      resolution: (v.resolution ?? null) as ContinuationRecord["resolution"],
    };
  }

  private async guard(
    id: string,
    requiredStatus: ContinuationStatus,
    scope: string,
    key: string,
  ): Promise<
    | { readonly kind: "not_found" }
    | { readonly kind: "already_terminal"; readonly record: ContinuationRecord }
    | { readonly kind: "proceed"; readonly stored: StoredRecord; readonly record: ContinuationRecord }
  > {
    const stored = await this.store.getRecord(COLLECTION, id);
    if (!stored) return { kind: "not_found" };
    const record = this.toRecord(stored);
    if (record.status !== requiredStatus) {
      const lastTransition = (stored.value as StoredValue).lastTransition ?? null;
      if (lastTransition && lastTransition.scope === scope && lastTransition.key === key) {
        return { kind: "proceed", stored, record };
      }
      return { kind: "already_terminal", record };
    }
    return { kind: "proceed", stored, record };
  }

  private async terminalFallback(id: string): Promise<TransitionOutcome> {
    const stored = await this.store.getRecord(COLLECTION, id);
    if (!stored) return { kind: "not_found" };
    return { kind: "already_terminal", record: this.toRecord(stored) };
  }

  private async commitCas(params: {
    readonly id: string;
    readonly stored: StoredRecord;
    readonly scope: string;
    readonly key: string;
    readonly fingerprintInput: Json;
    readonly eventId: string;
    readonly eventType: string;
    readonly eventPayload: Json;
    readonly newFields: Record<string, Json>;
    readonly outbox?: readonly OutboxIntent[];
  }): Promise<{ readonly kind: "committed" | "duplicate"; readonly record: ContinuationRecord }> {
    const { id, stored, scope, key, fingerprintInput, eventId, eventType, eventPayload, newFields, outbox } = params;
    const value = stored.value as StoredValue;
    const newValue: Record<string, Json> = { ...value, ...newFields, lastTransition: { scope, key } };
    const resultSnapshot: Json = { id, version: stored.version + 1, ...newValue };
    const occurredAt = new Date(this.now()).toISOString();

    const outcome = await this.store.commit({
      idempotency: { scope, key, fingerprint: fingerprint(fingerprintInput) },
      appends: [
        {
          streamId: `continuation-${id}`,
          expectedVersion: stored.version,
          events: [
            {
              eventId,
              eventType,
              schemaVersion: 1,
              occurredAt,
              tenant: value.tenant as string,
              correlationId: value.correlationId as string,
              causationId: value.causationId as string | null,
              runId: value.runId as string,
              scopeId: value.scopeId as string,
              payload: eventPayload,
            },
          ],
        },
      ],
      records: [{ collection: COLLECTION, id, expectedVersion: stored.version, value: newValue }],
      outbox,
      result: resultSnapshot,
    });

    if (outcome.kind === "duplicate") {
      // An erased-and-redacted transition replays a tombstone result, not a record snapshot; the
      // duplicate outcome still holds, carrying the continuation's current (redacted) state.
      const snapshot = outcome.result as Record<string, Json> | null;
      if (snapshot && snapshot.__erased !== undefined) {
        const current = await this.store.getRecord(COLLECTION, id);
        if (current) return { kind: "duplicate", record: this.toRecord(current) };
      }
      return { kind: "duplicate", record: this.recordFromSnapshot(outcome.result as Record<string, Json>) };
    }
    return { kind: "committed", record: this.recordFromSnapshot(resultSnapshot as Record<string, Json>) };
  }
}
