// CG-SEC-001 (spec §32): erasure leaves a tombstone, replay reports a redacted gap, derived views and cognition drop the content.
import { expect, test } from "bun:test";
import { createMemoryIndex, hashingEmbedder } from "@godspeedai/cognitive-memory";
import type { AgentDefinition } from "@godspeedai/runtime-api";
import { alice } from "@godspeedai/runtime-api/conformance";
import { createRuntime } from "@godspeedai/runtime-bun";

const intake: AgentDefinition = { id: "agent.intake", version: "1.0.0", run: async (input) => ({ summary: `patient ${(input as { name: string }).name} admitted` }) };

test("erasing a run's payloads removes content everywhere derived and keeps causal envelopes", async () => {
  const index = createMemoryIndex({ dimension: 64 });
  const runtime = await createRuntime({ store: ":memory:", policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) }, agents: [intake], cognition: { index, embedder: hashingEmbedder(64), persistent: false } });
  const { runId } = await runtime.service.startRun(alice, { agent: "agent.intake", input: { name: "Zebulon Quartz" }, idempotencyKey: "i1" });
  await runtime.idle();
  const events = await runtime.store.readStream(`run-${runId}`);
  expect(JSON.stringify(events)).toContain("Zebulon Quartz");
  expect(await index.count()).toBeGreaterThan(0);
  for (const e of events) if (JSON.stringify(e.payload).includes("Zebulon")) await runtime.erase(e.eventId, "patient-request", { id: "dpo", kind: "user" });
  await runtime.idle();
  const after = await runtime.store.readStream(`run-${runId}`);
  expect(after.map((e) => e.eventId)).toEqual(events.map((e) => e.eventId));
  expect(JSON.stringify(after)).not.toContain("Zebulon");
  expect(after.filter((e) => e.erasure).every((e) => e.erasure!.reason === "patient-request")).toBe(true);
  expect(JSON.stringify(await runtime.service.getRun(alice, { runId }))).not.toContain("Zebulon");
  const hits = await index.similar({ vector: (await hashingEmbedder(64).embed(["patient Zebulon Quartz admitted"]))[0]!, k: 5, tenant: "tenant-a" });
  for (const hit of hits) expect(JSON.stringify(await index.get(hit.id))).not.toContain("Zebulon");
  expect((await runtime.store.readStream("$erasures")).length).toBeGreaterThan(0);
  await runtime.close();
});
