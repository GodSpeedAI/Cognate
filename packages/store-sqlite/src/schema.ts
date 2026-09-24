// Numbered migrations recorded in `schema_versions`. Tables mirror spec §13.2 logical names.
// Payloads are kept in a table separate from event envelopes so erasure (spec §32) can delete
// content while the envelope (causality, ids, timing) survives untouched.
import type { Database } from "bun:sqlite";

export interface Migration {
  readonly version: number;
  readonly sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE event_streams (
        stream_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL
      );

      CREATE TABLE events (
        position INTEGER PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        stream_id TEXT NOT NULL REFERENCES event_streams(stream_id),
        stream_sequence INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        tenant TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        causation_id TEXT,
        run_id TEXT,
        scope_id TEXT NOT NULL,
        component_id TEXT,
        fiber_id TEXT,
        semantic_ref TEXT,
        metadata TEXT,
        erasure_reason TEXT,
        erasure_at TEXT,
        UNIQUE (stream_id, stream_sequence)
      );

      -- Payload bytes live apart from the envelope so erasePayload can delete content
      -- without touching causality-bearing columns above (spec sec32).
      CREATE TABLE payloads (
        event_id TEXT PRIMARY KEY REFERENCES events(event_id),
        payload TEXT NOT NULL
      );

      CREATE TABLE idempotency (
        scope TEXT NOT NULL,
        key TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        result TEXT NOT NULL,
        event_ids TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (scope, key)
      );

      CREATE TABLE records (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        version INTEGER NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );

      CREATE TABLE outbox (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        claimed_until INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        receipt TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX outbox_topic_idx ON outbox (topic, status, claimed_until);

      CREATE TABLE projection_checkpoints (
        name TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        position INTEGER NOT NULL,
        status TEXT NOT NULL,
        error_position INTEGER,
        error_event_id TEXT,
        error_message TEXT
      );

      CREATE TABLE projection_state (
        name TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (name, key)
      );

      CREATE TABLE blobs (
        hash TEXT PRIMARY KEY,
        bytes BLOB NOT NULL
      );
    `,
  },
];

/** Apply any migration not yet recorded in `schema_versions`, inside one transaction. */
export function migrate(db: Database): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_versions (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set((db.query("SELECT version FROM schema_versions").all() as { version: number }[]).map((r) => r.version));
  const run = db.transaction((): void => {
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      db.exec(migration.sql);
      db.query("INSERT INTO schema_versions (version, applied_at) VALUES (?, ?)").run(migration.version, new Date().toISOString());
    }
  });
  run.immediate();
}
