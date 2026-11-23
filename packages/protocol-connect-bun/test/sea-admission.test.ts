import { afterAll, describe, expect, test } from "bun:test";
import { createRouterTransport } from "@connectrpc/connect";
import { registerRuntimeService, createRemoteRuntimeService } from "@godspeedai/cognate-protocol-connect";
import { seaAssignmentAdmission } from "../src/index.ts";

// A real unix-socket SFWP stub: one NDJSON request per connection, like the SEA cell's channel.
function sfwpStub(answer: (request: any) => unknown): { socket: string; requests: any[]; stop: () => Promise<void> } {
  const path = `${import.meta.dir}/.sfwp-${crypto.randomUUID()}.sock`;
  const requests: any[] = [];
  const server = Bun.listen({
    unix: path,
    socket: {
      data(socket, data) {
        const text = new TextDecoder().decode(data);
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          const request = JSON.parse(line);
          requests.push(request);
          socket.write(`${JSON.stringify(answer(request))}\n`);
        }
      },
    },
  });
  return { socket: path, requests, stop: async () => await server.stop(true) };
}

const episodeRef = `episode:case-0001:item-03:1@sha256:${"cd".repeat(32)}`;
const ref = { linkId: "link-0001", caseId: "case-0001", assignmentId: "assign:case-0001:item-03:1:1", episodeRef };
const delegate = { id: "agent:http://127.0.0.1:8099/agent", kind: "agent" as const };
const caller = { tenant: "case-0001", actor: delegate };
const binding = {
  case_id: "case-0001",
  binding: {
    version: 1,
    assignment: {
      assignment_id: ref.assignmentId, case_id: "case-0001", step_id: "item-03", n: 1, k: 1,
      episode_ref: episodeRef,
      brief: {
        instruction: "Record the verifier's observation for gate G3.",
        adoptable_problem: "Why the evidence record is missing after the run.",
        domain_meaning: "An evidence record names an independent source.",
        context_refs: [{ ref: "doc:handoff-note-1", trust: "untrusted_reference" }],
      },
      budget: [
        { currency: "time", limit: 14400, unit: "seconds" },
        { currency: "attention", limit: "unknown", unit: "operator_minutes" },
        { currency: "money", limit: 5, unit: "USD" },
        { currency: "risk", limit: "unknown", unit: "class" },
        { currency: "recovery", limit: 1, unit: "revert_steps" },
      ],
      issued_at: "2026-11-20T09:00:00Z",
    },
    link_id: "link-0001", run_id: "run-0001",
    world_ref: "world:seed@sha256:0000000000000000000000000000000000000000000000000000000000000000",
    episode_kind: "evaluated",
    binding_digest: "ab".repeat(32),
    recorded_at: "2026-11-20T09:00:01Z",
    link: {
      link_id: "link-0001", case_id: "case-0001", episode_ref: episodeRef,
      assignment_id: ref.assignmentId, delegator: "operator_local", gateway_actor: null,
      delegate: delegate.id, issued_at: "2026-11-20T09:00:00Z", expires_at: "2099-01-01T00:00:00Z",
    },
    run: { run_id: "run-0001", case_id: "case-0001", episode_ref: episodeRef, verb: "delegate" },
  },
};
const hidden = { error: "unknown assignment binding", error_class: "input_error" };

const servers: { stop: () => Promise<void> }[] = [];
afterAll(async () => {
  for (const s of servers) await s.stop();
});

describe("seaAssignmentAdmission", () => {
  test("resolves verify and lookup from the authoritative binding over a real unix socket", async () => {
    const stub = sfwpStub(() => binding);
    servers.push(stub);
    const admission = seaAssignmentAdmission({
      endpoint: stub.socket,
      principal: { actorId: "operator_local", role: "operator" },
      semanticRef: "fde-sop.work::Task",
    });

    const verified = await admission.verify(caller, ref);
    expect(verified).toMatchObject({
      linkId: ref.linkId, caseId: ref.caseId, assignmentId: ref.assignmentId, episodeRef,
      tenant: "case-0001", delegate, expiresAt: "2099-01-01T00:00:00Z",
    });

    const resolved = await admission.lookup(caller, ref);
    expect(resolved?.assignment.assignment_id).toBe(ref.assignmentId);
    expect(resolved?.assignment.brief.domain_meaning).toBe("An evidence record names an independent source.");
    expect(resolved?.caseContext).toMatchObject({
      worldRef: "world:seed@sha256:0000000000000000000000000000000000000000000000000000000000000000",
      semanticRef: "fde-sop.work::Task", caseId: "case-0001", planItemId: "item-03",
      role: "executor", kind: "evaluated", episodeRef, assignmentId: ref.assignmentId,
    });
    expect(resolved?.agent).toBe(delegate.id);
    expect((resolved?.input as { brief: { instruction: string } }).brief.instruction).toContain("gate G3");

    // The read names the verb, the exact ids and the configured principal.
    expect(stub.requests[0]).toEqual({
      verb: "assignment_binding_get", case_id: "case-0001", assignment_id: ref.assignmentId,
      actor: { actor_id: "operator_local", role: "operator" },
    });
  });

  test("a wrong tenant or a non-agent caller never reaches SEA", async () => {
    const stub = sfwpStub(() => binding);
    servers.push(stub);
    const admission = seaAssignmentAdmission({
      endpoint: stub.socket,
      principal: { actorId: "operator_local", role: "operator" },
      semanticRef: "fde-sop.work::Task",
    });
    expect(await admission.verify({ tenant: "other", actor: delegate }, ref)).toBeUndefined();
    expect(await admission.lookup({ tenant: "other", actor: delegate }, ref)).toBeUndefined();
    expect(await admission.verify({ tenant: "case-0001", actor: { id: delegate.id, kind: "user" } }, ref)).toBeUndefined();
    expect(stub.requests).toHaveLength(0);
  });

  test("hidden, malformed, mismatched and unreadable answers fail closed", async () => {
    const stub = sfwpStub(() => binding);
    servers.push(stub);
    const options = {
      endpoint: stub.socket,
      principal: { actorId: "operator_local", role: "operator" },
      semanticRef: "fde-sop.work::Task",
    };
    const good = seaAssignmentAdmission(options);
    expect(await good.verify(caller, ref)).toBeDefined();

    const hiddenStub = sfwpStub(() => hidden);
    servers.push(hiddenStub);
    const denied = seaAssignmentAdmission({ ...options, endpoint: hiddenStub.socket });
    expect(await denied.verify(caller, ref)).toBeUndefined();
    expect(await denied.lookup(caller, ref)).toBeUndefined();

    const garbage = sfwpStub(() => ({ unexpected: true }));
    servers.push(garbage);
    const malformed = seaAssignmentAdmission({ ...options, endpoint: garbage.socket });
    expect(await malformed.lookup(caller, ref)).toBeUndefined();

    // A binding for another link or delegate is not this caller's admission.
    const reissued = sfwpStub(() => structuredClone(binding));
    servers.push(reissued);
    const wrongLink = seaAssignmentAdmission({ ...options, endpoint: reissued.socket });
    expect(await wrongLink.verify(caller, { ...ref, linkId: "link-0002" })).toBeUndefined();
    const otherDelegate = { tenant: "case-0001", actor: { id: "agent:other", kind: "agent" as const } };
    expect(await wrongLink.verify(otherDelegate, ref)).toBeUndefined();

    const dead = seaAssignmentAdmission({ ...options, endpoint: `${import.meta.dir}/.sfwp-absent.sock`, deadlineMs: 250 });
    expect(await dead.verify(caller, ref)).toBeUndefined();
    expect(await dead.lookup(caller, ref)).toBeUndefined();
  });

  test("the production provider drives the Connect assigned start over the wire", async () => {
    const stub = sfwpStub(() => binding);
    servers.push(stub);
    const starts: any[] = [];
    const service = {
      startRun: async (who: unknown, request: unknown) => {
        starts.push([who, request]);
        return { runId: "r1", agent: "a", tenant: "case-0001", status: "running", input: null, output: null, correlationId: "c", startedBy: delegate.id, waitingOn: [] };
      },
    } as never;
    const admission = seaAssignmentAdmission({
      endpoint: stub.socket,
      principal: { actorId: "operator_local", role: "operator" },
      semanticRef: "fde-sop.work::Task",
    });
    const transport = createRouterTransport((router) =>
      registerRuntimeService(router, service, { authenticate: () => caller, maxJsonDepth: 32, assignmentAdmission: admission }),
    );
    const remote = createRemoteRuntimeService(transport, () => "case-0001:delegate");
    const run = await remote.startRun(caller, { agent: "a", input: null, idempotencyKey: "k", assignmentRef: ref });
    expect(run.runId).toBe("r1");
    expect(starts[0][1]).toMatchObject({
      assignment: { assignment_id: ref.assignmentId },
      caseContext: { planItemId: "item-03", kind: "evaluated" },
      linkExpiresAt: "2099-01-01T00:00:00Z",
      assignmentLinkId: "link-0001",
      agent: delegate.id,
    });
    // An assigned start for a hidden binding is denied before any run.
    const hiddenStub = sfwpStub(() => hidden);
    servers.push(hiddenStub);
    const deniedAdmission = seaAssignmentAdmission({ endpoint: hiddenStub.socket, principal: { actorId: "operator_local", role: "operator" }, semanticRef: "x" });
    const deniedTransport = createRouterTransport((router) =>
      registerRuntimeService(router, service, { authenticate: () => caller, maxJsonDepth: 32, assignmentAdmission: deniedAdmission }),
    );
    const deniedRemote = createRemoteRuntimeService(deniedTransport, () => "case-0001:delegate");
    await expect(deniedRemote.startRun(caller, { agent: "a", input: null, idempotencyKey: "k2", assignmentRef: ref }))
      .rejects.toMatchObject({ code: "permission_denied", message: "assignment admission denied" });
    expect(starts).toHaveLength(1);
  });
});
