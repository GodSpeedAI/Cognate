// Fail-closed schema version check (PostgreSQL): a schema recording a version newer than this build's
// highest migration is refused before any migration runs, and the refused open writes nothing.
// Needs the development database: `just db-up` (pg0), or set COGNATE_TEST_POSTGRES_URL.
import { expect, test } from "bun:test";
import postgres from "postgres";
import { openPostgresStore, PostgresStoreError } from "../src/index.ts";
import { migrations } from "../src/schema.ts";

const url = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const KNOWN = Math.max(...migrations().map((m) => m.version));

test("a schema recording a newer version is refused on open without writing", async () => {
  const schema = `cognate_schemaver_${crypto.randomUUID().replaceAll("-", "")}`;
  const dropper = postgres(url, { max: 1, onnotice: () => {} });
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await (await openPostgresStore({ url, schema, maxConnections: 2, pollMs: 0 })).close();
    await sql.unsafe(`INSERT INTO ${schema}.schema_versions (version, applied_at) VALUES (${KNOWN + 1}, '2026-10-24T00:00:00.000Z')`);
    const before = await sql.unsafe(`SELECT version FROM ${schema}.schema_versions ORDER BY version`);

    const refused = await openPostgresStore({ url, schema, maxConnections: 2, pollMs: 0 }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(PostgresStoreError);
    expect((refused as Error).message).toMatch(/newer than this build supports/);

    const after = await sql.unsafe(`SELECT version FROM ${schema}.schema_versions ORDER BY version`);
    expect(after.map((r) => r.version)).toEqual(before.map((r) => r.version));
  } finally {
    await sql.end({ timeout: 1 });
    await dropper.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await dropper.end({ timeout: 1 });
  }
}, 30_000);

test("a schema at the current maximum version reopens normally", async () => {
  const schema = `cognate_schemaver_${crypto.randomUUID().replaceAll("-", "")}`;
  const dropper = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await (await openPostgresStore({ url, schema, maxConnections: 2, pollMs: 0 })).close();
    const reopened = await openPostgresStore({ url, schema, maxConnections: 2, pollMs: 0 });
    await reopened.close();
  } finally {
    await dropper.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await dropper.end({ timeout: 1 });
  }
}, 30_000);
