// Spec §32: public projections are tenant-partitioned; a caller only sees its own tenant's entries.
import { expect, test } from "bun:test";
import type { Projection } from "@cognate/projections";
import type { AgentDefinition } from "@cognate/runtime-api";
import { createRuntime } from "../src/index.ts";

/** Public projections key state as `<tenant>/<key>`; the service strips the prefix and filters by caller tenant. */
const perTenantRuns: Projection = {
  name: "runs-by-agent",
  version: "1",
  apply: (e, state) => (e.eventType === "run.started" ? [{ key: `${e.tenant}/count`, value: ((state.get(`${e.tenant}/count`) as number | undefined) ?? 0) + 1 }] : []),
};
const echo: AgentDefinition = { id: "agent.echo", version: "1.0.0", run: async (i) => i };

test("readProjection returns only the caller tenant's partition", async () => {
  const runtime = await createRuntime({ store: ":memory:", policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) }, agents: [echo], projections: [{ projection: perTenantRuns, public: true }] });
  const a = { actor: { id: "alice", kind: "user" as const }, tenant: "tenant-a" };
  const b = { actor: { id: "bob", kind: "user" as const }, tenant: "tenant-b" };
  await runtime.service.startRun(a, { agent: "agent.echo", input: 1, idempotencyKey: "a1" });
  await runtime.service.startRun(a, { agent: "agent.echo", input: 2, idempotencyKey: "a2" });
  await runtime.service.startRun(b, { agent: "agent.echo", input: 3, idempotencyKey: "b1" });
  await runtime.idle();
  expect(await runtime.service.readProjection(a, { name: "runs-by-agent" })).toEqual([{ key: "count", value: 2 }]);
  expect(await runtime.service.readProjection(b, { name: "runs-by-agent" })).toEqual([{ key: "count", value: 1 }]);
  expect(await runtime.service.readProjection({ actor: { id: "eve", kind: "user" }, tenant: "tenant-c" }, { name: "runs-by-agent" })).toEqual([]);
  await runtime.close();
});
