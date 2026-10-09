// CG-WIR-003's PostgreSQL half: the full transport-independent runtime service kit against a
// PostgreSQL-backed runtime, including the restart tests (persistent). DEBT-011's runtime-level proof.
// Needs the development database: `just db-up` (pg0), or set COGNATE_TEST_POSTGRES_URL.
import { runtimeServiceConformance } from "@godspeedai/cognate-runtime-api/conformance";
import { expect, test } from "bun:test";
import { openPostgresStore, resolvePg0Url } from "@godspeedai/cognate-store-postgres";
import { createRuntime } from "../src/index.ts";
import { kitPolicies } from "./support.ts";

const url = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

// Fail fast with a clear message when the database is missing (a skip is never a pass).
{
  try {
    const probe = await openPostgresStore({ url, schema: `cognate_probe_${Date.now()}`, pollMs: 0 });
    await probe.dropSchema();
    await probe.close();
  } catch (cause) {
    throw new Error(`runtime-on-postgres conformance needs a PostgreSQL server (just db-up); ${url} unreachable`, { cause });
  }
}

let counter = 0;
runtimeServiceConformance(
  "runtime-bun on PostgreSQL",
  async (setup) => {
    const schema = `cognate_runtime_${Date.now().toString(36)}_${counter++}`;
    const make = () => createRuntime({ store: { postgres: { url, schema } }, agents: setup.agents, ...kitPolicies(setup) });
    let runtime = await make();
    return {
      get service() {
        return runtime.service;
      },
      async restart() {
        await runtime.close();
        runtime = await make();
        return runtime.service;
      },
      async close() {
        await runtime.close();
        const cleaner = await openPostgresStore({ url, schema, pollMs: 0 });
        await cleaner.dropSchema();
        await cleaner.close();
      },
    };
  },
  { persistent: true },
);

test("postgresPg0 config boots a runtime against the pg0-managed instance", async () => {
  const schema = `cognate_pg0_config_${Date.now().toString(36)}`;
  const runtime = await createRuntime({
    store: { postgresPg0: { name: "cognate-dev", schema } },
    agents: [{ id: "agent.echo", version: "1.0.0", run: async (input) => ({ echo: input }) }],
    policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
  });
  try {
    const caller = { actor: { id: "alice", kind: "user" as const }, tenant: "tenant-a" };
    const run = await runtime.service.startRun(caller, { agent: "agent.echo", input: { hi: 1 }, idempotencyKey: "pg0-boot" });
    for (let i = 0; i < 300; i++) {
      const view = await runtime.service.getRun(caller, { runId: run.runId });
      if (view.status === "completed") return;
      await Bun.sleep(10);
    }
    throw new Error("run did not complete on the pg0-managed instance");
  } finally {
    await runtime.close();
    const cleaner = await openPostgresStore({ url: await resolvePg0Url({ name: "cognate-dev", noStart: true }), schema, pollMs: 0 });
    await cleaner.dropSchema();
    await cleaner.close();
  }
}, 30_000);
