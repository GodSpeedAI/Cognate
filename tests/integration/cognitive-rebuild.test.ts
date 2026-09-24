// CG-COG-004 (spec §3.5, Phase 6, §40.B): deleting and rebuilding the cognitive index leaves deterministic behaviour unchanged.
import { expect, test } from "bun:test";
import { createMemoryIndex, hashingEmbedder } from "@cognate/cognitive-memory";
import type { AgentDefinition, Caller } from "@cognate/runtime-api";
import { alice, mallory } from "@cognate/runtime-api/conformance";
import { createRuntime } from "@cognate/runtime-bun";

const policy = { authorize: (r: { actor: { id: string } }) => (r.actor.id === "mallory" ? { allow: false, policyId: "p", reason: "denied" } : { allow: true, policyId: "p", reason: "ok" }) };
const actions = { authorize: () => ({ allow: true, reason: "ok" }) };
const agent: AgentDefinition = {
  id: "agent.case",
  version: "1.0.0",
  async run(input, ctx) {
    const recalled = await ctx.recall("r", { text: String((input as { text: string }).text), k: 5 });
    const lookup = await ctx.invoke("tool.lookup", { key: "k" }).then((v) => ({ ok: v }), (e: Error) => ({ error: e.name }));
    return { lookup, recalled: recalled.items.length };
  },
};
const components = [{ id: "lookup", provides: [{ id: "tool.lookup", version: "1.0.0" }], activate: (f: { provide: (c: { id: string; version: string }, h: () => unknown) => void }) => f.provide({ id: "tool.lookup", version: "1.0.0" }, () => "value") }];

test("authorization and deterministic outcomes are identical before deletion, after deletion, and after rebuild", async () => {
  const index = createMemoryIndex({ dimension: 64 });
  const runtime = await createRuntime({ store: ":memory:", policy, actions, agents: [agent], components: components as never, cognition: { index, embedder: hashingEmbedder(64), persistent: false } });
  const run = async (caller: Caller, key: string) => {
    const { runId } = await runtime.service.startRun(caller, { agent: "agent.case", input: { text: "duplicate charge investigation" }, idempotencyKey: key });
    await runtime.idle();
    return (await runtime.service.getRun(caller, { runId })).output as { lookup: unknown; recalled: number };
  };
  for (let i = 0; i < 3; i++) await run(alice, `seed-${i}`);
  await runtime.idle();
  const before = { alice: await run(alice, "b1"), mallory: await run(mallory, "b2"), direct: await runtime.service.invoke(mallory, { capability: "tool.lookup", input: null }).catch((e: { code: string }) => e.code) };
  expect(before.alice.recalled).toBeGreaterThan(0);

  await index.clear();
  const deleted = { alice: await run(alice, "d1"), mallory: await run(mallory, "d2"), direct: await runtime.service.invoke(mallory, { capability: "tool.lookup", input: null }).catch((e: { code: string }) => e.code) };
  expect(deleted.alice.lookup).toEqual(before.alice.lookup);
  expect(deleted.mallory.lookup).toEqual(before.mallory.lookup);
  expect(deleted.direct).toEqual(before.direct);

  await runtime.rebuildCognition();
  const rebuilt = await run(alice, "r1");
  expect(rebuilt.lookup).toEqual(before.alice.lookup);
  expect(rebuilt.recalled).toBeGreaterThan(0);
  await runtime.close();
});
