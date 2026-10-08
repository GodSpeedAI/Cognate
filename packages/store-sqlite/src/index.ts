// Authoritative DurableStore on bun:sqlite (spec §13). Single-process writer; see README.md.
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { ConcurrencyError, RecordConflictError, IdempotencyMismatchError, CheckpointConflictError, NotFoundError, validateNewEvent } from "@godspeedai/events";
import type {
  DurableStore,
  NewEvent,
  StoredEvent,
  RecordWrite,
  StoredRecord,
  CommitRequest,
  CommitOutcome,
  OutboxItem,
  OutboxStatus,
  OutboxSettlement,
  ProjectionCheckpoint,
  ProjectionCommit,
  Json,
} from "@godspeedai/events";
import { migrate } from "./schema.ts";

export interface SqliteStoreOptions {
  /** Database file path, or ":memory:". */
  readonly path: string;
}

// A row shape as returned by bun:sqlite; kept loosely typed at the boundary and mapped
// into the exact DurableStore shapes below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const EVENT_SELECT = "SELECT e.*, p.payload AS payload FROM events e LEFT JOIN payloads p ON p.event_id = e.event_id";

function mapEventRow(row: Row): StoredEvent {
  const event: Row = {
    eventId: row.event_id,
    streamId: row.stream_id,
    streamSequence: row.stream_sequence,
    position: row.position,
    eventType: row.event_type,
    schemaVersion: row.schema_version,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    tenant: row.tenant,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    runId: row.run_id,
    scopeId: row.scope_id,
    payload: row.payload != null ? JSON.parse(row.payload as string) : null,
  };
  if (row.component_id != null) event.componentId = row.component_id;
  if (row.fiber_id != null) event.fiberId = row.fiber_id;
  if (row.semantic_ref != null) event.semanticRef = JSON.parse(row.semantic_ref as string);
  if (row.metadata != null) event.metadata = JSON.parse(row.metadata as string);
  if (row.erasure_reason != null) event.erasure = { reason: row.erasure_reason, erasedAt: row.erasure_at };
  return event as StoredEvent;
}

function mapRecordRow(row: Row): StoredRecord {
  return { collection: row.collection, id: row.id, version: row.version, value: JSON.parse(row.value as string) };
}

// Priority order, most to least selective: a correlationId (one thread/session) or agent narrows to a small
// slice of the tenant's runs; tenant alone is the least selective (every run of that tenant), so it is only
// picked when nothing more selective was asked for. Field iteration order in `where` must not decide this —
// runtime-bun always builds `{ tenant, correlationId?, agent? }` with tenant first.
const RUNS_INDEX_PRIORITY: readonly (readonly [string, string])[] = [
  ["correlationId", "records_runs_correlation_idx"],
  ["agent", "records_runs_agent_idx"],
  ["tenant", "records_runs_tenant_idx"],
];

/**
 * Builds the exact SQL `listRecords` executes (exported so tests can prove, via `EXPLAIN QUERY PLAN` on this
 * same text, which index the real code path chooses — not a hand-written approximation of it).
 *
 * Equality filters push down as `json_extract(value, '$.<field>')` so a matching field can be served by an
 * expression index (schema.ts migration 3) instead of loading every row in the collection and filtering in
 * JS. The partial indexes are conditioned on a literal `collection = 'runs'`, which SQLite only matches
 * against a literal in the query (a bound `?` parameter defeats partial-index selection even when its value
 * happens to be "runs"), so a collection name safe to embed literally is inlined. Without an `INDEXED BY`
 * hint, SQLite's planner may still favor the always-present `(collection, id)` primary key over a selective
 * partial index on a small table (no `ANALYZE` statistics); the hint keeps the lookup scoped to the matching
 * slice of runs regardless of table size, which is the DEBT-019 concern.
 */
export function buildListRecordsQuery(collection: string, where?: { readonly [field: string]: string | number | boolean | null }): { readonly sql: string; readonly params: readonly unknown[] } {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(collection)) throw new Error(`listRecords: invalid collection name "${collection}"`);
  const indexHint = collection === "runs" && where ? RUNS_INDEX_PRIORITY.find(([f]) => f in where)?.[1] : undefined;
  let sql = `SELECT * FROM records${indexHint ? ` INDEXED BY ${indexHint}` : ""} WHERE collection = '${collection}'`;
  const params: unknown[] = [];
  for (const [field, value] of Object.entries(where ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) throw new Error(`listRecords: invalid field name "${field}"`);
    sql += value === null ? ` AND json_extract(value, '$.${field}') IS NULL` : ` AND json_extract(value, '$.${field}') = ?`;
    if (value !== null) params.push(value);
  }
  sql += " ORDER BY id";
  return { sql, params };
}

function mapOutboxRow(row: Row): OutboxItem {
  return {
    id: row.id,
    topic: row.topic,
    payload: JSON.parse(row.payload as string),
    status: row.status as OutboxStatus,
    attempts: row.attempts,
    availableAt: row.claimed_until,
    lastError: row.last_error ?? null,
    receipt: row.receipt != null ? JSON.parse(row.receipt as string) : null,
    createdAt: row.created_at,
  };
}

function mapCheckpointRow(row: Row): ProjectionCheckpoint {
  return {
    name: row.name,
    version: row.version,
    position: row.position,
    status: row.status,
    error: row.error_event_id != null ? { position: row.error_position, eventId: row.error_event_id, message: row.error_message } : null,
  };
}

export function openSqliteStore(options: SqliteStoreOptions): DurableStore {
  const db = new Database(options.path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  // Durability over speed: fsync on every commit (spec §31.2 "fail closed" — a decision must
  // never be reported committed before SQLite has actually persisted it). WAL + synchronous=FULL
  // fsyncs the WAL on every transaction commit, so a crash cannot lose or reorder a committed decision.
  db.exec("PRAGMA synchronous = FULL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  // Erased payload bytes are overwritten in place rather than merely unlinked, so `erasePayload`
  // (spec §32) leaves nothing recoverable from freed pages once the WAL is checkpointed.
  db.exec("PRAGMA secure_delete = ON");
  migrate(db);

  let closed = false;
  const listeners = new Set<(events: readonly StoredEvent[]) => void>();

  function assertOpen(): void {
    if (closed) throw new Error("store-sqlite: store is closed");
  }

  function ensureStream(streamId: string): void {
    db.query("INSERT OR IGNORE INTO event_streams (stream_id, version) VALUES (?, 0)").run(streamId);
  }

  function streamVersionRow(streamId: string): number {
    const row = db.query("SELECT version FROM event_streams WHERE stream_id = ?").get(streamId) as { version: number } | null;
    return row?.version ?? 0;
  }

  function insertEventRow(streamId: string, sequence: number, event: NewEvent, recordedAt: string): StoredEvent {
    const eventId = event.eventId ?? crypto.randomUUID();
    db.query(
      `INSERT INTO events (event_id, stream_id, stream_sequence, event_type, schema_version, occurred_at, recorded_at, tenant, correlation_id, causation_id, run_id, scope_id, component_id, fiber_id, semantic_ref, metadata)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      eventId,
      streamId,
      sequence,
      event.eventType,
      event.schemaVersion,
      event.occurredAt,
      recordedAt,
      event.tenant,
      event.correlationId,
      event.causationId,
      event.runId,
      event.scopeId,
      event.componentId ?? null,
      event.fiberId ?? null,
      event.semanticRef ? JSON.stringify(event.semanticRef) : null,
      event.metadata ? JSON.stringify(event.metadata) : null,
    );
    db.query("INSERT INTO payloads (event_id, payload) VALUES (?, ?)").run(eventId, JSON.stringify(event.payload));
    const row = db.query(`${EVENT_SELECT} WHERE e.event_id = ?`).get(eventId) as Row;
    return mapEventRow(row);
  }

  function applyRecordWrite(write: RecordWrite): StoredRecord {
    const row = db.query("SELECT version FROM records WHERE collection = ? AND id = ?").get(write.collection, write.id) as { version: number } | null;
    const current = row?.version ?? 0;
    if (current !== write.expectedVersion) throw new RecordConflictError(write.collection, write.id, write.expectedVersion, current);
    const version = current + 1;
    db.query(
      `INSERT INTO records (collection, id, version, value) VALUES (?, ?, ?, ?)
       ON CONFLICT (collection, id) DO UPDATE SET version = excluded.version, value = excluded.value`,
    ).run(write.collection, write.id, version, JSON.stringify(write.value));
    return { collection: write.collection, id: write.id, version, value: write.value };
  }

  const commitTxn = db.transaction((request: CommitRequest): CommitOutcome => {
    // Phase A — validate every envelope before anything is written (spec §10).
    for (const append of request.appends) for (const event of append.events) validateNewEvent(event);

    // Phase B — idempotency: duplicate replays the recorded result; a fingerprint mismatch is an error.
    if (request.idempotency) {
      const existing = db
        .query("SELECT fingerprint, result, event_ids FROM idempotency WHERE scope = ? AND key = ?")
        .get(request.idempotency.scope, request.idempotency.key) as { fingerprint: string; result: string; event_ids: string } | null;
      if (existing) {
        if (existing.fingerprint !== request.idempotency.fingerprint) {
          throw new IdempotencyMismatchError(request.idempotency.scope, request.idempotency.key);
        }
        const ids = JSON.parse(existing.event_ids) as string[];
        const events = ids.map((id) => mapEventRow(db.query(`${EVENT_SELECT} WHERE e.event_id = ?`).get(id) as Row));
        return { kind: "duplicate", events, result: JSON.parse(existing.result) as Json };
      }
    }

    // Phase C — CAS every stream's expected version before writing any event.
    const streamVersions = new Map<string, number>();
    for (const append of request.appends) {
      ensureStream(append.streamId);
      const current = streamVersionRow(append.streamId);
      if (current !== append.expectedVersion) throw new ConcurrencyError(append.streamId, append.expectedVersion, current);
      streamVersions.set(append.streamId, current);
    }

    // Phase D — CAS every record write before applying any of them.
    for (const write of request.records ?? []) {
      const row = db.query("SELECT version FROM records WHERE collection = ? AND id = ?").get(write.collection, write.id) as { version: number } | null;
      const current = row?.version ?? 0;
      if (current !== write.expectedVersion) throw new RecordConflictError(write.collection, write.id, write.expectedVersion, current);
    }

    // Phase E — insert events; the store assigns sequence/position/id/recordedAt.
    const recordedAt = new Date().toISOString();
    const storedEvents: StoredEvent[] = [];
    for (const append of request.appends) {
      let sequence = streamVersions.get(append.streamId) ?? 0;
      for (const event of append.events) {
        sequence += 1;
        storedEvents.push(insertEventRow(append.streamId, sequence, event, recordedAt));
      }
      db.query("UPDATE event_streams SET version = ? WHERE stream_id = ?").run(sequence, append.streamId);
    }

    // Phase F — apply record writes (already validated above).
    const storedRecords = (request.records ?? []).map((write) => applyRecordWrite(write));

    // Phase G — outbox intents; a reused id fails the whole decision (unique constraint).
    for (const item of request.outbox ?? []) {
      db.query("INSERT INTO outbox (id, topic, payload, created_at) VALUES (?, ?, ?, ?)").run(item.id, item.topic, JSON.stringify(item.payload), recordedAt);
    }

    // Phase H — record the idempotency key against the result and the events it produced.
    const result: Json = request.result ?? null;
    if (request.idempotency) {
      db.query("INSERT INTO idempotency (scope, key, fingerprint, result, event_ids, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        request.idempotency.scope,
        request.idempotency.key,
        request.idempotency.fingerprint,
        JSON.stringify(result),
        JSON.stringify(storedEvents.map((e) => e.eventId)),
        recordedAt,
      );
    }

    return { kind: "committed", events: storedEvents, records: storedRecords, result };
  });

  const claimOutboxTxn = db.transaction((topic: string, now: number, limit: number, leaseMs: number): OutboxItem[] => {
    const rows = db.query("SELECT * FROM outbox WHERE topic = ? AND status = 'pending' AND claimed_until <= ? ORDER BY rowid LIMIT ?").all(topic, now, limit) as Row[];
    const claimedUntil = now + leaseMs;
    const items: OutboxItem[] = [];
    for (const row of rows) {
      db.query("UPDATE outbox SET attempts = attempts + 1, claimed_until = ? WHERE id = ?").run(claimedUntil, row.id);
      items.push(mapOutboxRow({ ...row, attempts: row.attempts + 1, claimed_until: claimedUntil }));
    }
    return items;
  });

  const settleOutboxTxn = db.transaction((id: string, settlement: OutboxSettlement): void => {
    if (settlement.kind === "delivered") {
      db.query("UPDATE outbox SET status = 'delivered', receipt = ? WHERE id = ?").run(JSON.stringify(settlement.receipt), id);
    } else if (settlement.kind === "retry") {
      db.query("UPDATE outbox SET last_error = ?, claimed_until = ? WHERE id = ?").run(settlement.error, settlement.retryAt, id);
    } else {
      db.query("UPDATE outbox SET status = 'poisoned', last_error = ? WHERE id = ?").run(settlement.error, id);
    }
  });

  const commitProjectionTxn = db.transaction((commitReq: ProjectionCommit): void => {
    const row = db.query("SELECT position FROM projection_checkpoints WHERE name = ?").get(commitReq.name) as { position: number } | null;
    const current = row?.position ?? 0;
    if (current !== commitReq.fromPosition) {
      throw new CheckpointConflictError(`Projection ${commitReq.name} checkpoint is at ${current}, expected ${commitReq.fromPosition}`);
    }
    for (const write of commitReq.writes) {
      if (write.value === null) {
        db.query("DELETE FROM projection_state WHERE name = ? AND key = ?").run(commitReq.name, write.key);
      } else {
        db.query(
          `INSERT INTO projection_state (name, key, value) VALUES (?, ?, ?)
           ON CONFLICT (name, key) DO UPDATE SET value = excluded.value`,
        ).run(commitReq.name, write.key, JSON.stringify(write.value));
      }
    }
    db.query(
      `INSERT INTO projection_checkpoints (name, version, position, status, error_position, error_event_id, error_message)
       VALUES (?, ?, ?, 'ok', NULL, NULL, NULL)
       ON CONFLICT (name) DO UPDATE SET version = excluded.version, position = excluded.position, status = 'ok', error_position = NULL, error_event_id = NULL, error_message = NULL`,
    ).run(commitReq.name, commitReq.version, commitReq.toPosition);
  });

  const erasePayloadTxn = db.transaction((eventId: string, reason: string, actorId: string): StoredEvent => {
    const original = db.query(`${EVENT_SELECT} WHERE e.event_id = ?`).get(eventId) as Row;
    if (!original) throw new NotFoundError(`event ${eventId} not found`);
    const erasedAt = new Date().toISOString();
    db.query("DELETE FROM payloads WHERE event_id = ?").run(eventId);
    db.query("UPDATE events SET erasure_reason = ?, erasure_at = ? WHERE event_id = ?").run(reason, erasedAt, eventId);

    ensureStream("$erasures");
    const sequence = streamVersionRow("$erasures") + 1;
    const tombstone = insertEventRow(
      "$erasures",
      sequence,
      {
        eventType: "erasure.recorded",
        schemaVersion: 1,
        occurredAt: erasedAt,
        tenant: original.tenant,
        correlationId: original.correlation_id,
        causationId: original.event_id,
        runId: original.run_id,
        scopeId: original.scope_id,
        payload: { eventId, reason, actorId },
      },
      erasedAt,
    );
    db.query("UPDATE event_streams SET version = ? WHERE stream_id = ?").run(sequence, "$erasures");
    return tombstone;
  });

  const store: DurableStore = {
    async commit(request: CommitRequest): Promise<CommitOutcome> {
      assertOpen();
      const outcome = commitTxn.immediate(request);
      if (outcome.kind === "committed" && outcome.events.length > 0) {
        for (const listener of listeners) listener(outcome.events);
      }
      return outcome;
    },

    async streamVersion(streamId: string): Promise<number> {
      assertOpen();
      return streamVersionRow(streamId);
    },

    async readStream(streamId: string, options?: { readonly afterSequence?: number; readonly limit?: number }): Promise<StoredEvent[]> {
      assertOpen();
      let sql = `${EVENT_SELECT} WHERE e.stream_id = ?`;
      const params: unknown[] = [streamId];
      if (options?.afterSequence != null) {
        sql += " AND e.stream_sequence > ?";
        params.push(options.afterSequence);
      }
      sql += " ORDER BY e.stream_sequence";
      if (options?.limit != null) {
        sql += " LIMIT ?";
        params.push(options.limit);
      }
      const rows = db.query(sql).all(...(params as [])) as Row[];
      return rows.map(mapEventRow);
    },

    async readAll(options?: { readonly afterPosition?: number; readonly limit?: number }): Promise<StoredEvent[]> {
      assertOpen();
      let sql = `${EVENT_SELECT} WHERE 1 = 1`;
      const params: unknown[] = [];
      if (options?.afterPosition != null) {
        sql += " AND e.position > ?";
        params.push(options.afterPosition);
      }
      sql += " ORDER BY e.position";
      if (options?.limit != null) {
        sql += " LIMIT ?";
        params.push(options.limit);
      }
      const rows = db.query(sql).all(...(params as [])) as Row[];
      return rows.map(mapEventRow);
    },

    async getEvent(eventId: string): Promise<StoredEvent | undefined> {
      assertOpen();
      const row = db.query(`${EVENT_SELECT} WHERE e.event_id = ?`).get(eventId) as Row;
      return row ? mapEventRow(row) : undefined;
    },

    onCommitted(listener: (events: readonly StoredEvent[]) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async getRecord(collection: string, id: string): Promise<StoredRecord | undefined> {
      assertOpen();
      const row = db.query("SELECT * FROM records WHERE collection = ? AND id = ?").get(collection, id) as Row;
      return row ? mapRecordRow(row) : undefined;
    },

    async listRecords(collection: string, where?: { readonly [field: string]: string | number | boolean | null }): Promise<StoredRecord[]> {
      assertOpen();
      const { sql, params } = buildListRecordsQuery(collection, where);
      const rows = db.query(sql).all(...(params as [])) as Row[];
      return rows.map(mapRecordRow);
    },

    async claimOutbox(options: { readonly topic: string; readonly now: number; readonly limit: number; readonly leaseMs: number }): Promise<OutboxItem[]> {
      assertOpen();
      return claimOutboxTxn.immediate(options.topic, options.now, options.limit, options.leaseMs);
    },

    async settleOutbox(id: string, settlement: OutboxSettlement): Promise<void> {
      assertOpen();
      settleOutboxTxn.immediate(id, settlement);
    },

    async requeueOutbox(id: string, now: number): Promise<void> {
      assertOpen();
      db.query("UPDATE outbox SET status = 'pending', claimed_until = ? WHERE id = ?").run(now, id);
    },

    async listOutbox(options?: { readonly topic?: string; readonly status?: OutboxStatus }): Promise<OutboxItem[]> {
      assertOpen();
      let sql = "SELECT * FROM outbox WHERE 1 = 1";
      const params: unknown[] = [];
      if (options?.topic != null) {
        sql += " AND topic = ?";
        params.push(options.topic);
      }
      if (options?.status != null) {
        sql += " AND status = ?";
        params.push(options.status);
      }
      sql += " ORDER BY rowid";
      const rows = db.query(sql).all(...(params as [])) as Row[];
      return rows.map(mapOutboxRow);
    },

    async getProjection(name: string): Promise<ProjectionCheckpoint | undefined> {
      assertOpen();
      const row = db.query("SELECT * FROM projection_checkpoints WHERE name = ?").get(name) as Row;
      return row ? mapCheckpointRow(row) : undefined;
    },

    async commitProjection(commitReq: ProjectionCommit): Promise<void> {
      assertOpen();
      commitProjectionTxn.immediate(commitReq);
    },

    async failProjection(name: string, error: { readonly position: number; readonly eventId: string; readonly message: string }): Promise<void> {
      assertOpen();
      db.query(
        `INSERT INTO projection_checkpoints (name, version, position, status, error_position, error_event_id, error_message)
         VALUES (?, '', 0, 'error', ?, ?, ?)
         ON CONFLICT (name) DO UPDATE SET status = 'error', error_position = excluded.error_position, error_event_id = excluded.error_event_id, error_message = excluded.error_message`,
      ).run(name, error.position, error.eventId, error.message);
    },

    async readProjection(name: string, key: string): Promise<Json | undefined> {
      assertOpen();
      const row = db.query("SELECT value FROM projection_state WHERE name = ? AND key = ?").get(name, key) as { value: string } | null;
      return row ? (JSON.parse(row.value) as Json) : undefined;
    },

    async listProjection(name: string): Promise<{ readonly key: string; readonly value: Json }[]> {
      assertOpen();
      const rows = db.query("SELECT key, value FROM projection_state WHERE name = ? ORDER BY key").all(name) as Row[];
      return rows.map((row) => ({ key: row.key, value: JSON.parse(row.value) as Json }));
    },

    async resetProjection(name: string): Promise<void> {
      assertOpen();
      const txn = db.transaction((n: string): void => {
        db.query("DELETE FROM projection_state WHERE name = ?").run(n);
        db.query("DELETE FROM projection_checkpoints WHERE name = ?").run(n);
      });
      txn.immediate(name);
    },

    async putBlob(bytes: Uint8Array): Promise<string> {
      assertOpen();
      const hash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
      db.query("INSERT OR IGNORE INTO blobs (hash, bytes) VALUES (?, ?)").run(hash, bytes);
      return hash;
    },

    async getBlob(hash: string): Promise<Uint8Array | undefined> {
      assertOpen();
      const row = db.query("SELECT bytes FROM blobs WHERE hash = ?").get(hash) as { bytes: Uint8Array } | null;
      return row ? new Uint8Array(row.bytes) : undefined;
    },

    async deleteBlob(hash: string): Promise<void> {
      assertOpen();
      db.query("DELETE FROM blobs WHERE hash = ?").run(hash);
    },

    async erasePayload(eventId: string, reason: string, actorId: string): Promise<void> {
      assertOpen();
      const tombstone = erasePayloadTxn.immediate(eventId, reason, actorId);
      // Flush and truncate the WAL so the secure-delete-zeroed pages (and the tombstone) are the
      // only trace left on disk; the erased plaintext must not linger in either file (spec §32).
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      for (const listener of listeners) listener([tombstone]);
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      db.close();
    },
  };

  return store;
}
