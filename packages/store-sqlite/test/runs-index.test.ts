// DEBT-019: `listRecords("runs", { tenant, correlationId?, agent? })` must be a real index lookup, not a
// full scan of every run record (spec §22). Partial expression indexes on `records` (schema.ts migration 3)
// let SQLite serve the equality filters `listRuns` pushes down as `json_extract` expressions. These tests
// run `EXPLAIN QUERY PLAN` on `buildListRecordsQuery`'s own output, so they prove what the real code path
// chooses, not a hand-written approximation of it.
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildListRecordsQuery, openSqliteStore } from "../src/index.ts";

function plan(db: Database, where: { readonly [field: string]: string | number | boolean | null }): string {
  const { sql, params } = buildListRecordsQuery("runs", where);
  const rows = db.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(params as [])) as { detail: string }[];
  return rows.map((row) => row.detail).join(" | ");
}

test("listRecords(\"runs\", { tenant }) is served by the tenant index, not a table scan", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cognate-runs-index-"));
  try {
    const path = join(dir, "cognate.sqlite");
    const store = openSqliteStore({ path });
    for (let i = 0; i < 20; i++) {
      await store.commit({ appends: [], records: [{ collection: "runs", id: `run-${i}`, expectedVersion: 0, value: { tenant: i % 2 === 0 ? "tenant-a" : "tenant-b", agent: "agent.echo", correlationId: `corr-${i}` } }] });
    }
    expect((await store.listRecords("runs", { tenant: "tenant-a" })).map((r) => r.id)).toHaveLength(10);
    await store.close();

    // A second raw connection to the same file inspects the query plan `listRecords` actually issues.
    const db = new Database(path, { readonly: true });
    try {
      const detail = plan(db, { tenant: "tenant-a" });
      expect(detail).toContain("SEARCH");
      expect(detail).toContain("records_runs_tenant_idx");
      expect(detail).not.toContain("SCAN records");
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("listRecords(\"runs\", { tenant, correlationId }) is served by the correlation index, not the tenant index", async () => {
  // `runtime-bun`'s listRuns always passes tenant first in `where` (thread/session lookups are
  // `{ tenant, correlationId }`); the more selective correlationId index must still be chosen —
  // field iteration order must not decide it, selectivity priority must.
  const dir = mkdtempSync(join(tmpdir(), "cognate-runs-index-"));
  try {
    const path = join(dir, "cognate.sqlite");
    const store = openSqliteStore({ path });
    for (let i = 0; i < 20; i++) {
      await store.commit({ appends: [], records: [{ collection: "runs", id: `run-${i}`, expectedVersion: 0, value: { tenant: "tenant-a", agent: "agent.echo", correlationId: `corr-${i}` } }] });
    }
    expect((await store.listRecords("runs", { tenant: "tenant-a", correlationId: "corr-0" })).map((r) => r.id)).toEqual(["run-0"]);
    await store.close();

    const db = new Database(path, { readonly: true });
    try {
      const detail = plan(db, { tenant: "tenant-a", correlationId: "corr-0" });
      expect(detail).toContain("SEARCH");
      expect(detail).toContain("records_runs_correlation_idx");
      expect(detail).not.toContain("records_runs_tenant_idx");
      expect(detail).not.toContain("SCAN records");
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("listRecords(\"runs\", { tenant, agent }) is served by the agent index over the tenant index", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cognate-runs-index-"));
  try {
    const path = join(dir, "cognate.sqlite");
    const store = openSqliteStore({ path });
    for (let i = 0; i < 20; i++) {
      await store.commit({ appends: [], records: [{ collection: "runs", id: `run-${i}`, expectedVersion: 0, value: { tenant: "tenant-a", agent: i === 0 ? "agent.rare" : "agent.common", correlationId: `corr-${i}` } }] });
    }
    expect((await store.listRecords("runs", { tenant: "tenant-a", agent: "agent.rare" })).map((r) => r.id)).toEqual(["run-0"]);
    await store.close();

    const db = new Database(path, { readonly: true });
    try {
      const detail = plan(db, { tenant: "tenant-a", agent: "agent.rare" });
      expect(detail).toContain("SEARCH");
      expect(detail).toContain("records_runs_agent_idx");
      expect(detail).not.toContain("records_runs_tenant_idx");
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
