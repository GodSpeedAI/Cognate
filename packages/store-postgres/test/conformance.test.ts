// CG-EVT-004's PostgreSQL counterpart: the unchanged DurableStore conformance kit against a live server.
// Needs the development database: `just db-up` (pg0), or set COGNATE_TEST_POSTGRES_URL.
import { expect, test } from "bun:test";
import postgres from "postgres";
import { storeConformance } from "@godspeedai/cognate-events/conformance";
import { openPostgresStore } from "../src/index.ts";

const url = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

test("the server is reachable", async () => {
  try {
    const probe = await openPostgresStore({ url, schema: `cognate_probe_${Date.now()}`, pollMs: 0 });
    await probe.dropSchema();
    await probe.close();
  } catch (cause) {
    throw new Error(`store-postgres conformance needs a PostgreSQL server (just db-up); ${url} unreachable`, { cause });
  }
}, 30_000);

let counter = 0;
storeConformance(
  "store-postgres",
  async () => {
    const schema = `cognate_conformance_${Date.now().toString(36)}_${counter++}`;
    let current = await openPostgresStore({ url, schema, pollMs: 0 });
    return {
      store: current.store,
      reopen: async () => {
        // Close and reopen the same durable location (a new pool, same schema).
        await current.close();
        current = await openPostgresStore({ url, schema, pollMs: 0 });
        return current.store;
      },
      dispose: async () => {
        await current.close().catch(() => {});
        // Drop through an ephemeral connection: the store's own pool may already be closed by reopen.
        const dropper = postgres(url, { max: 1, onnotice: () => {} });
        try {
          await dropper.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        } finally {
          await dropper.end({ timeout: 1 });
        }
      },
    };
  },
  { persistent: true },
);
