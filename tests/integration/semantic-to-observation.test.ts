// CG-RT-003 (spec §37 Phase 5): DomainForge → SemanticRef → runtime execution → committed event → queued observation.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { bindCapabilities, loadSemanticProjection } from "@godspeedai/cognate-domainforge";
import { ObservationDelivery, observationIntent, type Observation, type ObservationPort } from "@godspeedai/cognate-realitytrace";
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";

test("a semantic object is correlated through execution, a durable event, and a delivered observation", async () => {
  const loaded = loadSemanticProjection(readFileSync("packages/domainforge/test/fixtures/basic.sea", "utf8"), { uri: "file:///domain/basic.sea" });
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.error));
  const flow = loaded.projection.objects.find((o) => o.kind === "Flow")!;
  const [contract] = bindCapabilities(loaded.projection, [{ semanticId: flow.ref.id, capability: { id: "shipment.dispatch", version: "1.0.0" } }]);
  const agent: AgentDefinition = { id: "agent.logistics", version: "1.0.0", run: async (_i, ctx) => ({ dispatched: await ctx.invoke("shipment.dispatch", { quantity: 10 }) }) };

  const runtime = await createRuntime({
    store: ":memory:",
    policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: [agent],
    components: [{ id: "dispatcher", provides: [contract!], activate: (f) => f.provide(contract!, () => ({ ok: true })) }],
    // Generic hook: extra outbox intents committed atomically with the event (no runtime dependency on RealityTrace).
    outboxFor: (event) => (event.eventType === "run.invocation" ? [observationIntent(event, { classification: "durable_fact", capabilityId: String((event.metadata as { capability?: string } | undefined)?.capability) })] : []),
  });
  const { runId } = await runtime.service.startRun(alice, { agent: "agent.logistics", input: {}, idempotencyKey: "rt3", correlationId: "corr-rt3" });
  await runtime.idle();
  expect((await runtime.service.getRun(alice, { runId })).status).toBe("completed");

  const invocation = (await runtime.store.readStream(`run-${runId}`)).find((e) => e.eventType === "run.invocation")!;
  expect(invocation.semanticRef).toMatchObject({ id: flow.ref.id, source: loaded.projection.source });

  const delivered: Observation[] = [];
  const port: ObservationPort = { id: "memory", record: async (o) => (delivered.push(o), { status: "accepted", observationId: o.observationId, targetRef: "ledger:1", detail: null }) };
  const delivery = new ObservationDelivery(runtime.store, { port, backoff: { baseMs: 1, maxMs: 1, maxAttempts: 3 } });
  await delivery.drain();
  expect(delivered).toHaveLength(1);
  expect(delivered[0]).toMatchObject({ eventId: invocation.eventId, correlationId: "corr-rt3", runId, capabilityId: "shipment.dispatch", semanticRef: { id: flow.ref.id } });
  expect(await delivery.status(invocation.eventId)).toMatchObject({ state: "accepted" });

  const chain = await runtime.inspect("corr-rt3");
  expect(chain.observations).toEqual([delivered[0]!.observationId]);
  await runtime.close();
});
