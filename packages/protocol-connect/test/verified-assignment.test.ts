import { expect, test } from "bun:test";
import { devToken, devTokenAuthenticator } from "@godspeedai/cognate-protocol-connect-bun";
import { validateAssignment, verifiedAssignmentMatches } from "@godspeedai/cognate-runtime-api";
import { Code, createClient, createRouterTransport } from "@connectrpc/connect";
import { createRemoteRuntimeService, registerRuntimeService } from "../src/index.ts";

const caller = { tenant: "tenant", actor: { id: "delegate", kind: "user" as const } };
const ref = { linkId: "link-original", caseId: "case", assignmentId: "assign:case:step:1:1", episodeRef: `episode:case:step:1@sha256:${"a".repeat(64)}` };
const assignment = { assignment_id: ref.assignmentId, case_id: ref.caseId, step_id: "step", n: 1, k: 1, episode_ref: ref.episodeRef, brief: { instruction: "work", adoptable_problem: "p", domain_meaning: "d", context_refs: [] }, budget: [], issued_at: "2026-01-01T00:00:00Z" };
const context = { caseId: ref.caseId, planItemId: "step", worldRef: "world", semanticRef: "semantic", role: "worker", kind: "exploratory" as const };
const verified = { ...ref, tenant: caller.tenant, delegate: caller.actor, expiresAt: "2099-01-01T00:00:00Z" };

for (const binary of [false, true]) {
  test(`assigned Connect starts require verified delegate and authoritative assignment (${binary ? "binary" : "JSON"})`, async () => {
    let starts: any[] = [];
    let verification: any = verified;
    let resolved: any = { assignment, caseContext: context, agent: "trusted-agent", input: { instruction: assignment.brief.instruction } };
    let lookups = 0;
    let seenVerify: unknown;
    let seenLookup: unknown;
    let verifies = 0;
    const order: string[] = [];
    const service = { startRun: async (c: unknown, request: unknown) => { starts.push([c, request]); return { runId: "r", agent: "a", tenant: caller.tenant, status: "running", input: null, output: null, correlationId: "c", startedBy: "delegate", waitingOn: [] }; } } as never;
    const transport = createRouterTransport((router) => registerRuntimeService(router, service, { authenticate: devTokenAuthenticator, maxJsonDepth: 32, assignmentAdmission: {
      verify: async (who, reference) => { order.push("verify"); verifies++; seenVerify = [who, reference]; if (verification === "unavailable") throw new Error("offline"); return verification; },
      lookup: async (who, reference) => { order.push("lookup"); seenLookup = [who, reference]; lookups++; if (resolved === "unavailable") throw new Error("offline"); return resolved; },
    } }), { transport: { useBinaryFormat: binary } });
    const remote = createRemoteRuntimeService(transport, devToken);
    const start = () => remote.startRun(caller, { agent: "a", input: null, idempotencyKey: "k", assignmentRef: ref });
    {
      await expect(remote.startRun(caller, { agent: "a", input: null, idempotencyKey: "k", assignmentRef: { ...ref, linkId: "" } })).rejects.toMatchObject({ code: "permission_denied" });
      await expect(remote.startRun(caller, { agent: "a", input: null, idempotencyKey: "k", assignmentRef: ref, state: { forged: true } })).rejects.toMatchObject({ code: "permission_denied" });
      await expect(remote.startRun(caller, { agent: "a", input: null, idempotencyKey: "k", assignmentRef: ref, correlationId: "existing-thread" })).rejects.toMatchObject({ code: "permission_denied" });
      await start();
      expect(order).toEqual(["lookup", "verify"]);
      expect(seenVerify).toEqual([caller, ref]);
      expect(seenLookup).toEqual([caller, ref]);
      expect(starts[0][0]).toEqual(caller);
      expect(starts[0][1]).toMatchObject({ assignment, caseContext: context, linkExpiresAt: verified.expiresAt, assignmentLinkId: ref.linkId, agent: "trusted-agent", input: { instruction: "work" } });
      for (const invalid of [undefined, "unavailable", { ...verified, tenant: "other" }, { ...verified, delegate: { ...caller.actor, id: "other" } }, { ...verified, delegate: { ...caller.actor, kind: "service" } }, { ...verified, linkId: "link-reissued" }, { ...verified, caseId: "other" }, { ...verified, assignmentId: "other" }, { ...verified, episodeRef: "other" }, { ...verified, expiresAt: "invalid" }, { ...verified, expiresAt: "2000-01-01T00:00:00Z" }]) {
        verification = invalid;
        const before = lookups;
        await expect(start()).rejects.toMatchObject({ code: "permission_denied" });
        expect(lookups).toBe(before + 1);
      }
      verification = verified;
      for (const invalid of [undefined, "unavailable", { assignment: { ...assignment, assignment_id: "other" }, caseContext: context }, { assignment, caseContext: { ...context, caseId: "other" } }]) {
        resolved = invalid;
        const before = verifies;
        await expect(start()).rejects.toMatchObject({ code: "permission_denied" });
        expect(verifies).toBe(before);
      }
      expect(starts).toHaveLength(1);
    }
  });
}

test("assigned starts default deny without a configured verifier", async () => {
  let started = false;
  const service = { startRun: async () => { started = true; } } as never;
  const transport = createRouterTransport((router) => registerRuntimeService(router, service, { authenticate: devTokenAuthenticator, maxJsonDepth: 32 }));
  const remote = createRemoteRuntimeService(transport, devToken);
  await expect(remote.startRun(caller, { agent: "a", input: null, idempotencyKey: "k", assignmentRef: ref })).rejects.toBeDefined();
  expect(started).toBe(false);
});

test("verified Connect start reaches the real assignment lifecycle", async () => {
  const { createRuntime } = await import("@godspeedai/cognate-runtime-bun");
  const fixture = await import("../../runtime-api/test/fixtures/assignment/valid/assignment-first-delegation.json");
  const parsed = validateAssignment(fixture.default);
  if (!parsed.ok) throw new Error("invalid assignment fixture");
  const actual = parsed.value;
  const actualRef = { linkId: "link-original", caseId: actual.case_id, assignmentId: actual.assignment_id, episodeRef: actual.episode_ref };
  const actualContext = { worldRef: `world:fde-sop@sha256:${"a".repeat(64)}`, semanticRef: "fde-sop.work::Task", caseId: actual.case_id, planItemId: actual.step_id, role: "executor", kind: "evaluated" as const };
  const runtime = await createRuntime({ store: ":memory:", agents: [{ id: "agent.quick", version: "1", run: async () => ({ done: true }) }], policy: { authorize: () => ({ allow: true, policyId: "test", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) } });
  const transport = createRouterTransport((router) => registerRuntimeService(router, runtime.service, { authenticate: devTokenAuthenticator, maxJsonDepth: 32, assignmentAdmission: {
    verify: async () => ({ ...actualRef, tenant: caller.tenant, delegate: caller.actor, expiresAt: verified.expiresAt }),
    lookup: async () => ({ assignment: actual, caseContext: actualContext, agent: "agent.quick", input: { brief: fixture.default.brief } }),
  } }));
  try {
    const remote = createRemoteRuntimeService(transport, devToken);
    const run = await remote.startRun(caller, { agent: "caller-chosen", input: { brief: "forged" }, idempotencyKey: "real", assignmentRef: actualRef });
    const view = await runtime.assignments.getAssignment(caller, { runId: run.runId });
    expect(view.assignment).toEqual(actual);
    const events = [];
    for await (const event of runtime.service.events(caller, { runId: run.runId })) events.push(event);
    expect(events[0]?.metadata).toMatchObject({ assignmentLinkId: actualRef.linkId });
    expect(run.agent).toBe("agent.quick");
    expect(run.input).toEqual({ brief: fixture.default.brief });
    expect(view.events.slice(0, 2).map((event) => event.event)).toEqual(["issued", "started"]);
  } finally { await runtime.close(); }
});

test("an old server cannot downgrade an assigned start to an ordinary run", async () => {
  const { RuntimeService } = await import("@godspeedai/cognate-proto");
  let ordinaryStarts = 0;
  const transport = createRouterTransport((router) => router.service(RuntimeService, {
    startRun: async () => { ordinaryStarts++; throw new Error("ordinary start must not run"); },
    // A server predating StartAssignedRun has no implementation for that method.
  }));
  const client = createClient(RuntimeService, transport);
  await expect(client.startAssignedRun({ assignmentRef: ref, idempotencyKey: "k" })).rejects.toMatchObject({ code: Code.Unimplemented });
  const remote = createRemoteRuntimeService(transport, devToken);
  await expect(remote.startRun(caller, { agent: "a", input: null, idempotencyKey: "k", assignmentRef: ref })).rejects.toMatchObject({ code: "unavailable" });
  expect(ordinaryStarts).toBe(0);
});

test("a link revoked during the trusted lookup cannot start a run", async () => {
  let active = true;
  let started = false;
  const service = { startRun: async () => { started = true; } } as never;
  const transport = createRouterTransport((router) => registerRuntimeService(router, service, { authenticate: devTokenAuthenticator, maxJsonDepth: 32, assignmentAdmission: {
    lookup: async () => { active = false; return { assignment: assignment as never, caseContext: context, agent: "a", input: null }; },
    verify: async () => active ? verified : undefined,
  } }));
  const remote = createRemoteRuntimeService(transport, devToken);
  await expect(remote.startRun(caller, { agent: "a", input: null, idempotencyKey: "k", assignmentRef: ref })).rejects.toMatchObject({ code: "permission_denied" });
  expect(started).toBe(false);
});

test("verified delegation expires at its exact expiry instant", () => {
  const expiry = Date.parse(verified.expiresAt);
  expect(verifiedAssignmentMatches(ref, caller, verified, expiry - 1)).toBe(true);
  expect(verifiedAssignmentMatches(ref, caller, verified, expiry)).toBe(false);
});
