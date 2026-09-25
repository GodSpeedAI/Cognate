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
      // run.completed's payload wraps the agent's return value as `{ output: <value> }` (runtime-bun
      // executor.ts); unwrap it so callers see the agent's output directly, as elsewhere in the
      // framework (e.g. runtime-bun/cognition.ts's `field(event.payload, "output")`).
      output: (events.find((e) => e.eventType === "run.completed")?.payload as { readonly output?: unknown } | null)?.output ?? null,
    };
  }),
);
const observations = await store.listRecords("observations");
const snapshots = await store.listRecords("rvf_snapshots");
const artifacts = await store.listRecords("artifacts");
console.log(JSON.stringify({ runs, observations: observations.map((r) => r.value), snapshots: snapshots.map((r) => r.value), artifacts: artifacts.map((r) => r.value) }));
await store.close();
