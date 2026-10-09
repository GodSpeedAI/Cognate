// CG-PRJ-002 (spec §13.3, Phase 2 success criterion): delete all derived state and reconstruct it from SQLite.
import { afterAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { event } from "@godspeedai/cognate-events/conformance";
import type { StoredEvent } from "@godspeedai/cognate-events";
import { ProjectionRunner, type Projection } from "@godspeedai/cognate-projections";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";

const dir = mkdtempSync(join(tmpdir(), "cognate-rebuild-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const caseState: Projection = {
  name: "case-state",
  version: "1",
  apply: (e: StoredEvent) => (e.eventType.startsWith("case.") ? [{ key: e.streamId, value: { status: e.eventType.slice(5), seq: e.streamSequence } }] : []),
};
const perRunCounts: Projection = {
  name: "run-counts",
  version: "1",
  apply: (e, state) => (e.runId ? [{ key: e.runId, value: ((state.get(e.runId) as number | undefined) ?? 0) + 1 }] : []),
};

test("derived tables can be dropped wholesale and rebuilt to identical state from authoritative events", async () => {
  const path = join(dir, "app.sqlite");
  let store = openSqliteStore({ path });
  for (let c = 0; c < 20; c++) {
    const stream = `case-${c}`;
    const transitions = ["opened", "investigating", ...(c % 3 === 0 ? ["resolved"] : [])];
    await store.commit({ appends: [{ streamId: stream, expectedVersion: 0, events: transitions.map((t) => event(`case.${t}`, { c }, { runId: `run-${c % 4}` })) }] });
  }
  for (const projection of [caseState, perRunCounts]) await new ProjectionRunner(store, projection).catchUp();
  const before = { cases: await store.listProjection("case-state"), runs: await store.listProjection("run-counts") };
  expect(before.cases).toHaveLength(20);
  await store.close();

  // Delete every derived row directly, as an operator losing derived state would.
  const db = new Database(path);
  db.exec("DELETE FROM projection_state; DELETE FROM projection_checkpoints;");
  db.close();

  store = openSqliteStore({ path });
  expect(await store.listProjection("case-state")).toEqual([]);
  for (const projection of [caseState, perRunCounts]) expect((await new ProjectionRunner(store, projection).catchUp()).status).toBe("ok");
  expect({ cases: await store.listProjection("case-state"), runs: await store.listProjection("run-counts") }).toEqual(before);
  expect(await store.streamVersion("case-0")).toBe(3);
  await store.close();
});
