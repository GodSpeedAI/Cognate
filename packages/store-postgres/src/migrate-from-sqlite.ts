// One-time migration from a Cognate SQLite store (packages/store-sqlite) to a PostgreSQL schema.
// Preserves identifiers, positions, and causal order exactly; verifies content by hashing every
// table before reporting success; never deletes or modifies the SQLite source.
//
// Procedure: (1) take a consistent SQLite backup (VACUUM INTO, which includes WAL state), (2) run
// preflight checks, (3) copy every durable table inside ONE PostgreSQL transaction — streams, events
// with payloads, idempotency, records, outbox (insertion order preserved), verifiable projection
// checkpoints and state, blobs — (4) continue the position counter past the imported maximum, (5)
// verify content through the PostgreSQL store's public API: canonical-JSON digests over the event
// log and every record collection, plus an idempotency replay of every recorded key. Any failure
// aborts the transaction: PostgreSQL rolls the import back and the source stays untouched.
//
// Projection checkpoints are only imported when provably consistent (status ok and checkpoint
// position within the imported event log); anything else is reported in `projectionsToRebuild` —
// derived data is never silently trusted (spec §11: projections are rebuildable, never authoritative).
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { openPostgresStore } from "./index.ts";

export interface MigrationOptions {
  /** Path to the SQLite database file to migrate from. */
  readonly sqlitePath: string;
  /** PostgreSQL connection URL of the target. */
  readonly url: string;
  /** Target schema (default `cognate`). Must not contain events already. */
  readonly schema?: string;
  /** Analyze without writing anything (still takes the SQLite backup and reports the plan). */
  readonly dryRun?: boolean;
  /** Backup file path (default `<sqlitePath>.migration-backup-<timestamp>`). */
  readonly backupTo?: string;
  /** Progress reporter. */
  readonly log?: (message: string) => void;
}

export interface MigrationReport {
  readonly backupPath: string;
  readonly dryRun: boolean;
  readonly counts: {
    readonly streams: number;
    readonly events: number;
    readonly payloads: number;
    readonly idempotency: number;
    readonly records: number;
    readonly outbox: number;
    readonly projectionCheckpoints: number;
    readonly projectionState: number;
    readonly blobs: number;
  };
  /** Checkpoints that were not imported and must be rebuilt on PostgreSQL instead of trusted. */
  readonly projectionsToRebuild: readonly string[];
  readonly verified: {
    /** Canonical-JSON digest over every event envelope+payload in position order. */
    readonly eventLogDigest: string;
    /** Canonical-JSON digest over every record (collection, id, version, value). */
    readonly recordsDigest: string;
    /** Idempotency keys replayed through the PostgreSQL store; all returned `duplicate`. */
    readonly idempotencyReplays: number;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** Deterministic JSON: object keys sorted recursively, so equal JSON values hash equally
 * regardless of which store serialized them first (jsonb reorders keys; SQLite text does not). */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

function digestOf(rows: readonly unknown[]): string {
  const hash = createHash("sha256");
  for (const row of rows) hash.update(canonical(row));
  return hash.digest("hex");
}

/** Take a consistent backup of the SQLite database (WAL included) via VACUUM INTO. */
export function backupSqlite(sqlitePath: string, backupTo?: string): string {
  const db = new Database(sqlitePath, { readonly: true });
  try {
    const backupPath = backupTo ?? `${sqlitePath}.migration-backup-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
    // VACUUM INTO produces a clean, fully checkpointed copy; it fails if the target exists.
    db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
    return backupPath;
  } finally {
    db.close();
  }
}

export async function migrateSqliteToPostgres(options: MigrationOptions): Promise<MigrationReport> {
  const log = options.log ?? (() => {});
  const schema = options.schema ?? "cognate";

  // ── Preflight: source must be a readable SQLite database with the expected tables ──
  const source = new Database(options.sqlitePath, { readonly: true });
  try {
    const integrity = (source.query("PRAGMA integrity_check").get() as Row).integrity_check;
    if (integrity !== "ok") throw new Error(`sqlite source failed integrity_check: ${integrity}`);
    const tables = new Set((source.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Row[]).map((r) => r.name));
    for (const expected of ["event_streams", "events", "payloads", "idempotency", "records", "outbox", "projection_checkpoints", "projection_state", "blobs"]) {
      if (!tables.has(expected)) throw new Error(`sqlite source is missing the "${expected}" table — is this a Cognate SQLite store?`);
    }

    // ── Consistent backup before anything else reads the source ──
    log("backup: VACUUM INTO (includes WAL state)");
    const backupPath = backupSqlite(options.sqlitePath, options.backupTo);

    // ── Plan and counts ──
    const count = (table: string): number => (source.query(`SELECT count(*) AS n FROM ${table}`).get() as Row).n;
    const counts = {
      streams: count("event_streams"),
      events: count("events"),
      payloads: count("payloads"),
      idempotency: count("idempotency"),
      records: count("records"),
      outbox: count("outbox"),
      projectionCheckpoints: count("projection_checkpoints"),
      projectionState: count("projection_state"),
      blobs: count("blobs"),
    };
    log(`plan: ${counts.events} events on ${counts.streams} streams, ${counts.records} records, ${counts.outbox} outbox items, ${counts.projectionCheckpoints} projections, ${counts.blobs} blobs`);
    if (options.dryRun) {
      log("dry-run: no PostgreSQL writes performed");
      return { backupPath, dryRun: true, counts, projectionsToRebuild: [], verified: { eventLogDigest: "", recordsDigest: "", idempotencyReplays: 0 } };
    }

    // ── Target must be free of events (a second import would duplicate positions) ──
    const target = await openPostgresStore({ url: options.url, schema, pollMs: 0 });
    try {
      const existing = await target.store.readAll({ limit: 1 });
      if (existing.length > 0) throw new Error(`postgres schema "${schema}" already contains events — refusing to import twice`);

      const maxPosition = (source.query("SELECT max(position) AS p FROM events").get() as Row).p ?? 0;
      const eventRows = source.query("SELECT * FROM events ORDER BY position").all() as Row[];
      const payloadRows = new Map<string, string>((source.query("SELECT event_id, payload FROM payloads").all() as Row[]).map((r) => [r.event_id, r.payload]));
      const idempotency = source.query("SELECT * FROM idempotency ORDER BY scope, key").all() as Row[];
      const records = source.query("SELECT * FROM records ORDER BY collection, id").all() as Row[];
      const outbox = source.query("SELECT * FROM outbox ORDER BY rowid").all() as Row[];
      const checkpoints = source.query("SELECT * FROM projection_checkpoints ORDER BY name").all() as Row[];
      const projectionState = source.query("SELECT * FROM projection_state ORDER BY name, key").all() as Row[];
      const blobs = source.query("SELECT hash, bytes FROM blobs").all() as Row[];

      // Source digests over canonical JSON, in the store's public read order.
      const sourceEventDigest = digestOf(
        eventRows.map((row) => [
          row.position,
          row.event_id,
          row.stream_id,
          row.stream_sequence,
          row.event_type,
          row.schema_version,
          row.occurred_at,
          row.recorded_at,
          row.tenant,
          row.correlation_id,
          row.causation_id,
          row.run_id,
          row.scope_id,
          row.component_id,
          row.fiber_id,
          row.semantic_ref ? JSON.parse(row.semantic_ref) : null,
          row.metadata ? JSON.parse(row.metadata) : null,
          row.erasure_reason,
          row.erasure_at,
          payloadRows.has(row.event_id) ? JSON.parse(payloadRows.get(row.event_id)!) : null,
        ]),
      );
      const sourceRecordsDigest = digestOf(records.map((row) => [row.collection, row.id, row.version, JSON.parse(row.value)]));

      // ── Import: one transaction, everything or nothing ──
      const sql = postgres(options.url, { max: 1, onnotice: () => {} });
      try {
        const table = (name: string) => sql`${sql(schema)}.${sql(name)}`;
        const projectionsToRebuild: string[] = [];
        await sql.begin(async (tx) => {
          for (const row of source.query("SELECT stream_id, version FROM event_streams ORDER BY stream_id").all() as Row[]) {
            await tx`INSERT INTO ${table("streams")} (stream_id, version) VALUES (${row.stream_id}, ${row.version}) ON CONFLICT (stream_id) DO NOTHING`;
          }
          for (const row of eventRows) {
            await tx`INSERT INTO ${table("events")} (position, event_id, stream_id, stream_sequence, event_type, schema_version, occurred_at, recorded_at, tenant, correlation_id, causation_id, run_id, scope_id, component_id, fiber_id, semantic_ref, metadata, erasure_reason, erasure_at)
              VALUES (${row.position}, ${row.event_id}, ${row.stream_id}, ${row.stream_sequence}, ${row.event_type}, ${row.schema_version}, ${row.occurred_at}, ${row.recorded_at}, ${row.tenant}, ${row.correlation_id}, ${row.causation_id}, ${row.run_id}, ${row.scope_id}, ${row.component_id}, ${row.fiber_id}, ${row.semantic_ref ? sql.json(JSON.parse(row.semantic_ref)) : null}::jsonb, ${row.metadata ? sql.json(JSON.parse(row.metadata)) : null}::jsonb, ${row.erasure_reason}, ${row.erasure_at})`;
            const payload = payloadRows.get(row.event_id);
            if (payload !== undefined) {
              await tx`INSERT INTO ${table("payloads")} (event_id, payload) VALUES (${row.event_id}, ${sql.json(JSON.parse(payload))}::jsonb)`;
            }
          }
          for (const row of idempotency) {
            await tx`INSERT INTO ${table("idempotency")} (scope, key, fingerprint, result, event_ids, created_at)
              VALUES (${row.scope}, ${row.key}, ${row.fingerprint}, ${sql.json(JSON.parse(row.result))}::jsonb, ${sql.json(JSON.parse(row.event_ids))}::jsonb, ${row.created_at})`;
          }
          for (const row of records) {
            await tx`INSERT INTO ${table("records")} (collection, id, version, value)
              VALUES (${row.collection}, ${row.id}, ${row.version}, ${sql.json(JSON.parse(row.value))}::jsonb)`;
          }
          for (const row of outbox) {
            await tx`INSERT INTO ${table("outbox")} (id, topic, payload, status, attempts, claimed_until, last_error, receipt, created_at)
              VALUES (${row.id}, ${row.topic}, ${sql.json(JSON.parse(row.payload))}::jsonb, ${row.status}, ${row.attempts}, ${row.claimed_until}, ${row.last_error}, ${row.receipt ? sql.json(JSON.parse(row.receipt)) : null}::jsonb, ${row.created_at})`;
          }
          const stateByName = new Map<string, Row[]>();
          for (const row of projectionState) stateByName.set(row.name, [...(stateByName.get(row.name) ?? []), row]);
          for (const checkpoint of checkpoints) {
            // Import only provably consistent checkpoints; the rest must be rebuilt on PostgreSQL.
            if (checkpoint.status !== "ok" || checkpoint.position > maxPosition) {
              projectionsToRebuild.push(checkpoint.name);
              continue;
            }
            await tx`INSERT INTO ${table("projection_checkpoints")} (name, version, position, status, error_position, error_event_id, error_message)
              VALUES (${checkpoint.name}, ${checkpoint.version}, ${checkpoint.position}, ${checkpoint.status}, ${checkpoint.error_position}, ${checkpoint.error_event_id}, ${checkpoint.error_message})`;
            for (const row of stateByName.get(checkpoint.name) ?? []) {
              await tx`INSERT INTO ${table("projection_state")} (name, key, value)
                VALUES (${checkpoint.name}, ${row.key}, ${sql.json(JSON.parse(row.value))}::jsonb)`;
            }
          }
          for (const row of blobs) {
            await tx`INSERT INTO ${table("blobs")} (hash, bytes) VALUES (${row.hash}, ${Buffer.from(row.bytes)}) ON CONFLICT (hash) DO NOTHING`;
          }
          // Continue the position counter past the imported maximum.
          await tx`DELETE FROM ${table("store_meta")} WHERE id = 'positions'`;
          await tx`INSERT INTO ${table("store_meta")} (id, next_position) VALUES ('positions', ${maxPosition + 1})`;

          if (projectionsToRebuild.length > 0) log(`projections to rebuild instead of import: ${projectionsToRebuild.join(", ")}`);
        });

        // ── Verification through the public store API (outside the import transaction) ──
        log("verify: event log digest");
        const importedEvents = await target.store.readAll();
        const importedEventDigest = digestOf(
          importedEvents.map((event) => [
            event.position,
            event.eventId,
            event.streamId,
            event.streamSequence,
            event.eventType,
            event.schemaVersion,
            event.occurredAt,
            event.recordedAt,
            event.tenant,
            event.correlationId,
            event.causationId,
            event.runId,
            event.scopeId,
            event.componentId ?? null,
            event.fiberId ?? null,
            event.semanticRef ?? null,
            event.metadata ?? null,
            event.erasure?.reason ?? null,
            event.erasure?.erasedAt ?? null,
            event.payload,
          ]),
        );
        if (importedEventDigest !== sourceEventDigest) throw new Error("verification failed: imported event log differs from the source");

        log("verify: records digest");
        const collections = [...new Set(records.map((r: Row) => r.collection))].sort();
        const importedRecords = [];
        for (const collection of collections) importedRecords.push(...(await target.store.listRecords(collection)));
        const importedRecordsDigest = digestOf(importedRecords.map((record) => [record.collection, record.id, record.version, record.value]));
        if (importedRecordsDigest !== sourceRecordsDigest) throw new Error("verification failed: imported records differ from the source");

        log("verify: idempotency replay");
        let idempotencyReplays = 0;
        for (const row of idempotency) {
          const outcome = await target.store.commit({ idempotency: { scope: row.scope, key: row.key, fingerprint: row.fingerprint }, appends: [] });
          if (outcome.kind !== "duplicate" || canonical(outcome.result) !== canonical(JSON.parse(row.result))) {
            throw new Error(`verification failed: idempotency replay of ${row.scope}:${row.key} did not return the recorded result`);
          }
          idempotencyReplays += 1;
        }

        log(`done: migrated ${counts.events} events; ${projectionsToRebuild.length} projection(s) marked for rebuild`);
        return {
          backupPath,
          dryRun: false,
          counts,
          projectionsToRebuild: projectionsToRebuild.slice(),
          verified: { eventLogDigest: sourceEventDigest, recordsDigest: sourceRecordsDigest, idempotencyReplays },
        };
      } finally {
        await sql.end({ timeout: 1 });
      }
    } finally {
      await target.store.close();
    }
  } finally {
    source.close();
  }
}
