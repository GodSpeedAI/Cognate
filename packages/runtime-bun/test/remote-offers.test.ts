import { afterEach, describe, expect, test } from "bun:test";
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import { createRuntime, type Runtime } from "../src/index.ts";

const alice = { tenant: "tenant-a", actor: { id: "alice", kind: "user" as const } };
const bob = { tenant: "tenant-b", actor: { id: "bob", kind: "user" as const } };

const agent: AgentDefinition = {
  id: "agent.sheet",
  version: "1.0.0",
  async run(_input, ctx) {
    const offers = await ctx.remoteOffers("plan");
    if (offers.length === 0) return { planned: [], output: null };
    const output = await ctx.invokeRemoteOffer("replace", offers[0]!.id, { text: "new value" });
    return { planned: offers.map((offer) => offer.contract.id), output };
  },
};

async function until<T>(read: () => Promise<T>, predicate: (value: T) => boolean, message: string): Promise<T> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const value = await read();
    if (predicate(value)) return value;
    if (Date.now() >= deadline) throw new Error(`timed out: ${message}`);
    await Bun.sleep(10);
  }
}

describe("remote capability offers", () => {
  let runtime: Runtime;
  afterEach(async () => await runtime?.close());

  const open = async (authorize: (request: { readonly action: string }) => { readonly allow: boolean; readonly reason: string } = () => ({ allow: true, reason: "ok" })) => {
    runtime = await createRuntime({ store: ":memory:", policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize }, agents: [agent] });
  };

  const publish = (caller = alice, leaseId = "sheet-mounted") => runtime.service.publishRemoteOffer(caller, {
    leaseId, agent: agent.id, contract: { id: "selection.replace", version: "1.0.0" }, description: "Replace the current spreadsheet selection", inputSchema: { type: "object" }, ttlMs: 1_000,
  });

  test("mount, replacement, unmount, expiry, and tenant isolation govern new planning choices", async () => {
    await open();
    const first = await publish();
    expect(await runtime.service.listRemoteOffers(alice, { agent: agent.id })).toHaveLength(1);
    const replacement = await publish(alice, "sheet-mounted");
    expect((await runtime.service.listRemoteOffers(alice, { agent: agent.id })).map((offer) => offer.id)).toEqual([replacement.id]);
    expect(first.id).toBe(replacement.id); // lease renewal preserves identity for in-flight calls
    expect(await runtime.service.listRemoteOffers(bob, { agent: agent.id })).toEqual([]);
    await expect(runtime.service.revokeRemoteOffer(bob, { offerId: replacement.id })).rejects.toMatchObject({ code: "not_found" });
    await runtime.service.revokeRemoteOffer(alice, { offerId: replacement.id });
    expect(await runtime.service.listRemoteOffers(alice, { agent: agent.id })).toEqual([]);
    const expiring = await runtime.service.publishRemoteOffer(alice, { leaseId: "brief", agent: agent.id, contract: { id: "selection.replace", version: "1.0.0" }, description: "brief", inputSchema: {}, ttlMs: 1 });
    await Bun.sleep(5);
    expect(await runtime.service.listRemoteOffers(alice, { agent: agent.id })).toEqual([]);
    await expect(runtime.service.revokeRemoteOffer(alice, { offerId: expiring.id })).rejects.toMatchObject({ code: "not_found" });
  });

  test("a stale offer cannot create a new continuation, while an already committed call survives disconnect and replay", async () => {
    await open();
    const stale = await publish();
    await runtime.service.revokeRemoteOffer(alice, { offerId: stale.id });
    const staleRun = await runtime.service.startRun(alice, { agent: agent.id, input: {}, idempotencyKey: "stale" });
    await until(() => runtime.service.getRun(alice, { runId: staleRun.runId }), (run) => run.status === "completed", "stale planning completion");
    expect((await runtime.service.getRun(alice, { runId: staleRun.runId })).output).toEqual({ planned: [], output: null });

    const live = await publish(alice, "connected-client");
    const { runId } = await runtime.service.startRun(alice, { agent: agent.id, input: {}, idempotencyKey: "live" });
    const continuation = await until(() => runtime.service.listContinuations(alice, { runId }), (list) => list.length === 1, "remote continuation");
    expect(continuation[0]!.condition).toMatchObject({ offerId: live.id, leaseId: "connected-client", capability: "selection.replace" });
    await runtime.service.revokeRemoteOffer(alice, { offerId: live.id });
    await runtime.service.resolveContinuation(alice, { continuationId: continuation[0]!.id, action: "resume", input: { ok: true, value: { replaced: true } }, idempotencyKey: "client-result" });
    const done = await until(() => runtime.service.getRun(alice, { runId }), (run) => run.status === "completed", "resumed after disconnect");
    expect(done.output).toEqual({ planned: ["selection.replace"], output: { replaced: true } });
  });

  test("offer publishing and discovery do not expand authority", async () => {
    await open(({ action }) => action.startsWith("remote.offer") ? { allow: false, reason: "no offers" } : { allow: true, reason: "ok" });
    await expect(publish()).rejects.toMatchObject({ code: "permission_denied" });
    await expect(runtime.service.listRemoteOffers(alice, { agent: agent.id })).rejects.toMatchObject({ code: "permission_denied" });
  });
});
