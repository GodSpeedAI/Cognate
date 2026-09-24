// Reads authoritative state directly from the SQLite file, independent of the UI and the app process (spec §36).
// Usage: bun verify.ts <db> <runId...>
import { openSqliteStore } from "../../packages/store-sqlite/src/index.ts";

const [db, ...runIds] = process.argv.slice(2);
const store = openSqliteStore({ path: db! });
const runs = await Promise.all(
  runIds.map(async (runId) => {
    const events = await store.readStream(`run-${runId}`);
    return {
      runId,
      types: events.map((e) => e.eventType),
      invocations: events.filter((e) => e.eventType === "run.invocation").map((e) => ({ eventId: e.eventId, semanticRef: e.semanticRef ?? null })),
      output: events.find((e) => e.eventType === "run.completed")?.payload ?? null,
    };
  }),
);
const observations = await store.listRecords("observations");
const snapshots = await store.listRecords("rvf_snapshots");
const artifacts = await store.listRecords("artifacts");
console.log(JSON.stringify({ runs, observations: observations.map((r) => r.value), snapshots: snapshots.map((r) => r.value), artifacts: artifacts.map((r) => r.value) }));
await store.close();
