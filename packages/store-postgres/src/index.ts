// Authoritative DurableStore on PostgreSQL (spec §13). Multi-process writers; see README.md.
//
// Position order equals commit order across processes: every commit that appends events first locks the
// single position-counter row (`FOR UPDATE`, held until commit), so concurrent appenders queue on that row
// and positions are assigned in exactly the order their transactions commit. Aborted transactions roll their
// allocation back, keeping positions gap-free like SQLite's rowid. Only event-appends serialize on the
// counter; record writes, outbox claims, projection folds, and blob writes stay fully concurrent.
//
// `onCommitted` fires for local commits exactly like the SQLite store, and additionally for commits made by
// other processes: each committing transaction queues one `pg_notify` (sent only when the transaction
// commits), and a LISTEN connection drains the durable event log from the subscriber's cursor. The drain is
// cursor-based, so a lost notification or a disconnect recovers on the next notification or the poll safety
// net — the notification accelerates delivery, the log remains the truth.
import { createHash } from "node:crypto";
import postgres from "postgres";
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
  OutboxItem,
  OutboxSettlement,
  OutboxStatus,
  ProjectionCheckpoint,
  ProjectionCommit,
  StoredEvent,
  StoredRecord,
} from "@godspeedai/cognate-events";
import { migrations, POSITION_COUNTER_ID } from "./schema.ts";
export { findPg0Bin, resolvePg0Url, type Pg0Options } from "./pg0.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export interface PostgresStoreOptions {
  /** PostgreSQL connection URL, e.g. `postgres://postgres:postgres@127.0.0.1:5432/postgres`. */
  readonly url: string;
  /** Schema holding the Cognate tables; created if absent (default `cognate`). Tests isolate per schema. */
  readonly schema?: string;
  /** Connection pool size (default 10). */
  readonly maxConnections?: number;
  /**
   * Safety-net poll interval (ms) for cross-process commit wake-ups behind LISTEN/NOTIFY (default 250).
   * Notifications accelerate delivery; this bounds staleness when one is lost. 0 disables the timer.
   */
  readonly pollMs?: number;
}

export class PostgresStoreError extends Error {
  override readonly name = "PostgresStoreError";
  constructor(message: string) {
    super(message);
  }
}

// A loser of a concurrent same-key idempotency commit: its own transaction rolled back, and it now
// replays the winner's recorded result (or mismatches, identically) from the committed row.
class DuplicateRaceError extends Error {
  constructor(
    readonly scope: string,
    readonly key: string,
    readonly fingerprint: string,
  ) {
    super(`idempotency race on ${scope}:${key}`);
  }
}

// BigInt columns come back as strings (postgres.js default); every mapping funnels through here.
function num(value: string | number | bigint): number {
  return typeof value === "number" ? value : Number(value);
}

// jsonb values arrive as strings or parsed objects depending on the driver's per-connection type
// fetching; normalize at the boundary so mappings are deterministic either way.
function json<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function mapEventRow(row: Row): StoredEvent {
  const event: Row = {
    eventId: row.event_id,
    streamId: row.stream_id,
    streamSequence: num(row.stream_sequence),
    position: num(row.position),
    eventType: row.event_type,
    schemaVersion: row.schema_version,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    tenant: row.tenant,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    runId: row.run_id,
    scopeId: row.scope_id,
    payload: row.payload_text == null ? null : json(row.payload_text),
  };
  if (row.component_id != null) event.componentId = row.component_id;
  if (row.fiber_id != null) event.fiberId = row.fiber_id;
  if (row.semantic_ref_text != null) event.semanticRef = json(row.semantic_ref_text);
  if (row.metadata_text != null) event.metadata = json(row.metadata_text);
  if (row.erasure_reason != null) event.erasure = { reason: row.erasure_reason, erasedAt: row.erasure_at };
  return event as StoredEvent;
}

function mapRecordRow(row: Row): StoredRecord {
  return { collection: row.collection, id: row.id, version: row.version, value: json(row.value_text) };
}

function mapOutboxRow(row: Row): OutboxItem {
  return {
    id: row.id,
    topic: row.topic,
    payload: json(row.payload_text),
    status: row.status as OutboxStatus,
    attempts: row.attempts,
    availableAt: num(row.claimed_until),
    lastError: row.last_error ?? null,
    receipt: row.receipt_text == null ? null : json(row.receipt_text),
    createdAt: row.created_at,
  };
}

function mapCheckpointRow(row: Row): ProjectionCheckpoint {
  return {
    name: row.name,
    version: row.version,
    position: num(row.position),
    status: row.status,
    error: row.error_event_id != null ? { position: num(row.error_position), eventId: row.error_event_id, message: row.error_message } : null,
  };
}

export interface PostgresStoreHandle {
  readonly store: DurableStore;
  /** Drop the store's schema and every table in it (derived and authoritative alike). */
  readonly dropSchema: () => Promise<void>;
  close(): Promise<void>;
}

export async function openPostgresStore(options: PostgresStoreOptions): Promise<PostgresStoreHandle> {
  const schema = options.schema ?? "cognate";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new PostgresStoreError(`invalid PostgreSQL schema name "${schema}"`);
  // A not-yet-opened sql instance cannot escape identifiers, so the schema/table names are validated
  // above and spliced as literal text (qualified with the escaped schema via fragments below).
  const sql = postgres(options.url, {
    max: options.maxConnections ?? 10,
    onnotice: () => {},
    // Durability over speed: PostgreSQL's defaults (synchronous_commit=on, fsync=on, full_page_writes=on)
    // persist a committed decision before the store reports it (spec §31.2); nothing here relaxes them.
  });
  type Fragment = postgres.Fragment;
  const id = (table: string): Fragment => sql`${sql(schema)}.${sql(table)}`;
  const t = {
    streams: id("streams"),
    events: id("events"),
    payloads: id("payloads"),
    idempotency: id("idempotency"),
    records: id("records"),
    outbox: id("outbox"),
    checkpoints: id("projection_checkpoints"),
    projectionState: id("projection_state"),
    blobs: id("blobs"),
    meta: id("store_meta"),
    schemaVersions: id("schema_versions"),
  };
  // LEFT JOIN so an erased (deleted) payload reads as null while the envelope survives (spec §32).
  // jsonb columns are cast to ::text so the mapping layer always parses exactly once — the driver's
  // jsonb pre-parsing varies with connection type fetching, which would otherwise make `json()`
  // ambiguous between raw JSON text and an already-parsed value.
  const eventSelect = sql`SELECT e.*, e.semantic_ref::text AS semantic_ref_text, e.metadata::text AS metadata_text, p.payload::text AS payload_text FROM ${t.events} e LEFT JOIN ${t.payloads} p ON p.event_id = e.event_id`;

  // sql.json(null) binds SQL NULL, but JSON null is a real value in NOT NULL jsonb columns (payloads,
  // idempotency results); render it as the 'null' jsonb literal instead.
  const jsonb = (value: Json): Fragment => (value === null ? sql`'null'::jsonb` : sql`${sql.json(value)}::jsonb`);

  await migrate(sql, schema, t.schemaVersions);

  let closed = false;
  const listeners = new Set<(events: readonly StoredEvent[]) => void>();

  function assertOpen(): void {
    if (closed) throw new PostgresStoreError("store-postgres: store is closed");
  }

  // ── Cross-process commit fan-out ────────────────────────────────────────────────

  const channel = `${schema}_committed`;
  // PostgreSQL notifies the sending session too, so a commit must be delivered to local listeners
  // exactly once: the local path advances the cursor and invokes listeners directly, and the drain
  // skips notifications carrying this store's own instance id.
  const instanceId = crypto.randomUUID();
  let cursor = 0;
  let cursorReady = false;
  let draining: Promise<void> = Promise.resolve();
  let stopPoll: (() => void) | undefined;

  async function maxPosition(): Promise<number> {
    const rows = await sql`SELECT max(position) AS max FROM ${t.events}`;
    return rows[0]?.max == null ? 0 : num(rows[0].max);
  }

  function drainFrom(): Promise<void> {
    // Serialized drain: notifications for successive commits drain in position order, at least once.
    const run = draining.then(async () => {
      if (!cursorReady || closed) return;
      for (;;) {
        const page = await sql`${eventSelect} WHERE e.position > ${cursor} ORDER BY e.position LIMIT 256`;
        if (page.length === 0 || closed) return;
        const batch = page.map((row: Row) => mapEventRow(row));
        cursor = batch[batch.length - 1]!.position;
        for (const listener of listeners) listener(batch);
        if (page.length < 256) return;
      }
    });
    draining = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  const listenMeta = await sql.listen(
    channel,
    (payload: string) => {
      try {
        const notice = JSON.parse(payload) as { readonly from?: number; readonly to?: number; readonly source?: string };
        if (notice.source === instanceId) return; // already delivered by the local commit path
      } catch {
        // Malformed payload: fall through to a cursor-based drain, which is always safe.
      }
      void drainFrom();
    },
    () => {
      // (Re-)subscribed: first subscribe or reconnect. Only commits after this moment are delivered —
      // matching the local-listener contract. A commit that notified before this read is behind the
      // cursor and correctly filtered.
      void maxPosition().then((max) => {
        if (!cursorReady) {
          cursor = max;
          cursorReady = true;
        }
      });
    },
  );

  if ((options.pollMs ?? 250) > 0) {
    const ms = options.pollMs ?? 250;
    const timer = setInterval(() => {
      if (!cursorReady || closed) return;
      void maxPosition()
        .then((max) => {
          if (max > cursor) void drainFrom();
        })
        .catch(() => {});
    }, ms);
    stopPoll = () => clearInterval(timer);
  }

  // ── Commit ──────────────────────────────────────────────────────────────────────

  async function commit(request: CommitRequest): Promise<CommitOutcome> {
    const appends = request.appends ?? [];
    // Phase A (pre-transaction, mirrors the SQLite store): every envelope is validated before anything
    // is written, so a bad envelope cannot even open a transaction.
    for (const append of appends) for (const event of append.events) validateNewEvent(event);

    const eventCount = appends.reduce((total, append) => total + append.events.length, 0);

    // Phase B (fast path) — a committed idempotency key replays outside the write transaction. A
    // concurrent same-key race is re-checked under serialization below, because a loser that passed
    // this check must not reach the stream CAS before discovering the winner (the SQLite store checks
    // idempotency inside BEGIN IMMEDIATE; this re-check preserves that order).
    if (request.idempotency) {
      const settled = await readIdempotencyRecord(sql, request.idempotency);
      if (settled) return settled;
    }

    let outcome: CommitOutcome | undefined;
    await sql.begin(async (tx) => {
      let firstPosition = 0;
      if (eventCount > 0) {
        // Lock the position counter FIRST: the lock is held until commit, so allocation order is commit
        // order, and every CAS below observes exactly the state left by the previous appender.
        const counter = await tx`UPDATE ${t.meta} SET next_position = next_position + ${eventCount} WHERE id = ${POSITION_COUNTER_ID} RETURNING next_position - ${eventCount} AS base`;
        firstPosition = num(counter[0]!.base);
      }

      // Phase B (serialized) — replay or mismatch the idempotency key before any CAS, exactly where the
      // SQLite store checks it. A loser of a same-key race lands here after the winner committed.
      if (request.idempotency) {
        const settled = await readIdempotencyRecord(tx, request.idempotency);
        if (settled) {
          outcome = settled;
          return;
        }
      }

      // Phase C — CAS every stream's expected version before writing any event (empty appends included,
      // like the SQLite store). Appends are serialized by the counter lock, so read-modify-write here
      // cannot interleave with another appender.
      const streamVersions = new Map<string, number>();
      for (const append of appends) {
        await tx`INSERT INTO ${t.streams} (stream_id, version) VALUES (${append.streamId}, 0) ON CONFLICT (stream_id) DO NOTHING`;
        const rows = await tx`SELECT version FROM ${t.streams} WHERE stream_id = ${append.streamId} FOR UPDATE`;
        const current = num(rows[0]!.version);
        if (current !== append.expectedVersion) throw new ConcurrencyError(append.streamId, append.expectedVersion, current);
        streamVersions.set(append.streamId, current);
      }

      // Phase D — CAS every record write before applying any of them. Record-only commits do not take the
      // counter lock, so the upsert in Phase F re-verifies atomically (WHERE version = expected).
      for (const write of request.records ?? []) {
        const rows = await tx`SELECT version FROM ${t.records} WHERE collection = ${write.collection} AND id = ${write.id}`;
        const current = rows.length > 0 ? num(rows[0]!.version) : 0;
        if (current !== write.expectedVersion) throw new RecordConflictError(write.collection, write.id, write.expectedVersion, current);
      }

      // Phase E — insert events; the store assigns sequence/position/id/recorded time.
      const recordedAt = new Date().toISOString();
      const storedEvents: StoredEvent[] = [];
      let position = firstPosition - 1;
      for (const append of appends) {
        let sequence = streamVersions.get(append.streamId) ?? 0;
        for (const event of append.events) {
          sequence += 1;
          position += 1;
          const eventId = event.eventId ?? crypto.randomUUID();
          await tx`INSERT INTO ${t.events} (position, event_id, stream_id, stream_sequence, event_type, schema_version, occurred_at, recorded_at, tenant, correlation_id, causation_id, run_id, scope_id, component_id, fiber_id, semantic_ref, metadata)
            VALUES (${position}, ${eventId}, ${append.streamId}, ${sequence}, ${event.eventType}, ${event.schemaVersion}, ${event.occurredAt}, ${recordedAt}, ${event.tenant}, ${event.correlationId}, ${event.causationId}, ${event.runId}, ${event.scopeId}, ${event.componentId ?? null}, ${event.fiberId ?? null}, ${event.semanticRef ? sql.json(event.semanticRef as unknown as Json) : null}::jsonb, ${event.metadata ? sql.json(event.metadata) : null}::jsonb)`;
          await tx`INSERT INTO ${t.payloads} (event_id, payload) VALUES (${eventId}, ${jsonb(event.payload)})`;
          storedEvents.push(
            mapEventRow({
              event_id: eventId,
              stream_id: append.streamId,
              stream_sequence: sequence,
              position,
              event_type: event.eventType,
              schema_version: event.schemaVersion,
              occurred_at: event.occurredAt,
              recorded_at: recordedAt,
              tenant: event.tenant,
              correlation_id: event.correlationId,
              causation_id: event.causationId,
              run_id: event.runId,
              scope_id: event.scopeId,
              component_id: event.componentId ?? null,
              fiber_id: event.fiberId ?? null,
              semantic_ref_text: event.semanticRef ? JSON.stringify(event.semanticRef) : null,
              metadata_text: event.metadata ? JSON.stringify(event.metadata) : null,
              payload_text: JSON.stringify(event.payload),
            }),
          );
        }
        await tx`UPDATE ${t.streams} SET version = ${sequence} WHERE stream_id = ${append.streamId}`;
      }

      // Phase F — apply record writes. A concurrent writer that committed between the Phase-D check and
      // here fails the WHERE, aborting the whole transaction (nothing partial is visible).
      const storedRecords: StoredRecord[] = [];
      for (const write of request.records ?? []) {
        const updated = await tx`INSERT INTO ${t.records} (collection, id, version, value)
          VALUES (${write.collection}, ${write.id}, ${write.expectedVersion + 1}, ${jsonb(write.value)})
          ON CONFLICT (collection, id) DO UPDATE SET version = records.version + 1, value = EXCLUDED.value
          WHERE records.version = ${write.expectedVersion}
          RETURNING collection, id, version, value::text AS value_text`;
        if (updated.length === 0) {
          const current = await tx`SELECT version FROM ${t.records} WHERE collection = ${write.collection} AND id = ${write.id}`;
          throw new RecordConflictError(write.collection, write.id, write.expectedVersion, current.length > 0 ? num(current[0]!.version) : 0);
        }
        storedRecords.push(mapRecordRow(updated[0]!));
      }

      // Phase G — outbox intents; a reused id fails the whole decision (unique constraint).
      for (const item of request.outbox ?? []) {
        await tx`INSERT INTO ${t.outbox} (id, topic, payload, created_at) VALUES (${item.id}, ${item.topic}, ${jsonb(item.payload)}, ${recordedAt})`;
      }

      // Phase H — record the idempotency key against the result and the events it produced.
      const result: Json = request.result ?? null;
      if (request.idempotency) {
        const inserted = await tx`INSERT INTO ${t.idempotency} (scope, key, fingerprint, result, event_ids, created_at)
          VALUES (${request.idempotency.scope}, ${request.idempotency.key}, ${request.idempotency.fingerprint}, ${jsonb(result)}, ${jsonb(storedEvents.map((e) => e.eventId))}, ${recordedAt})
          ON CONFLICT (scope, key) DO NOTHING
          RETURNING scope`;
        if (inserted.length === 0) {
          // A concurrent commit with the same key won: roll back and replay its recorded outcome.
          throw new DuplicateRaceError(request.idempotency.scope, request.idempotency.key, request.idempotency.fingerprint);
        }
      }

      // Queue the cross-process wake-up inside the transaction: pg_notify is transactional, so the
      // notification is sent if and only if this decision actually commits.
      if (storedEvents.length > 0) {
        const from = storedEvents[0]!.position;
        const to = storedEvents[storedEvents.length - 1]!.position;
        await tx`SELECT pg_notify(${channel}, ${JSON.stringify({ from, to, source: instanceId })})`;
      }

      outcome = { kind: "committed", events: storedEvents, records: storedRecords, result };
    });

    if (outcome) {
      // Local listeners fire after the transaction commits, exactly like the SQLite store. Advancing the
      // cursor first keeps the drain (own notification is skipped; foreign ones read from the cursor)
      // from re-delivering this commit to the same listeners.
      if (outcome.kind === "committed" && outcome.events.length > 0) {
        if (cursorReady) cursor = Math.max(cursor, outcome.events[outcome.events.length - 1]!.position);
        for (const listener of listeners) listener(outcome.events);
      }
      return outcome;
    }
    throw new PostgresStoreError("store-postgres: commit resolved without an outcome");
  }

  async function eventsByIds(ids: readonly string[]): Promise<StoredEvent[]> {
    if (ids.length === 0) return [];
    const rows = await sql`${eventSelect} WHERE e.event_id IN ${sql([...ids])}`;
    const byId = new Map<string, Row>(rows.map((row: Row) => [row.event_id, row]));
    return ids.filter((id) => byId.has(id)).map((eventId) => mapEventRow(byId.get(eventId)));
  }

  type Executor = postgres.Sql | postgres.TransactionSql;

  async function readIdempotencyRecord(executor: Executor, idempotency: { readonly scope: string; readonly key: string; readonly fingerprint: string }): Promise<CommitOutcome | undefined> {
    const rows = await executor`SELECT fingerprint, result::text AS result, event_ids::text AS event_ids FROM ${t.idempotency} WHERE scope = ${idempotency.scope} AND key = ${idempotency.key}`;
    if (rows.length === 0) return undefined;
    const row = rows[0]!;
    if (row.fingerprint !== idempotency.fingerprint) throw new IdempotencyMismatchError(idempotency.scope, idempotency.key);
    return { kind: "duplicate", events: await eventsByIds(json<string[]>(row.event_ids)), result: json<Json>(row.result) };
  }

  // ── Store surface ───────────────────────────────────────────────────────────────

  const store: DurableStore = {
    async commit(request: CommitRequest): Promise<CommitOutcome> {
      assertOpen();
      try {
        return await commit(request);
      } catch (error) {
        if (error instanceof DuplicateRaceError) {
          const rows = await sql`SELECT fingerprint, result::text AS result, event_ids::text AS event_ids FROM ${t.idempotency} WHERE scope = ${error.scope} AND key = ${error.key}`;
          const row = rows[0];
          if (!row) throw new PostgresStoreError(`store-postgres: idempotency race winner vanished for ${error.scope}:${error.key}`);
          if (row.fingerprint !== error.fingerprint) throw new IdempotencyMismatchError(error.scope, error.key);
          return { kind: "duplicate", events: await eventsByIds(json<string[]>(row.event_ids)), result: json<Json>(row.result) };
        }
        throw error;
      }
    },

    async streamVersion(streamId: string): Promise<number> {
      assertOpen();
      const rows = await sql`SELECT version FROM ${t.streams} WHERE stream_id = ${streamId}`;
      return rows.length > 0 ? num(rows[0]!.version) : 0;
    },

    async readStream(streamId: string, options?: { readonly afterSequence?: number; readonly limit?: number }): Promise<StoredEvent[]> {
      assertOpen();
      const after = options?.afterSequence ?? 0;
      const rows =
        options?.limit === undefined
          ? await sql`${eventSelect} WHERE e.stream_id = ${streamId} AND e.stream_sequence > ${after} ORDER BY e.stream_sequence`
          : await sql`${eventSelect} WHERE e.stream_id = ${streamId} AND e.stream_sequence > ${after} ORDER BY e.stream_sequence LIMIT ${options.limit}`;
      return rows.map((row: Row) => mapEventRow(row));
    },

    async readAll(options?: { readonly afterPosition?: number; readonly limit?: number }): Promise<StoredEvent[]> {
      assertOpen();
      const after = options?.afterPosition ?? 0;
      const rows =
        options?.limit === undefined
          ? await sql`${eventSelect} WHERE e.position > ${after} ORDER BY e.position`
          : await sql`${eventSelect} WHERE e.position > ${after} ORDER BY e.position LIMIT ${options.limit}`;
      return rows.map((row: Row) => mapEventRow(row));
    },

    async getEvent(eventId: string): Promise<StoredEvent | undefined> {
      assertOpen();
      const rows = await sql`${eventSelect} WHERE e.event_id = ${eventId}`;
      return rows.length > 0 ? mapEventRow(rows[0]) : undefined;
    },

    onCommitted(listener: (events: readonly StoredEvent[]) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async getRecord(collection: string, id: string): Promise<StoredRecord | undefined> {
      assertOpen();
      const rows = await sql`SELECT collection, id, version, value::text AS value_text FROM ${t.records} WHERE collection = ${collection} AND id = ${id}`;
      return rows.length > 0 ? mapRecordRow(rows[0]) : undefined;
    },

    async listRecords(collection: string, where?: { readonly [field: string]: string | number | boolean | null }): Promise<StoredRecord[]> {
      assertOpen();
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(collection)) throw new PostgresStoreError(`listRecords: invalid collection name "${collection}"`);
      // Match the SQLite store's json_extract semantics: the comparison is on the JSON value itself (a
      // JSON string never equals a JSON number), and `null` matches a JSON null or an absent field.
      let query = sql`SELECT collection, id, version, value::text AS value_text FROM ${t.records} WHERE collection = ${collection}`;
      for (const [field, value] of Object.entries(where ?? {})) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) throw new PostgresStoreError(`listRecords: invalid field name "${field}"`);
        query =
          value === null
            ? sql`${query} AND ((value -> ${field}) IS NULL OR (value -> ${field}) = 'null'::jsonb)`
            : sql`${query} AND (value -> ${field}) = ${jsonb(value)}`;
      }
      // Code-point order (= UTF-8 byte order), matching SQLite's BINARY collation.
      const rows = await sql`${query} ORDER BY id COLLATE "C"`;
      return rows.map(mapRecordRow);
    },

    async claimOutbox(options: { readonly topic: string; readonly now: number; readonly limit: number; readonly leaseMs: number }): Promise<OutboxItem[]> {
      assertOpen();
      // FOR UPDATE SKIP LOCKED: concurrent claimers (processes) take disjoint sets atomically; no claim
      // transaction ever waits behind another.
      const rows = await sql`WITH candidates AS (
          SELECT seq FROM ${t.outbox}
          WHERE topic = ${options.topic} AND status = 'pending' AND claimed_until <= ${options.now}
          ORDER BY seq LIMIT ${options.limit} FOR UPDATE SKIP LOCKED
        )
        UPDATE ${t.outbox} o SET attempts = o.attempts + 1, claimed_until = ${options.now + options.leaseMs}
        FROM candidates WHERE o.seq = candidates.seq
        RETURNING o.*, o.payload::text AS payload_text, o.receipt::text AS receipt_text`;
      return rows.map(mapOutboxRow);
    },

    async settleOutbox(id: string, settlement: OutboxSettlement): Promise<void> {
      assertOpen();
      if (settlement.kind === "delivered") {
        await sql`UPDATE ${t.outbox} SET status = 'delivered', receipt = ${jsonb(settlement.receipt)} WHERE id = ${id}`;
      } else if (settlement.kind === "retry") {
        await sql`UPDATE ${t.outbox} SET last_error = ${settlement.error}, claimed_until = ${settlement.retryAt} WHERE id = ${id}`;
      } else {
        await sql`UPDATE ${t.outbox} SET status = 'poisoned', last_error = ${settlement.error} WHERE id = ${id}`;
      }
    },

    async requeueOutbox(id: string, now: number): Promise<void> {
      assertOpen();
      await sql`UPDATE ${t.outbox} SET status = 'pending', claimed_until = ${now} WHERE id = ${id}`;
    },

    async listOutbox(options?: { readonly topic?: string; readonly status?: OutboxStatus }): Promise<OutboxItem[]> {
      assertOpen();
      const rows =
        options?.topic !== undefined && options?.status !== undefined
          ? await sql`SELECT *, payload::text AS payload_text, receipt::text AS receipt_text FROM ${t.outbox} WHERE topic = ${options.topic} AND status = ${options.status} ORDER BY seq`
          : options?.topic !== undefined
            ? await sql`SELECT *, payload::text AS payload_text, receipt::text AS receipt_text FROM ${t.outbox} WHERE topic = ${options.topic} ORDER BY seq`
            : options?.status !== undefined
              ? await sql`SELECT *, payload::text AS payload_text, receipt::text AS receipt_text FROM ${t.outbox} WHERE status = ${options.status} ORDER BY seq`
              : await sql`SELECT *, payload::text AS payload_text, receipt::text AS receipt_text FROM ${t.outbox} ORDER BY seq`;
      return rows.map(mapOutboxRow);
    },

    async getProjection(name: string): Promise<ProjectionCheckpoint | undefined> {
      assertOpen();
      const rows = await sql`SELECT * FROM ${t.checkpoints} WHERE name = ${name}`;
      return rows.length > 0 ? mapCheckpointRow(rows[0]) : undefined;
    },

    async commitProjection(commitReq: ProjectionCommit): Promise<void> {
      assertOpen();
      await sql.begin(async (tx) => {
        // FOR UPDATE serializes concurrent projection runners (multi-process); the conditional upsert
        // below still re-verifies for the race where two runners both see an absent checkpoint.
        const current = await tx`SELECT position FROM ${t.checkpoints} WHERE name = ${commitReq.name} FOR UPDATE`;
        const at = current.length > 0 ? num(current[0]!.position) : 0;
        if (at !== commitReq.fromPosition) {
          throw new CheckpointConflictError(`Projection ${commitReq.name} checkpoint is at ${at}, expected ${commitReq.fromPosition}`);
        }
        for (const write of commitReq.writes) {
          if (write.value === null) {
            await tx`DELETE FROM ${t.projectionState} WHERE name = ${commitReq.name} AND key = ${write.key}`;
          } else {
            await tx`INSERT INTO ${t.projectionState} (name, key, value) VALUES (${commitReq.name}, ${write.key}, ${jsonb(write.value)})
              ON CONFLICT (name, key) DO UPDATE SET value = EXCLUDED.value`;
          }
        }
        const inserted = await tx`INSERT INTO ${t.checkpoints} (name, version, position, status, error_position, error_event_id, error_message)
          VALUES (${commitReq.name}, ${commitReq.version}, ${commitReq.toPosition}, 'ok', NULL, NULL, NULL)
          ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version, position = EXCLUDED.position, status = 'ok', error_position = NULL, error_event_id = NULL, error_message = NULL
          WHERE projection_checkpoints.position = ${commitReq.fromPosition}
          RETURNING name`;
        if (inserted.length === 0) {
          throw new CheckpointConflictError(`Projection ${commitReq.name} checkpoint raced ahead of ${commitReq.fromPosition}`);
        }
      });
    },

    async failProjection(name: string, error: { readonly position: number; readonly eventId: string; readonly message: string }): Promise<void> {
      assertOpen();
      await sql`INSERT INTO ${t.checkpoints} (name, version, position, status, error_position, error_event_id, error_message)
        VALUES (${name}, '', 0, 'error', ${error.position}, ${error.eventId}, ${error.message})
        ON CONFLICT (name) DO UPDATE SET status = 'error', error_position = EXCLUDED.error_position, error_event_id = EXCLUDED.error_event_id, error_message = EXCLUDED.error_message`;
    },

    async readProjection(name: string, key: string): Promise<Json | undefined> {
      assertOpen();
      const rows = await sql`SELECT value::text AS value_text FROM ${t.projectionState} WHERE name = ${name} AND key = ${key}`;
      return rows.length > 0 ? json<Json>(rows[0]!.value_text) : undefined;
    },

    async listProjection(name: string): Promise<{ readonly key: string; readonly value: Json }[]> {
      assertOpen();
      const rows = await sql`SELECT key, value::text AS value_text FROM ${t.projectionState} WHERE name = ${name} ORDER BY key COLLATE "C"`;
      return rows.map((row: Row) => ({ key: row.key, value: json<Json>(row.value_text) }));
    },

    async resetProjection(name: string): Promise<void> {
      assertOpen();
      await sql.begin(async (tx) => {
        await tx`DELETE FROM ${t.projectionState} WHERE name = ${name}`;
        await tx`DELETE FROM ${t.checkpoints} WHERE name = ${name}`;
      });
    },

    async putBlob(bytes: Uint8Array): Promise<string> {
      assertOpen();
      const hash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
      await sql`INSERT INTO ${t.blobs} (hash, bytes) VALUES (${hash}, ${Buffer.from(bytes)}) ON CONFLICT (hash) DO NOTHING`;
      return hash;
    },

    async getBlob(hash: string): Promise<Uint8Array | undefined> {
      assertOpen();
      const rows = await sql`SELECT bytes FROM ${t.blobs} WHERE hash = ${hash}`;
      return rows.length > 0 ? new Uint8Array(rows[0]!.bytes) : undefined;
    },

    async deleteBlob(hash: string): Promise<void> {
      assertOpen();
      await sql`DELETE FROM ${t.blobs} WHERE hash = ${hash}`;
    },

    async erasePayload(eventId: string, reason: string, actorId: string): Promise<void> {
      assertOpen();
      const tombstone = await sql.begin(async (tx) => {
        const originals = await tx`${eventSelect} WHERE e.event_id = ${eventId}`;
        if (originals.length === 0) throw new NotFoundError(`event ${eventId} not found`);
        const original = originals[0]!;
        const erasedAt = new Date().toISOString();
        await tx`DELETE FROM ${t.payloads} WHERE event_id = ${eventId}`;
        await tx`UPDATE ${t.events} SET erasure_reason = ${reason}, erasure_at = ${erasedAt} WHERE event_id = ${eventId}`;

        // Idempotency results are derived copies: a stored result may quote the erased payload (the
        // continuation-transition shape) or fold earlier events of the same stream (the updateState
        // shape). Erasure tombstones such results so replay can never re-disclose the content.
        await tx`UPDATE ${t.idempotency} SET result = ${sql.json({ __erased: { reason, erasedAt } })}::jsonb
          WHERE event_ids @> ${sql.json([eventId])}::jsonb
             OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(event_ids) je JOIN ${t.events} e ON e.event_id = je WHERE e.stream_id = ${original.stream_id})`;

        await tx`INSERT INTO ${t.streams} (stream_id, version) VALUES (${'$erasures'}, 0) ON CONFLICT (stream_id) DO NOTHING`;
        const counter = await tx`UPDATE ${t.meta} SET next_position = next_position + 1 WHERE id = ${POSITION_COUNTER_ID} RETURNING next_position - 1 AS base`;
        const position = num(counter[0]!.base);
        const versions = await tx`SELECT version FROM ${t.streams} WHERE stream_id = ${'$erasures'} FOR UPDATE`;
        const sequence = num(versions[0]!.version) + 1;
        const tombstoneId = crypto.randomUUID();
        const payload = { eventId, reason, actorId };
        await tx`INSERT INTO ${t.events} (position, event_id, stream_id, stream_sequence, event_type, schema_version, occurred_at, recorded_at, tenant, correlation_id, causation_id, run_id, scope_id, semantic_ref, metadata)
          VALUES (${position}, ${tombstoneId}, ${'$erasures'}, ${sequence}, ${'erasure.recorded'}, 1, ${erasedAt}, ${erasedAt}, ${original.tenant}, ${original.correlation_id}, ${original.event_id}, ${original.run_id}, ${original.scope_id}, NULL, NULL)`;
        await tx`INSERT INTO ${t.payloads} (event_id, payload) VALUES (${tombstoneId}, ${jsonb(payload)})`;
        await tx`UPDATE ${t.streams} SET version = ${sequence} WHERE stream_id = ${'$erasures'}`;
        await tx`SELECT pg_notify(${channel}, ${JSON.stringify({ from: position, to: position, source: instanceId })})`;
        return mapEventRow({
          event_id: tombstoneId,
          stream_id: "$erasures",
          stream_sequence: sequence,
          position,
          event_type: "erasure.recorded",
          schema_version: 1,
          occurred_at: erasedAt,
          recorded_at: erasedAt,
          tenant: original.tenant,
          correlation_id: original.correlation_id,
          causation_id: original.event_id,
          run_id: original.run_id,
          scope_id: original.scope_id,
          component_id: null,
          fiber_id: null,
          semantic_ref_text: null,
          metadata_text: null,
          payload_text: JSON.stringify(payload),
        });
      });
      // PostgreSQL MVCC keeps the deleted payload's bytes in dead tuples and WAL until vacuuming; every
      // read path returns the erased state, but physical scrubbing is an operator action
      // (`VACUUM <schema>.payloads`) — see README (spec §32 note).
      if (cursorReady) cursor = Math.max(cursor, tombstone.position);
      for (const listener of listeners) listener([tombstone]);
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      stopPoll?.();
      await listenMeta.unlisten();
      await sql.end({ timeout: 5 });
    },
  };

  // Drops through an ephemeral connection so cleanup works regardless of the store pool's state
  // (tests close the store before dropping its schema).
  const dropSchema = async (): Promise<void> => {
    const dropper = postgres(options.url, { max: 1, onnotice: () => {} });
    try {
      await dropper.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      await dropper.end({ timeout: 1 });
    }
  };

  return { store, dropSchema, close: () => store.close() };
}

async function migrate(sql: postgres.Sql, schema: string, schemaVersions: postgres.Fragment): Promise<void> {
  // One migration lock per schema: concurrent processes opening the same schema serialize here —
  // including the schema creation itself, because CREATE SCHEMA IF NOT EXISTS is not race-free in
  // PostgreSQL (two creators can pass the existence check and collide on pg_namespace). The DDL is
  // unqualified; search_path pins it to this store's schema for the transaction.
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`cognate-migrate:${schema}`})::bigint)`;
    await tx.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await tx.unsafe(`SET LOCAL search_path = ${schema}`);
    await tx`CREATE TABLE IF NOT EXISTS ${schemaVersions} (version integer PRIMARY KEY, applied_at text NOT NULL)`;
    const applied = new Set(((await tx`SELECT version FROM ${schemaVersions}`) as Row[]).map((r) => num(r.version)));
    for (const migration of migrations()) {
      if (applied.has(migration.version)) continue;
      for (const statement of migration.statements) await tx.unsafe(statement);
      await tx`INSERT INTO ${schemaVersions} (version, applied_at) VALUES (${migration.version}, ${new Date().toISOString()})`;
    }
  });
}
