// Numbered migrations recorded in `cognate.schema_versions`. Tables mirror spec §13.2 logical names and
// packages/store-sqlite/src/schema.ts; everything lives in one PostgreSQL schema so tenants of one cluster
// (tests, apps) isolate by schema without provisioning separate databases.
//
// Payloads stay apart from event envelopes so erasure (spec §32) can delete content while the envelope
// (causality, ids, timing) survives untouched, exactly like the SQLite store.
export interface Migration {
  readonly version: number;
  readonly statements: readonly string[];
}

/** Positions are allocated from a single counter row locked `FOR UPDATE` inside the append transaction:
 * the lock is held until commit, so position order equals commit order across processes, and an aborted
 * transaction's allocation rolls back (no gaps). Only commits that append events touch this row. */
export const POSITION_COUNTER_ID = "positions";

export function migrations(): Migration[] {
  return [
    {
      version: 1,
      statements: [
        `CREATE TABLE streams (
          stream_id text PRIMARY KEY,
          version bigint NOT NULL
        )`,
        `CREATE TABLE events (
          position bigint PRIMARY KEY,
          event_id text NOT NULL UNIQUE,
          stream_id text NOT NULL REFERENCES streams(stream_id),
          stream_sequence bigint NOT NULL,
          event_type text NOT NULL,
          schema_version integer NOT NULL,
          occurred_at text NOT NULL,
          recorded_at text NOT NULL,
          tenant text NOT NULL,
          correlation_id text NOT NULL,
          causation_id text,
          run_id text,
          scope_id text NOT NULL,
          component_id text,
          fiber_id text,
          semantic_ref jsonb,
          metadata jsonb,
          erasure_reason text,
          erasure_at text,
          UNIQUE (stream_id, stream_sequence)
        )`,
        // Payload bytes live apart from the envelope so erasePayload can delete content without touching
        // causality-bearing columns above (spec sec32). jsonb keeps the exact JSON value.
        `CREATE TABLE payloads (
          event_id text PRIMARY KEY REFERENCES events(event_id),
          payload jsonb NOT NULL
        )`,
        `CREATE TABLE idempotency (
          scope text NOT NULL,
          key text NOT NULL,
          fingerprint text NOT NULL,
          result jsonb NOT NULL,
          event_ids jsonb NOT NULL,
          created_at text NOT NULL,
          PRIMARY KEY (scope, key)
        )`,
        `CREATE TABLE records (
          collection text NOT NULL,
          id text NOT NULL,
          version integer NOT NULL,
          value jsonb NOT NULL,
          PRIMARY KEY (collection, id)
        )`,
        // `seq` is the insertion-order cursor SQLite's rowid provides for claim and list ordering.
        `CREATE TABLE outbox (
          seq bigint GENERATED ALWAYS AS IDENTITY,
          id text PRIMARY KEY,
          topic text NOT NULL,
          payload jsonb NOT NULL,
          status text NOT NULL DEFAULT 'pending',
          attempts integer NOT NULL DEFAULT 0,
          claimed_until bigint NOT NULL DEFAULT 0,
          last_error text,
          receipt jsonb,
          created_at text NOT NULL
        )`,
        `CREATE INDEX outbox_topic_idx ON outbox (topic, status, claimed_until)`,
        `CREATE TABLE projection_checkpoints (
          name text PRIMARY KEY,
          version text NOT NULL,
          position bigint NOT NULL,
          status text NOT NULL,
          error_position bigint,
          error_event_id text,
          error_message text
        )`,
        `CREATE TABLE projection_state (
          name text NOT NULL,
          key text NOT NULL,
          value jsonb NOT NULL,
          PRIMARY KEY (name, key)
        )`,
        `CREATE TABLE blobs (
          hash text PRIMARY KEY,
          bytes bytea NOT NULL
        )`,
        `CREATE TABLE store_meta (
          id text PRIMARY KEY,
          next_position bigint NOT NULL
        )`,
        `INSERT INTO store_meta (id, next_position) VALUES ('${POSITION_COUNTER_ID}', 1)`,
      ],
    },
    {
      // Spec §9.2: durable facts are never undone by deleting or rewriting history. Enforced in the database
      // itself, so raw SQL cannot bypass the store API. Only a single erasure (§32) may set the erasure columns.
      version: 2,
      statements: [
        `CREATE FUNCTION events_append_only_delete() RETURNS trigger AS $$
         BEGIN RAISE EXCEPTION 'events are append-only (spec §9.2)'; END;
         $$ LANGUAGE plpgsql`,
        `CREATE TRIGGER events_append_only_delete BEFORE DELETE ON events
         FOR EACH ROW EXECUTE FUNCTION events_append_only_delete()`,
        `CREATE FUNCTION events_append_only_update() RETURNS trigger AS $$
         BEGIN
           IF NEW.position IS DISTINCT FROM OLD.position
              OR NEW.event_id IS DISTINCT FROM OLD.event_id
              OR NEW.stream_id IS DISTINCT FROM OLD.stream_id
              OR NEW.stream_sequence IS DISTINCT FROM OLD.stream_sequence
              OR NEW.event_type IS DISTINCT FROM OLD.event_type
              OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
              OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
              OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at
              OR NEW.tenant IS DISTINCT FROM OLD.tenant
              OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
              OR NEW.causation_id IS DISTINCT FROM OLD.causation_id
              OR NEW.run_id IS DISTINCT FROM OLD.run_id
              OR NEW.scope_id IS DISTINCT FROM OLD.scope_id
              OR NEW.component_id IS DISTINCT FROM OLD.component_id
              OR NEW.fiber_id IS DISTINCT FROM OLD.fiber_id
              OR NEW.semantic_ref IS DISTINCT FROM OLD.semantic_ref
              OR NEW.metadata IS DISTINCT FROM OLD.metadata
              OR OLD.erasure_reason IS NOT NULL
           THEN RAISE EXCEPTION 'events are append-only (spec §9.2)'; END IF;
           RETURN NEW;
         END;
         $$ LANGUAGE plpgsql`,
        `CREATE TRIGGER events_append_only_update BEFORE UPDATE ON events
         FOR EACH ROW EXECUTE FUNCTION events_append_only_update()`,
      ],
    },
    {
      // listRuns (spec §22, DEBT-019): equality filters push down as `(value -> 'field') = $::jsonb`;
      // these partial expression indexes let the planner serve collection='runs' lookups by tenant,
      // correlationId or agent from an index instead of scanning the collection.
      version: 3,
      statements: [
        `CREATE INDEX records_runs_tenant_idx ON records ((value -> 'tenant')) WHERE collection = 'runs'`,
        `CREATE INDEX records_runs_correlation_idx ON records ((value -> 'correlationId')) WHERE collection = 'runs'`,
        `CREATE INDEX records_runs_agent_idx ON records ((value -> 'agent')) WHERE collection = 'runs'`,
      ],
    },
    {
      version: 4,
      statements: [
        `ALTER TABLE outbox ADD COLUMN lease_owner text`,
        `ALTER TABLE outbox ADD COLUMN lease_generation bigint NOT NULL DEFAULT 0`,
      ],
    },
  ];
}
