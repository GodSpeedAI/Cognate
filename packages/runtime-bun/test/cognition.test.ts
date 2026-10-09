// Runtime cognition: completed runs are indexed, recalled by later runs, and rebuilt on start (spec §15, §16, §36).
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryIndex, hashingEmbedder } from "@godspeedai/cognate-cognitive-memory";
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";
import { createRuntime } from "../src/index.ts";

const dir = mkdtempSync(join(tmpdir(), "cognate-cog-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const allow = { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) };
const actions = { authorize: () => ({ allow: true, reason: "ok" }) };

const support: AgentDefinition = {
  id: "agent.support",
  version: "1.0.0",
  async run(input, ctx) {
    const { issue } = input as { issue: string };
    const prior = await ctx.recall("prior", { text: issue, k: 3 });
    return { issue, resolution: `handled ${issue}`, recalled: prior.items.map((i) => i.sourceRef) };
  },
};

async function until(runtime: Awaited<ReturnType<typeof createRuntime>>, runId: string) {
  for (let i = 0; i < 500; i++) {
    const run = await runtime.service.getRun(alice, { runId });
    if (run.status === "completed" || run.status === "failed") return run;
    await Bun.sleep(10);
  }
  throw new Error("run did not finish");
}

describe("runtime cognition", () => {
  test("a new related run recalls a prior completed run, and only for the same tenant", async () => {
    const runtime = await createRuntime({ store: ":memory:", policy: allow, actions, agents: [support], cognition: { index: createMemoryIndex({ dimension: 64 }), embedder: hashingEmbedder(64), persistent: false } });
    const first = await runtime.service.startRun(alice, { agent: "agent.support", input: { issue: "duplicate payment on card" }, idempotencyKey: "1" });
    expect((await until(runtime, first.runId)).output).toMatchObject({ recalled: [] });
    await runtime.idle();
    const second = await runtime.service.startRun(alice, { agent: "agent.support", input: { issue: "customer reports duplicate payment" }, idempotencyKey: "2" });
    const done = await until(runtime, second.runId);
    expect((done.output as { recalled: string[] }).recalled).toContain(`run:${first.runId}`);
    const other = await runtime.service.startRun({ actor: { id: "bob", kind: "user" }, tenant: "tenant-b" }, { agent: "agent.support", input: { issue: "duplicate payment" }, idempotencyKey: "3" });
    await runtime.idle();
    const bobRun = await runtime.service.getRun({ actor: { id: "bob", kind: "user" }, tenant: "tenant-b" }, { runId: other.runId });
    expect((bobRun.output as { recalled: string[] }).recalled).toEqual([]);
    await runtime.close();
  });

  test("a non-persistent index is rebuilt from events when the runtime starts", async () => {
    const path = join(dir, "rebuild.sqlite");
    const make = () => createRuntime({ store: path, policy: allow, actions, agents: [support], cognition: { index: createMemoryIndex({ dimension: 64 }), embedder: hashingEmbedder(64), persistent: false } });
    let runtime = await make();
    const first = await runtime.service.startRun(alice, { agent: "agent.support", input: { issue: "refund stuck in pending" }, idempotencyKey: "a" });
    await until(runtime, first.runId);
    await runtime.idle();
    await runtime.close();
    runtime = await make();
    const second = await runtime.service.startRun(alice, { agent: "agent.support", input: { issue: "refund pending too long" }, idempotencyKey: "b" });
    expect(((await until(runtime, second.runId)).output as { recalled: string[] }).recalled).toContain(`run:${first.runId}`);
    await runtime.close();
  });
});
