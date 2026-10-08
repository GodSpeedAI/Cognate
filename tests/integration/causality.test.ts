// CG-OBS-001 (spec §33, §40.M): causal identity is machine-inspectable across run, events, fibers, capabilities, semantics, artifacts.
import { expect, test } from "bun:test";
import type { AgentDefinition } from "@godspeedai/runtime-api";
import { alice } from "@godspeedai/runtime-api/conformance";
import { createRuntime } from "@godspeedai/runtime-bun";

const semanticRef = { namespace: "billing", id: "billing::Refund", kind: "Flow", source: { uri: "file:///domain/billing.sea", digest: "sha256:abc" }, projectionVersion: "1" };
const agent: AgentDefinition = {
  id: "agent.refund",
  version: "1.0.0",
  async run(_input, ctx) {
    const quote = await ctx.invoke("billing.quote", { amount: 10 });
    await ctx.waitFor("approval", { type: "refund-approval", condition: { kind: "human_approval" }, payload: { quote }, semanticRef });
    const artifactId = await ctx.artifact({ name: "receipt.txt", mediaType: "text/plain", bytes: new TextEncoder().encode("ok") });
    return { artifactId };
  },
};

test("inspect(correlationId) reconstructs run, event causation, fiber, capability/provider, semantic ref, and artifact", async () => {
  const runtime = await createRuntime({
    store: ":memory:",
    policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: [agent],
    components: [{ id: "billing", provides: [{ id: "billing.quote", version: "1.0.0", semanticRef }], activate: (f) => f.provide({ id: "billing.quote", version: "1.0.0", semanticRef }, (i) => ({ total: (i as { amount: number }).amount * 2 })) }],
  });
  const { runId } = await runtime.service.startRun(alice, { agent: "agent.refund", input: {}, idempotencyKey: "c1", correlationId: "corr-causal" });
  await runtime.idle();
  const [c] = await runtime.service.listContinuations(alice, { runId });
  await runtime.service.resolveContinuation(alice, { continuationId: c!.id, action: "resume", input: { approved: true }, idempotencyKey: "ok" });
  await runtime.idle();
  const chain = await runtime.inspect("corr-causal");
  expect(chain.runs).toEqual([runId]);
  expect(chain.invocations).toEqual([expect.objectContaining({ capability: "billing.quote", decision: expect.objectContaining({ allow: true }) })]);
  expect(chain.invocations[0]!.providerId).toBeString();
  expect(chain.invocations[0]!.fiberId).toBeString();
  expect(chain.artifacts).toHaveLength(1);
  const byId = new Map(chain.events.map((e) => [e.eventId, e]));
  for (const e of chain.events) if (e.causationId) expect(byId.has(e.causationId)).toBe(true);
  expect(chain.events.some((e) => JSON.stringify(e.semanticRef ?? null).includes("billing::Refund"))).toBe(true);
  expect(chain.events.filter((e) => e.causationId === null).map((e) => e.eventType)).toEqual(["run.started"]);
  expect(chain.observations).toEqual([]);
  await runtime.close();
});
