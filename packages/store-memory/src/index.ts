import { randomUUID, createHash } from "node:crypto";
import {
  CheckpointConflictError,
  ConcurrencyError,
  IdempotencyMismatchError,
  NotFoundError,
  RecordConflictError,
  validateNewEvent,
} from "@godspeedai/cognate-events";
import type {
  CommitOutcome,
  CommitRequest,
  DurableStore,
  Json,
  NewEvent,
  OutboxItem,
  OutboxSettlement,
  ProjectionCheckpoint,
  ProjectionCommit,
  StoredEvent,
  StoredRecord,
} from "@godspeedai/cognate-events";

function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}

function recordKey(collection: string, id: string): string {
  return `${collection}\u0000${id}`;
}

function idempotencyKey(scope: string, key: string): string {
  return `${scope}\u0000${key}`;
}

interface IdempotencyEntry {
  readonly fingerprint: string;
  readonly events: readonly StoredEvent[];
  readonly result: Json;
}

interface State {
  events: StoredEvent[];
  eventsById: Map<string, StoredEvent>;
  streams: Map<string, StoredEvent[]>;
  streamVersions: Map<string, number>;
  records: Map<string, StoredRecord>;
  outbox: Map<string, OutboxItem>;
  outboxOrder: string[];
  idempotency: Map<string, IdempotencyEntry>;
  projections: Map<string, ProjectionCheckpoint>;
  projectionState: Map<string, Map<string, Json>>;
  blobs: Map<string, Uint8Array>;
  listeners: Set<(events: readonly StoredEvent[]) => void>;
  position: number;
}

function buildStoredEvent(streamId: string, streamSequence: number, position: number, recordedAt: string, event: NewEvent): StoredEvent {
  const stored: {
    eventId: string;
    streamId: string;
    streamSequence: number;
    position: number;
    recordedAt: string;
    eventType: string;
    schemaVersion: number;
    occurredAt: string;
    tenant: string;
    correlationId: string;
    causationId: string | null;
    runId: string | null;
    scopeId: string;
    payload: Json;
    componentId?: string;
    fiberId?: string;
    semanticRef?: NewEvent["semanticRef"];
    metadata?: { readonly [key: string]: Json };
  } = {
    eventId: event.eventId ?? randomUUID(),
    streamId,
    streamSequence,
    position,
    recordedAt,
    eventType: event.eventType,
    schemaVersion: event.schemaVersion,
    occurredAt: event.occurredAt,
    tenant: event.tenant,
    correlationId: event.correlationId,
    causationId: event.causationId,
    runId: event.runId,
    scopeId: event.scopeId,
    payload: event.payload,
  };
  if (event.componentId !== undefined) stored.componentId = event.componentId;
  if (event.fiberId !== undefined) stored.fiberId = event.fiberId;
  if (event.semanticRef !== undefined) stored.semanticRef = event.semanticRef;
  if (event.metadata !== undefined) stored.metadata = event.metadata;
  return stored as StoredEvent;
}

/** In-memory `DurableStore` with the same observable semantics as the SQLite store (spec §10, §11, §13). */
export function createMemoryStore(): DurableStore {
  const state: State = {
    events: [],
    eventsById: new Map(),
    streams: new Map(),
    streamVersions: new Map(),
    records: new Map(),
    outbox: new Map(),
    outboxOrder: [],
    idempotency: new Map(),
    projections: new Map(),
    projectionState: new Map(),
    blobs: new Map(),
    listeners: new Set(),
    position: 0,
  };

  // Commits (and the mutations erasePayload/putBlob/etc. perform) must be serialized even though
  // the API is async: every call is chained onto this queue so exactly one runs at a time, in
  // call order, regardless of how many are issued concurrently.
  let queue: Promise<unknown> = Promise.resolve();
  function withLock<T>(fn: () => T): Promise<T> {
    const run = queue.then(fn, fn);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function applyAppend(streamId: string, events: readonly NewEvent[]): StoredEvent[] {
    const streamArr = state.streams.get(streamId) ?? [];
    let seq = state.streamVersions.get(streamId) ?? 0;
    const recordedAt = new Date().toISOString();
    const appended: StoredEvent[] = [];
    for (const event of events) {
      seq += 1;
      state.position += 1;
      const stored = buildStoredEvent(streamId, seq, state.position, recordedAt, event);
      streamArr.push(stored);
      state.events.push(stored);
      state.eventsById.set(stored.eventId, stored);
      appended.push(stored);
    }
    state.streams.set(streamId, streamArr);
    state.streamVersions.set(streamId, seq);
    return appended;
  }

  function doCommit(request: CommitRequest): CommitOutcome {
    for (const append of request.appends) {
      for (const event of append.events) validateNewEvent(event);
    }

    if (request.idempotency) {
      const key = idempotencyKey(request.idempotency.scope, request.idempotency.key);
      const existing = state.idempotency.get(key);
      if (existing) {
        if (existing.fingerprint !== request.idempotency.fingerprint) {
          throw new IdempotencyMismatchError(request.idempotency.scope, request.idempotency.key);
        }
        return { kind: "duplicate", events: clone(existing.events), result: clone(existing.result) };
      }
    }

    const seenStreamVersions = new Map<string, number>();
    for (const append of request.appends) {
      const base = seenStreamVersions.get(append.streamId) ?? state.streamVersions.get(append.streamId) ?? 0;
      if (append.expectedVersion !== base) throw new ConcurrencyError(append.streamId, append.expectedVersion, base);
      seenStreamVersions.set(append.streamId, base + append.events.length);
    }

    const seenRecordVersions = new Map<string, number>();
    for (const write of request.records ?? []) {
      const key = recordKey(write.collection, write.id);
      const base = seenRecordVersions.get(key) ?? state.records.get(key)?.version ?? 0;
      if (write.expectedVersion !== base) throw new RecordConflictError(write.collection, write.id, write.expectedVersion, base);
      seenRecordVersions.set(key, base + 1);
    }

    const seenOutboxIds = new Set<string>();
    for (const intent of request.outbox ?? []) {
      if (state.outbox.has(intent.id) || seenOutboxIds.has(intent.id)) {
        throw new Error(`Outbox id ${intent.id} already exists`);
      }
      seenOutboxIds.add(intent.id);
    }

    const committedEvents: StoredEvent[] = [];
    for (const append of request.appends) committedEvents.push(...applyAppend(append.streamId, append.events));

    const storedRecords: StoredRecord[] = [];
    for (const write of request.records ?? []) {
      const key = recordKey(write.collection, write.id);
      const version = (state.records.get(key)?.version ?? 0) + 1;
      const stored: StoredRecord = { collection: write.collection, id: write.id, version, value: write.value };
      state.records.set(key, stored);
      storedRecords.push(stored);
    }

    const createdAt = new Date().toISOString();
    for (const intent of request.outbox ?? []) {
      const item: OutboxItem = {
        id: intent.id,
        topic: intent.topic,
        payload: intent.payload,
        status: "pending",
        attempts: 0,
        availableAt: 0,
        lastError: null,
        receipt: null,
        createdAt,
      };
      state.outbox.set(intent.id, item);
      state.outboxOrder.push(intent.id);
    }

    const result: Json = request.result ?? null;
    if (request.idempotency) {
      const key = idempotencyKey(request.idempotency.scope, request.idempotency.key);
      state.idempotency.set(key, { fingerprint: request.idempotency.fingerprint, events: committedEvents.map(clone), result: clone(result) });
    }

    if (committedEvents.length > 0) {
      const notified = committedEvents.map(clone);
      for (const listener of state.listeners) listener(notified);
    }

    return { kind: "committed", events: clone(committedEvents), records: clone(storedRecords), result: clone(result) };
  }

  return {
    commit(request) {
      return withLock(() => doCommit(request));
    },

    async streamVersion(streamId) {
      return state.streamVersions.get(streamId) ?? 0;
    },

    async readStream(streamId, options) {
      const events = state.streams.get(streamId) ?? [];
      const afterSequence = options?.afterSequence ?? 0;
      let filtered = events.filter((e) => e.streamSequence > afterSequence);
      if (options?.limit !== undefined) filtered = filtered.slice(0, options.limit);
      return clone(filtered);
    },

    async readAll(options) {
      const afterPosition = options?.afterPosition ?? 0;
      let filtered = state.events.filter((e) => e.position > afterPosition);
      if (options?.limit !== undefined) filtered = filtered.slice(0, options.limit);
      return clone(filtered);
    },

    async getEvent(eventId) {
      return clone(state.eventsById.get(eventId));
    },

    onCommitted(listener) {
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },

    async getRecord(collection, id) {
      return clone(state.records.get(recordKey(collection, id)));
    },

    async listRecords(collection, where) {
      const results: StoredRecord[] = [];
      for (const record of state.records.values()) {
        if (record.collection !== collection) continue;
        if (where && !Object.entries(where).every(([field, value]) => record.value[field] === value)) continue;
        results.push(record);
      }
      results.sort((a, b) => compareCodePoints(a.id, b.id));
      return clone(results);
    },

    async claimOutbox(options) {
      const claimed: OutboxItem[] = [];
      for (const id of state.outboxOrder) {
        if (claimed.length >= options.limit) break;
        const item = state.outbox.get(id);
        if (!item) continue;
        if (item.topic !== options.topic) continue;
        if (item.status !== "pending") continue;
        if (item.availableAt > options.now) continue;
        const updated: OutboxItem = { ...item, attempts: item.attempts + 1, availableAt: options.now + options.leaseMs };
        state.outbox.set(id, updated);
        claimed.push(updated);
      }
      return clone(claimed);
    },

    async settleOutbox(id, settlement: OutboxSettlement) {
      const item = state.outbox.get(id);
      if (!item) throw new NotFoundError(`outbox item ${id} not found`);
      let updated: OutboxItem;
      if (settlement.kind === "delivered") {
        updated = { ...item, status: "delivered", receipt: settlement.receipt, lastError: null };
      } else if (settlement.kind === "retry") {
        updated = { ...item, status: "pending", availableAt: settlement.retryAt, lastError: settlement.error };
      } else {
        updated = { ...item, status: "poisoned", lastError: settlement.error };
      }
      state.outbox.set(id, updated);
    },

    async requeueOutbox(id, now) {
      const item = state.outbox.get(id);
      if (!item) throw new NotFoundError(`outbox item ${id} not found`);
      state.outbox.set(id, { ...item, status: "pending", availableAt: now });
    },

    async listOutbox(options) {
      let items = state.outboxOrder.map((id) => state.outbox.get(id)!).filter(Boolean);
      if (options?.topic !== undefined) items = items.filter((i) => i.topic === options.topic);
      if (options?.status !== undefined) items = items.filter((i) => i.status === options.status);
      return clone(items);
    },

    async getProjection(name) {
      return clone(state.projections.get(name));
    },

    async commitProjection(commit: ProjectionCommit) {
      const existing = state.projections.get(commit.name);
      const fromPosition = existing?.position ?? 0;
      if (commit.fromPosition !== fromPosition) {
        throw new CheckpointConflictError(`projection ${commit.name} checkpoint mismatch: expected ${fromPosition}, got ${commit.fromPosition}`);
      }
      let projectionMap = state.projectionState.get(commit.name);
      if (!projectionMap) {
        projectionMap = new Map();
        state.projectionState.set(commit.name, projectionMap);
      }
      for (const write of commit.writes) {
        if (write.value === null) projectionMap.delete(write.key);
        else projectionMap.set(write.key, write.value);
      }
      state.projections.set(commit.name, { name: commit.name, version: commit.version, position: commit.toPosition, status: "ok", error: null });
    },

    async failProjection(name, error) {
      const existing = state.projections.get(name);
      state.projections.set(name, {
        name,
        version: existing?.version ?? "",
        position: existing?.position ?? 0,
        status: "error",
        error,
      });
    },

    async readProjection(name, key) {
      return clone(state.projectionState.get(name)?.get(key));
    },

    async listProjection(name) {
      const projectionMap = state.projectionState.get(name);
      if (!projectionMap) return [];
      const entries = [...projectionMap.entries()].map(([key, value]) => ({ key, value }));
      entries.sort((a, b) => compareCodePoints(a.key, b.key));
      return clone(entries);
    },

    async resetProjection(name) {
      state.projections.delete(name);
      state.projectionState.delete(name);
    },

    async putBlob(bytes) {
      const hash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
      if (!state.blobs.has(hash)) state.blobs.set(hash, new Uint8Array(bytes));
      return hash;
    },

    async getBlob(hash) {
      const bytes = state.blobs.get(hash);
      return bytes ? new Uint8Array(bytes) : undefined;
    },

    async deleteBlob(hash) {
      state.blobs.delete(hash);
    },

    erasePayload(eventId, reason, actorId) {
      return withLock(() => {
        const event = state.eventsById.get(eventId);
        if (!event) throw new NotFoundError(`event ${eventId} not found`);
        const erasedAt = new Date().toISOString();
        const updated: StoredEvent = { ...event, payload: null, erasure: { reason, erasedAt } };
        state.eventsById.set(eventId, updated);
        const positionIndex = state.events.findIndex((e) => e.eventId === eventId);
        if (positionIndex >= 0) state.events[positionIndex] = updated;
        const streamArr = state.streams.get(event.streamId);
        if (streamArr) {
          const streamIndex = streamArr.findIndex((e) => e.eventId === eventId);
          if (streamIndex >= 0) streamArr[streamIndex] = updated;
        }
        const tombstone: NewEvent = {
          eventType: "erasure.recorded",
          schemaVersion: 1,
          occurredAt: erasedAt,
          tenant: event.tenant,
          correlationId: event.correlationId,
          causationId: null,
          runId: event.runId,
          scopeId: event.scopeId,
          payload: { eventId, reason, actorId },
        };
        const [recorded] = applyAppend("$erasures", [tombstone]);
        if (recorded) {
          const notified = [clone(recorded)];
          for (const listener of state.listeners) listener(notified);
        }
      });
    },

    async close() {
      state.listeners.clear();
    },
  };
}

/** Code-point order (= UTF-8 byte order), matching SQLite's BINARY collation; plain `<` compares UTF-16 units. */
function compareCodePoints(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}
