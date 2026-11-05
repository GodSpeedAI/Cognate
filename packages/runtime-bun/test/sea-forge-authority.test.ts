import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAuthorityRequest, buildTransitionRequest, createRuntime, type GovernedOperation, interpretDecision, LIST_RESPONSE_LIMIT, parseApprovalStanding, SeaForgeAuthority } from "../src/index.ts";

const WORLD = `world:demo@sha256:${"a".repeat(64)}`;
const alice = { tenant: "tenant-a", actor: { id: "alice", kind: "user" as const } };
const action: GovernedOperation = { kind: "action", action: "run.start", caller: alice, resource: "agent.echo" };

type Obj = Record<string, any>;

/** What a faithful SEA-Forge would answer for `request`. */
function decisionFor(request: Obj, decision: string, extra: Obj = {}, envelopeExtra: Obj = {}): Obj {
  const ext = request.envelope.extensions["godspeed.authority_request"];
  return {
    ok: true,
    envelope: {
      envelope_id: `env-authority_decision-${ext.operation_id}`,
      envelope_kind: "authority_decision",
      scope: { world_ref: request.envelope.scope.world_ref },
      lineage_refs: [request.envelope.envelope_id],
      extensions: {
        "cep.profile": { profile_id: "godspeed.authority_decision", profile_version: "1.0.0" },
        "godspeed.authority_decision": { decision, operation_id: ext.operation_id, request_ref: request.envelope.envelope_id, decision_id: "auth_01", ledger_entry: "01ENTRY", ...extra },
      },
      ...envelopeExtra,
    },
  };
}

describe("SeaForgeAuthority", () => {
  const sockets: string[] = [];
  const servers: { stop(close?: boolean): void }[] = [];
  afterEach(() => {
    for (const s of servers.splice(0)) s.stop(true);
    for (const p of sockets.splice(0)) rmSync(p, { force: true });
  });

  /** A fake SEA-Forge: `answer` receives each parsed request line and returns the raw reply (or null to hang up). */
  const fake = (answer: (request: Obj) => string | null) => {
    const path = join(tmpdir(), `cg-sf-${process.pid}-${sockets.length}-${Math.random().toString(36).slice(2, 8)}.sock`);
    sockets.push(path);
    const seen: Obj[] = [];
    const server = Bun.listen({
      unix: path,
      socket: {
        data(socket, chunk) {
          const request = JSON.parse(chunk.toString("utf8").split("\n")[0]!);
          seen.push(request);
          const reply = answer(request);
          if (reply === null) socket.end();
          else socket.write(`${reply}\n`);
        },
      },
    });
    servers.push(server);
    return { path, seen };
  };

  test("the request is a complete authority_request for this operation", () => {
    const { envelope, operationId } = buildAuthorityRequest(action, WORLD, new Date("2026-10-04T12:00:00.123Z"));
    expect(envelope.envelope_kind).toBe("authority_request");
    expect(envelope.created_at).toBe("2026-10-04T12:00:00Z");
    expect((envelope.scope as Obj).world_ref).toBe(WORLD);
    expect((envelope.extensions as Obj)["godspeed.authority_request"]).toMatchObject({ operation_id: operationId, operation_kind: "action", operation_name: "run.start", resource_id: "agent.echo" });
    expect((envelope.authority as Obj[])[0]!.subject_actor_ref).toBe("actor:tenant-a/alice");
    expect(buildAuthorityRequest(action, WORLD).operationId).not.toBe(operationId);
  });

  test("a faithful allow round-trips with its decision reference", async () => {
    const { path, seen } = fake((request) => JSON.stringify(decisionFor(request, "allow")));
    const decision = await new SeaForgeAuthority({ socketPath: path }).decide(action, WORLD);
    expect(decision).toMatchObject({ disposition: "allow", decisionRef: "01ENTRY" });
    // The decision names itself, so a later trace, evidence packet and settlement can hang from it.
    expect(decision.authority).toMatchObject({ worldRef: WORLD, decisionEnvelopeId: expect.stringMatching(/^env-authority_decision-op-/), requestEnvelopeId: expect.stringMatching(/^env-authority_request-op-/) });
    expect(seen[0]).toMatchObject({ verb: "authority_request", actor: { actor_id: "cognate-service", role: "service" } });
    expect(seen[0]!.request_id).toBe(seen[0]!.envelope.extensions["godspeed.authority_request"].operation_id);
  });

  test("deny, escalate and unknown are preserved, never collapsed", async () => {
    for (const d of ["deny", "escalate", "unknown"]) {
      const { path } = fake((request) => JSON.stringify(decisionFor(request, d)));
      expect<string>((await new SeaForgeAuthority({ socketPath: path }).decide(action, WORLD)).disposition).toBe(d);
    }
  });

  test("constrained dispositions carry their constraints, basis and controls", async () => {
    const constraints = { constraints: [{ constraint_id: "c1", constraint_type: "timeout_secs", description: "30" }] };
    const { path } = fake((request) => JSON.stringify(decisionFor(request, "degraded", { policy_basis: ["local-policy:r"], compensating_controls: ["audit"] }, constraints)));
    expect(await new SeaForgeAuthority({ socketPath: path }).decide(action, WORLD)).toMatchObject({
      disposition: "degraded",
      policyBasis: ["local-policy:r"],
      constraints: [{ type: "timeout_secs", value: "30" }],
      compensatingControls: ["audit"],
    });
  });

  test("every defect in the exchange is `unknown`, never an allow", async () => {
    const sent = buildAuthorityRequest(action, WORLD);
    const good = decisionFor({ envelope: sent.envelope }, "allow");
    const mutate = (fn: (r: Obj) => void) => {
      const copy = structuredClone(good);
      fn(copy);
      return copy;
    };
    const defects: [string, unknown][] = [
      ["not an object", "allow"],
      ["server error", { error: "no", error_class: "cep_world_refused" }],
      ["no envelope", { ok: true }],
      ["wrong kind", mutate((r) => (r.envelope.envelope_kind = "authority_request"))],
      ["wrong profile", mutate((r) => (r.envelope.extensions["cep.profile"].profile_id = "godspeed.evidence_packet"))],
      ["other world", mutate((r) => (r.envelope.scope.world_ref = `world:demo@sha256:${"b".repeat(64)}`))],
      ["other request", mutate((r) => (r.envelope.extensions["godspeed.authority_decision"].request_ref = "env-other"))],
      ["other operation", mutate((r) => (r.envelope.extensions["godspeed.authority_decision"].operation_id = "op-other"))],
      ["no lineage", mutate((r) => (r.envelope.lineage_refs = []))],
      ["unknown decision", mutate((r) => (r.envelope.extensions["godspeed.authority_decision"].decision = "yes"))],
      ["boolean decision", mutate((r) => (r.envelope.extensions["godspeed.authority_decision"].decision = true))],
      ["boundary without constraints", mutate((r) => ((r.envelope.extensions["godspeed.authority_decision"].decision = "boundary"), (r.envelope.extensions["godspeed.authority_decision"].policy_basis = ["p"])))],
      ["degraded without controls", mutate((r) => {
        r.envelope.extensions["godspeed.authority_decision"].decision = "degraded";
        r.envelope.extensions["godspeed.authority_decision"].policy_basis = ["p"];
        r.envelope.constraints = [{ constraint_type: "t", description: "d" }];
      })],
      ["malformed constraint", mutate((r) => {
        r.envelope.extensions["godspeed.authority_decision"].decision = "boundary";
        r.envelope.extensions["godspeed.authority_decision"].policy_basis = ["p"];
        r.envelope.constraints = [{ constraint_type: "", description: "d" }];
      })],
    ];
    for (const [name, response] of defects) expect(interpretDecision(response, sent, WORLD).disposition, name).toBe("unknown");
  });

  test("transport failures are `unknown`: unreachable, hang-up, garbage, oversize, timeout", async () => {
    expect((await new SeaForgeAuthority({ socketPath: join(tmpdir(), "cg-no-such.sock") }).decide(action, WORLD)).disposition).toBe("unknown");
    expect((await new SeaForgeAuthority({ socketPath: fake(() => null).path }).decide(action, WORLD)).disposition).toBe("unknown");
    expect((await new SeaForgeAuthority({ socketPath: fake(() => "not json").path }).decide(action, WORLD)).disposition).toBe("unknown");
    expect((await new SeaForgeAuthority({ socketPath: fake(() => JSON.stringify({ pad: "x".repeat(2000) })).path, maxResponseBytes: 100 }).decide(action, WORLD)).disposition).toBe("unknown");
    const silent = fake(() => "") ;
    const started = Date.now();
    expect((await new SeaForgeAuthority({ socketPath: silent.path, timeoutMs: 150 }).decide(action, WORLD)).disposition).toBe("unknown");
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  test("wired into a runtime, SEA-Forge's answer decides whether the action runs", async () => {
    const answers = ["allow", "deny"];
    const { path } = fake((request) => JSON.stringify(decisionFor(request, answers.shift() ?? "deny")));
    const runtime = await createRuntime({
      store: ":memory:",
      policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
      actions: { authorize: () => ({ allow: true, reason: "ok" }) },
      agents: [{ id: "agent.echo", version: "1.0.0", async run(input) { return { output: input }; } }],
      governance: { mode: "sea-forge", worldRef: WORLD, authority: new SeaForgeAuthority({ socketPath: path }) },
    });
    try {
      await runtime.service.startRun(alice, { agent: "agent.echo", input: {}, idempotencyKey: "a" });
      await expect(runtime.service.startRun(alice, { agent: "agent.echo", input: {}, idempotencyKey: "b" })).rejects.toMatchObject({ code: "permission_denied" });
    } finally {
      await runtime.close();
    }
  });

  describe("world transitions", () => {
    const TARGET = `world:demo@sha256:${"b".repeat(64)}`;
    const move = { sourceWorldRef: WORLD, targetWorldRef: TARGET, kind: "semantic_change" as const, reason: "adopt the reviewed model", caller: alice };

    test("the request pins the SOURCE world and binds its approval to the TARGET", () => {
      const { envelope, operationId } = buildTransitionRequest(move, new Date("2026-10-05T12:00:00.123Z"));
      expect((envelope.scope as Obj).world_ref).toBe(WORLD);
      const ext = envelope.extensions as Obj;
      expect(ext["godspeed.authority_request"]).toMatchObject({ operation_id: operationId, operation_kind: "world_transition", operation_name: "transition", resource_id: TARGET });
      expect(ext["godspeed.world_transition"]).toEqual({ target_world_ref: TARGET, transition_kind: "semantic_change", reason: "adopt the reviewed model" });
    });

    test("optional claims travel only when given", () => {
      const { envelope } = buildTransitionRequest({ ...move, compatibility: "breaking", semanticDiffRef: "diff-1", evidenceRefs: ["ev-1"] });
      expect((envelope.extensions as Obj)["godspeed.world_transition"]).toMatchObject({ compatibility: "breaking", semantic_diff_ref: "diff-1", evidence_refs: ["ev-1"] });
    });

    test("an escalate is preserved: a move across a semantic change is not an allow", async () => {
      const { path } = fake((request) => JSON.stringify(decisionFor(request, "escalate", { approval_id: "apr-op-x", approval_expires_at: "2099-01-01T00:00:00Z" })));
      const decision = await new SeaForgeAuthority({ socketPath: path }).requestWorldTransition(move);
      expect(decision).toMatchObject({ disposition: "escalate", escalation: { approvalId: "apr-op-x" } });
    });

    test("the answer must be for the source world, or it is unknown", async () => {
      const { path } = fake((request) => JSON.stringify(decisionFor(request, "allow", {}, { scope: { world_ref: TARGET } })));
      const decision = await new SeaForgeAuthority({ socketPath: path }).requestWorldTransition(move);
      expect(decision.disposition).toBe("unknown");
    });

    test("an unreachable SEA-Forge is unknown, never an allow", async () => {
      const decision = await new SeaForgeAuthority({ socketPath: join(tmpdir(), "no-such.sock"), timeoutMs: 200 }).requestWorldTransition(move);
      expect(decision.disposition).toBe("unknown");
    });

    test("recorded moves are read back; malformed rows and non-moves are dropped", async () => {
      const row = (over: Obj = {}) => ({ operation_id: "op-1", decision_id: "auth_1", ledger_entry: "01LEDGER1", approval_id: null, record: { source_world_ref: WORLD, target_world_ref: TARGET, transition_kind: "source_edit_only", reason: "r", compatibility: "compatible", semantic_closure_equal: true }, ...over });
      const { path, seen } = fake(() => JSON.stringify({ ok: true, transitions: [row(), row({ approval_id: "apr-op-2", operation_id: "op-2" }), row({ record: { source_world_ref: WORLD, target_world_ref: WORLD, transition_kind: "migration", compatibility: "unknown", semantic_closure_equal: false } }), { nonsense: true }, row({ decision_id: undefined })] }));
      const moves = await new SeaForgeAuthority({ socketPath: path }).listTransitions();
      expect(seen[0]).toMatchObject({ verb: "authority_transitions" });
      expect(moves.map((m) => m.operationId)).toEqual(["op-1", "op-2"]);
      expect(moves[1]).toMatchObject({ approvalId: "apr-op-2", sourceWorldRef: WORLD, targetWorldRef: TARGET, semanticClosureEqual: true });
      expect(moves[0]!.approvalId).toBeUndefined();
      expect(moves[0]!.ledgerEntry).toBe("01LEDGER1");
    });

    test("carrying earlier work across a move cites its lineage and the move's ledger entry", () => {
      const { envelope } = buildAuthorityRequest(action, TARGET, new Date(), undefined, { lineage: ["env-authority_request-op-old"], transitionLedgerEntry: "01LEDGER1" });
      expect(envelope.lineage_refs).toEqual(["env-authority_request-op-old"]);
      expect((envelope.extensions as Obj)["godspeed.authority_request"]).toMatchObject({ transition_ref: "01LEDGER1" });
      expect(buildAuthorityRequest(action, TARGET).envelope.lineage_refs).toEqual([]);
    });

    test("a failing SEA-Forge lists nothing rather than guessing", async () => {
      const { path } = fake(() => JSON.stringify({ ok: false, error_class: "cep_authority_internal" }));
      expect(await new SeaForgeAuthority({ socketPath: path }).listTransitions()).toEqual([]);
      expect(await new SeaForgeAuthority({ socketPath: join(tmpdir(), "no-such.sock"), timeoutMs: 200 }).listTransitions()).toEqual([]);
    });
  });
});

// Profile conformance by the CEP repository's own validator. Gated on CEP_REPO (a checkout of
// canonical-evaluation-protocol) and `uv`; reported as skipped, not passed, when absent.
describe.skipIf(!process.env.CEP_REPO)("authority_request conforms to the CEP profile", () => {
  test("action and capability requests validate", () => {
    const capability: GovernedOperation = { kind: "capability", request: { operation: "invoke", actor: alice.actor, tenant: alice.tenant, scopeId: "s", capability: { id: "tool.ping", version: "1.0.0" }, providerId: "p", correlationId: "c1" } as never };
    const envelopes = [action, capability].map((op) => buildAuthorityRequest(op, WORLD).envelope);
    const script = "import json,sys; from cep.godspeed import validate_profile, verify_semantics; print(json.dumps([validate_profile(e,'authority_request')+verify_semantics(e,'authority_request') for e in json.load(sys.stdin)]))";
    const out = Bun.spawnSync(["uv", "run", "--project", process.env.CEP_REPO!, "python", "-c", script], { stdin: new TextEncoder().encode(JSON.stringify(envelopes)) });
    expect(out.exitCode, out.stderr.toString()).toBe(0);
    expect(JSON.parse(out.stdout.toString())).toEqual([[], []]);
  });

  test("a world transition request validates", () => {
    const envelope = buildTransitionRequest({ sourceWorldRef: WORLD, targetWorldRef: `world:demo@sha256:${"b".repeat(64)}`, kind: "semantic_change", reason: "adopt the reviewed model", compatibility: "unknown", caller: alice }).envelope;
    const script = "import json,sys; from cep.godspeed import validate_profile, verify_semantics; e=json.load(sys.stdin); print(json.dumps(validate_profile(e,'authority_request')+verify_semantics(e,'authority_request')))";
    const out = Bun.spawnSync(["uv", "run", "--project", process.env.CEP_REPO!, "python", "-c", script], { stdin: new TextEncoder().encode(JSON.stringify(envelope)) });
    expect(out.exitCode, out.stderr.toString()).toBe(0);
    expect(JSON.parse(out.stdout.toString())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Typed mediation surface (T1 / D1): approvals, closure, delegated decide. The scripted socket below is the shared
// fixture extracted from the fakes above and in sea-forge-busy.test.ts: it records every raw request line (so wire
// bytes can be compared) and the number of connections (so "nothing was sent" is checkable), and writes large
// replies with backpressure handling.
// ---------------------------------------------------------------------------------------------------------------

/** A reply that never comes: the connection stays open and silent. */
const SILENT = "\u0000silent";
const BUSY = JSON.stringify({ error: "server request-work admission is full", error_class: "server_busy", no_side_effect: true });
const SERVICE = { actor_id: "cognate-service", role: "service" };
const OPERATOR = { actor_id: "actor:operator", role: "operator" };

describe("typed SEA-Forge mediation calls", () => {
  const sockets: string[] = [];
  const servers: { stop(close?: boolean): void }[] = [];
  afterEach(() => {
    for (const s of servers.splice(0)) s.stop(true);
    for (const p of sockets.splice(0)) rmSync(p, { force: true });
  });

  /** `answer(request, n)` returns the raw reply line body, or null to hang up. `lines` holds each raw request line. */
  const scripted = (answer: (request: Obj, n: number) => string | null) => {
    const path = join(tmpdir(), `cg-sf-typed-${process.pid}-${sockets.length}-${Math.random().toString(36).slice(2, 8)}.sock`);
    sockets.push(path);
    const state = { path, lines: [] as string[], seen: [] as Obj[], connections: 0 };
    const pumps = new WeakMap<object, () => void>();
    servers.push(
      Bun.listen({
        unix: path,
        socket: {
          open() {
            state.connections++;
          },
          data(socket, chunk) {
            const line = chunk.toString("utf8").split("\n")[0]!;
            state.lines.push(line);
            const request = JSON.parse(line);
            state.seen.push(request);
            const reply = answer(request, state.seen.length);
            if (reply === null) return void socket.end();
            if (reply === SILENT) return;
            const buf = Buffer.from(`${reply}\n`);
            let offset = 0;
            const pump = () => {
              while (offset < buf.length) {
                const n = socket.write(buf.subarray(offset));
                if (n <= 0) break;
                offset += n;
              }
            };
            pumps.set(socket, pump);
            pump();
          },
          drain(socket) {
            pumps.get(socket)?.();
          },
        },
      }),
    );
    return state;
  };
  const ok = (extra: Obj = {}) => JSON.stringify({ ok: true, ...extra });
  const NO_SOCKET = join(tmpdir(), "cg-typed-no-such.sock");

  // Horizon's `parseApproval` cases (test/approval-inbox.test.ts), ported, plus the negative-state rows.
  const row = (over: Obj = {}): Obj => ({
    approval_id: "apr-cep:op-1",
    state: "pending",
    requester: "cognate-service",
    world_ref: "world:horizon@sha256:abc",
    operation_kind: "action",
    operation_name: "run.start",
    resource_id: "res-7",
    subject_actor_ref: "actor:operator",
    request_ref: "env-1",
    expires_at: "2026-11-02T13:00:00Z",
    resolved_by: null,
    ...over,
  });

  describe("row parser (port of Horizon parseApproval)", () => {
    test("accepts a well-formed SEA-Forge row", () => {
      expect(parseApprovalStanding(row())?.approval_id).toBe("apr-cep:op-1");
      expect(parseApprovalStanding(row({ resolved_by: "actor:operator", state: "approved" }))).toMatchObject({ state: "approved", resolved_by: "actor:operator" });
    });
    test("refuses rows that do not match the shape, and never coerces them", () => {
      expect(parseApprovalStanding(null)).toBeNull();
      expect(parseApprovalStanding([])).toBeNull();
      expect(parseApprovalStanding("row")).toBeNull();
      expect(parseApprovalStanding(row({ state: "maybe" }))).toBeNull();
      expect(parseApprovalStanding(row({ approval_id: "has space" }))).toBeNull();
      expect(parseApprovalStanding(row({ approval_id: "a".repeat(201) }))).toBeNull();
      expect(parseApprovalStanding(row({ expires_at: "not a time" }))).toBeNull();
      expect(parseApprovalStanding(row({ requester: "" }))).toBeNull();
      expect(parseApprovalStanding(row({ requester: "  " }))).toBeNull();
      expect(parseApprovalStanding(row({ resolved_by: 7 }))).toBeNull();
      expect(parseApprovalStanding(row({ resolved_by: "" }))).toBeNull();
      const { requester: _omitted, ...missing } = row();
      expect(parseApprovalStanding(missing)).toBeNull();
      const { resolved_by: _r, ...noResolved } = row();
      expect(parseApprovalStanding(noResolved)).toBeNull();
    });
    test("all five states are accepted", () => {
      for (const state of ["pending", "approved", "rejected", "expired", "used"] as string[]) expect<string | undefined>(parseApprovalStanding(row({ state }))?.state).toBe(state);
    });
  });

  describe("listApprovals", () => {
    test("sends only the verb when no actor was given, and no request id", async () => {
      const sf = scripted(() => ok({ approvals: [] }));
      expect(await new SeaForgeAuthority({ socketPath: sf.path }).listApprovals()).toEqual({ ok: true, approvals: [], excluded: 0 });
      expect(sf.lines).toEqual(['{"verb":"authority_approvals"}']);
      expect("actor" in sf.seen[0]!).toBe(false);
      expect("request_id" in sf.seen[0]!).toBe(false);
    });

    test("sends the actor when one was explicitly given", async () => {
      const actor = { actor_id: "workbench-service", role: "service" };
      const sf = scripted(() => ok({ approvals: [] }));
      await new SeaForgeAuthority({ socketPath: sf.path, actor }).listApprovals();
      expect(sf.lines).toEqual([JSON.stringify({ verb: "authority_approvals", actor })]);
    });

    test("parses the cognate copy of the golden fixture into two rows, none excluded", async () => {
      // copy record: byte copy of sea-rs contracts/fixtures/approval-standing.json at 5d1338c7; sha256 a11a1733811272b50bc4c9d78afd7ddebc95f1f70bcf56e9c4d359fbe997f48d
      const bytes = readFileSync(join(import.meta.dir, "fixtures", "approval-standing.json"));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe("a11a1733811272b50bc4c9d78afd7ddebc95f1f70bcf56e9c4d359fbe997f48d");
      const fixture = JSON.parse(bytes.toString("utf8")) as Obj[];
      expect(fixture.length).toBe(2);
      for (const r of fixture) expect(Object.keys(r).length).toBe(11);
      expect(fixture.map((r) => [r.state, r.resolved_by === null])).toEqual([["pending", true], ["approved", false]]);
      const sf = scripted(() => ok({ approvals: fixture }));
      const listed = await new SeaForgeAuthority({ socketPath: sf.path }).listApprovals();
      expect(listed).toEqual({ ok: true, approvals: fixture as never, excluded: 0 });
    });

    test("malformed rows, unknown states and case-task rows are counted in excluded, never listed", async () => {
      const caseTask = { approval_id: "task-1", task_id: "t-9", title: "Review the plan", criteria_sha256: "f".repeat(64), status: "pending", assignee: "actor:operator" };
      const sf = scripted(() => ok({ approvals: [row(), { nonsense: true }, row({ state: "unknown_state", approval_id: "apr-2" }), caseTask, row({ approval_id: "apr-3", requester: "" }), "str", null, row({ approval_id: "apr-4", state: "used", resolved_by: "x" })] }));
      const listed = await new SeaForgeAuthority({ socketPath: sf.path }).listApprovals();
      expect(listed.ok && listed.approvals.map((a) => a.approval_id)).toEqual(["apr-cep:op-1", "apr-4"]);
      expect(listed.ok && listed.excluded).toBe(6);
    });

    test("approvalState is rebuilt on it: found state, absent, case-task id, refusal and transport failure", async () => {
      const caseTask = { approval_id: "task-1", status: "pending", criteria_sha256: "f".repeat(64) };
      const sf = scripted(() => ok({ approvals: [row({ approval_id: "apr-a", state: "approved" }), row({ approval_id: "apr-b", state: "bogus" }), caseTask] }));
      const authority = new SeaForgeAuthority({ socketPath: sf.path });
      expect(await authority.approvalState("apr-a")).toBe("approved");
      expect(await authority.approvalState("apr-b")).toBe("unknown");
      expect(await authority.approvalState("task-1")).toBe("unknown");
      expect(await authority.approvalState("apr-missing")).toBe("unknown");
      // No explicit actor: no actor field. With one: the same claim decide/resolve send.
      expect(sf.lines.every((l) => l === '{"verb":"authority_approvals"}')).toBe(true);
      const withActor = scripted(() => ok({ approvals: [] }));
      await new SeaForgeAuthority({ socketPath: withActor.path, actor: SERVICE }).approvalState("x");
      expect(withActor.seen[0]).toEqual({ verb: "authority_approvals", actor: SERVICE });
      expect(await new SeaForgeAuthority({ socketPath: scripted(() => JSON.stringify({ ok: false, error_class: "identity_refused" })).path }).approvalState("apr-a")).toBe("unknown");
      expect(await new SeaForgeAuthority({ socketPath: NO_SOCKET, timeoutMs: 200 }).approvalState("apr-a")).toBe("unknown");
    });

    test("a per-call timeoutMs overrides the instance timeout", async () => {
      const silent = scripted(() => SILENT);
      const started = Date.now();
      const listed = await new SeaForgeAuthority({ socketPath: silent.path, timeoutMs: 30_000 }).listApprovals({ timeoutMs: 150 });
      expect(listed).toMatchObject({ ok: false, errorClass: "unreachable" });
      expect(Date.now() - started).toBeLessThan(3_000);
    });

    test("LIST_RESPONSE_LIMIT is 8 MiB; the limit is accepted and one code unit more fails closed", async () => {
      expect(LIST_RESPONSE_LIMIT).toBe(8 * 1024 * 1024);
      // The measured unit is the decoded response line including its newline (what exchangeOnce measures).
      const lineOf = (total: number) => {
        const frame = JSON.stringify({ ok: true, approvals: [], pad: "" });
        return JSON.stringify({ ok: true, approvals: [], pad: "x".repeat(total - 1 - frame.length) });
      };
      const atLimit = lineOf(LIST_RESPONSE_LIMIT);
      expect(atLimit.length + 1).toBe(LIST_RESPONSE_LIMIT);
      expect(/^[\x00-\x7f]*$/.test(atLimit)).toBe(true);
      const fits = scripted(() => atLimit);
      expect(await new SeaForgeAuthority({ socketPath: fits.path, timeoutMs: 20_000 }).listApprovals({ timeoutMs: 20_000 })).toEqual({ ok: true, approvals: [], excluded: 0 });
      const over = lineOf(LIST_RESPONSE_LIMIT + 1);
      expect(over.length + 1).toBe(LIST_RESPONSE_LIMIT + 1);
      const tooBig = scripted(() => over);
      expect(await new SeaForgeAuthority({ socketPath: tooBig.path }).listApprovals({ timeoutMs: 20_000 })).toMatchObject({ ok: false, errorClass: "response_too_large" });
    });

    test("a list past the 256 KB single-record cap succeeds; the same size fails for a single-record call", async () => {
      const rows = Array.from({ length: 1_200 }, (_, i) => row({ approval_id: `apr-${i}` }));
      const body = ok({ approvals: rows });
      expect(body.length).toBeGreaterThan(256 * 1024);
      const sf = scripted(() => body);
      const listed = await new SeaForgeAuthority({ socketPath: sf.path }).listApprovals();
      expect(listed.ok && listed.approvals.length).toBe(1_200);
      const closure = await new SeaForgeAuthority({ socketPath: scripted(() => body).path, requestIdPrefix: "t" }).authorityClosure({ operationId: "op-1", discriminationObservationId: "d", verificationObservationIds: [] });
      expect(closure).toMatchObject({ ok: false, errorClass: "response_too_large" });
    });
  });

  describe("resolveApproval", () => {
    test("exact wire bytes equal the pre-migration Horizon and Workbench formats", async () => {
      const sf = scripted(() => ok({ resolved: true }));
      const client = new SeaForgeAuthority({ socketPath: sf.path, actor: SERVICE, requestIdPrefix: "horizon" });
      const result = await client.resolveApproval({ approvalId: "apr-cep:op-1", resolution: "approved", onBehalfOf: OPERATOR });
      expect(result).toEqual({ ok: true, response: { ok: true, resolved: true } });
      // Horizon src/adapters/sea-forge-approvals.ts (before T1), field order included.
      const oldHorizon = { verb: "authority_approval", approval_id: "apr-cep:op-1", resolution: "approved", request_id: `horizon:${"apr-cep:op-1"}:${"approved"}`, actor: SERVICE, on_behalf_of: OPERATOR };
      expect(sf.lines[0]).toBe(JSON.stringify(oldHorizon));
      expect(sf.seen[0]!.request_id).toBe("horizon:apr-cep:op-1:approved");

      const wb = scripted(() => ok());
      await new SeaForgeAuthority({ socketPath: wb.path, actor: SERVICE, requestIdPrefix: "workbench" }).resolveApproval({ approvalId: "apr-9", resolution: "rejected", onBehalfOf: OPERATOR });
      // Workbench src/capabilities/governance.ts (before T1).
      expect(wb.lines[0]).toBe(JSON.stringify({ verb: "authority_approval", approval_id: "apr-9", resolution: "rejected", request_id: `workbench:${"apr-9"}:${"rejected"}`, actor: SERVICE, on_behalf_of: OPERATOR }));
    });

    test("actor is the defaulted actor when none was given, and on_behalf_of is always sent", async () => {
      const sf = scripted(() => ok());
      await new SeaForgeAuthority({ socketPath: sf.path, requestIdPrefix: "workbench" }).resolveApproval({ approvalId: "apr-1", resolution: "approved", onBehalfOf: OPERATOR });
      expect(sf.seen[0]).toMatchObject({ actor: SERVICE, on_behalf_of: OPERATOR });
    });

    test("invalid input is refused before any send", async () => {
      const sf = scripted(() => ok());
      const client = new SeaForgeAuthority({ socketPath: sf.path, requestIdPrefix: "t" });
      const bad: Obj[] = [
        { approvalId: "has space", resolution: "approved", onBehalfOf: OPERATOR },
        { approvalId: "", resolution: "approved", onBehalfOf: OPERATOR },
        { approvalId: "a".repeat(201), resolution: "approved", onBehalfOf: OPERATOR },
        { approvalId: "apr-1", resolution: "maybe", onBehalfOf: OPERATOR },
        { approvalId: "apr-1", resolution: undefined, onBehalfOf: OPERATOR },
        { approvalId: "apr-1", resolution: "approved", onBehalfOf: undefined },
        { approvalId: "apr-1", resolution: "approved", onBehalfOf: { actor_id: "", role: "operator" } },
      ];
      for (const input of bad) expect(await client.resolveApproval(input as never), JSON.stringify(input)).toMatchObject({ ok: false, errorClass: "invalid_input" });
      expect(sf.connections).toBe(0);
      expect(sf.lines).toEqual([]);
      const r = await client.resolveApproval(bad[0] as never);
      expect(!r.ok && r.error).toContain("approvalId");
    });

    test("without a requestIdPrefix it is not_configured and sends nothing", async () => {
      const sf = scripted(() => ok());
      const client = new SeaForgeAuthority({ socketPath: sf.path });
      expect(await client.resolveApproval({ approvalId: "apr-1", resolution: "approved", onBehalfOf: OPERATOR })).toMatchObject({ ok: false, errorClass: "not_configured" });
      expect(await client.authorityClosure({ operationId: "op-1", discriminationObservationId: "d", verificationObservationIds: [] })).toMatchObject({ ok: false, errorClass: "not_configured" });
      expect(sf.connections).toBe(0);
    });

    test("server refusals pass their error_class and error through unchanged", async () => {
      for (const cls of ["request_id_reused", "approval_expired", "identity_refused"]) {
        const sf = scripted(() => JSON.stringify({ ok: false, error_class: cls, error: `detail ${cls}` }));
        expect(await new SeaForgeAuthority({ socketPath: sf.path, requestIdPrefix: "t" }).resolveApproval({ approvalId: "apr-1", resolution: "approved", onBehalfOf: OPERATOR })).toEqual({ ok: false, errorClass: cls, error: `detail ${cls}` });
      }
      const bare = scripted(() => JSON.stringify({ ok: false }));
      expect(await new SeaForgeAuthority({ socketPath: bare.path, requestIdPrefix: "t" }).resolveApproval({ approvalId: "apr-1", resolution: "approved", onBehalfOf: OPERATOR })).toEqual({ ok: false, errorClass: "error", error: "no detail" });
    });
  });

  describe("authorityClosure", () => {
    const input = { operationId: "op-77", discriminationObservationId: "obs-d", verificationObservationIds: ["obs-1", "obs-2"] };
    const body = { b: 12, c: 14, committed_at: "2026-11-05T12:00:00Z", on_time: true, replayed: false };

    test("exact wire bytes equal the pre-migration Horizon format; result is typed", async () => {
      const sf = scripted(() => ok(body));
      const result = await new SeaForgeAuthority({ socketPath: sf.path, actor: SERVICE, requestIdPrefix: "horizon" }).authorityClosure(input);
      expect(result).toEqual({ ok: true, b: 12, c: 14, committed_at: "2026-11-05T12:00:00Z", on_time: true });
      // Horizon src/app.ts (before T1): actor is the service actor, no on_behalf_of.
      expect(sf.lines[0]).toBe(JSON.stringify({ verb: "authority_closure", operation_id: "op-77", discrimination_observation_id: "obs-d", verification_observation_ids: ["obs-1", "obs-2"], request_id: `horizon:closure:${"op-77"}`, actor: SERVICE }));
      expect(sf.seen[0]!.request_id).toBe("horizon:closure:op-77");
      expect("on_behalf_of" in sf.seen[0]!).toBe(false);
    });

    test("invalid input is refused before any send", async () => {
      const sf = scripted(() => ok(body));
      const client = new SeaForgeAuthority({ socketPath: sf.path, requestIdPrefix: "t" });
      for (const bad of [{ ...input, operationId: "" }, { ...input, discriminationObservationId: "" }, { ...input, verificationObservationIds: "obs" }, { ...input, verificationObservationIds: [""] }]) {
        expect(await client.authorityClosure(bad as never)).toMatchObject({ ok: false, errorClass: "invalid_input" });
      }
      expect(sf.connections).toBe(0);
    });

    test("an ok body missing its fields is malformed_response", async () => {
      for (const partial of [{}, { b: 1, c: 2, committed_at: "t" }, { b: "1", c: 2, committed_at: "t", on_time: true }, { b: 1, c: 2, committed_at: "", on_time: true }]) {
        const sf = scripted(() => ok(partial));
        expect(await new SeaForgeAuthority({ socketPath: sf.path, requestIdPrefix: "t" }).authorityClosure(input)).toMatchObject({ ok: false, errorClass: "malformed_response" });
      }
    });

    test("a per-call timeoutMs is honoured", async () => {
      const silent = scripted(() => SILENT);
      const started = Date.now();
      expect(await new SeaForgeAuthority({ socketPath: silent.path, requestIdPrefix: "t", timeoutMs: 30_000 }).authorityClosure({ ...input, timeoutMs: 150 })).toMatchObject({ ok: false, errorClass: "unreachable" });
      expect(Date.now() - started).toBeLessThan(3_000);
    });
  });

  describe("every errorClass", () => {
    const list = (path: string, extra: Obj = {}) => new SeaForgeAuthority({ socketPath: path, timeoutMs: 400, ...extra }).listApprovals();
    test("unreachable: no socket, hang-up, timeout", async () => {
      expect(await list(NO_SOCKET)).toMatchObject({ ok: false, errorClass: "unreachable" });
      expect(await list(scripted(() => null).path)).toMatchObject({ ok: false, errorClass: "unreachable" });
      expect(await list(scripted(() => SILENT).path)).toMatchObject({ ok: false, errorClass: "unreachable" });
    });
    test("malformed_response: not JSON, not an object, no approvals array", async () => {
      expect(await list(scripted(() => "not json").path)).toMatchObject({ ok: false, errorClass: "malformed_response" });
      expect(await list(scripted(() => "[1,2]").path)).toMatchObject({ ok: false, errorClass: "malformed_response" });
      expect(await list(scripted(() => '"x"').path)).toMatchObject({ ok: false, errorClass: "malformed_response" });
      expect(await list(scripted(() => ok({ approvals: "none" })).path)).toMatchObject({ ok: false, errorClass: "malformed_response" });
      expect(await list(scripted(() => ok()).path)).toMatchObject({ ok: false, errorClass: "malformed_response" });
    });
    test("response_too_large for a single-record call at its 256 KB default, and at a configured maxResponseBytes", async () => {
      const pad = scripted(() => ok({ pad: "x".repeat(2_000) }));
      const small = new SeaForgeAuthority({ socketPath: pad.path, requestIdPrefix: "t", maxResponseBytes: 100 });
      expect(await small.resolveApproval({ approvalId: "apr-1", resolution: "approved", onBehalfOf: OPERATOR })).toMatchObject({ ok: false, errorClass: "response_too_large" });
    });
    test("server passthrough on the listing, including identity refusals", async () => {
      expect(await list(scripted(() => JSON.stringify({ ok: false, error_class: "identity_refused", error: "uid mismatch" })).path)).toEqual({ ok: false, errorClass: "identity_refused", error: "uid mismatch" });
    });
    test("a persistent server_busy is passed through once the budget is spent", async () => {
      expect(await list(scripted(() => BUSY).path)).toMatchObject({ ok: false, errorClass: "server_busy" });
    });
  });

  describe("delegated decide", () => {
    test("adds on_behalf_of to the authority_request and nothing else changes", async () => {
      const sf = scripted((request) => JSON.stringify(decisionFor(request, "allow")));
      const client = new SeaForgeAuthority({ socketPath: sf.path, actor: SERVICE });
      const decision = await client.decide(action, WORLD, undefined, undefined, { onBehalfOf: OPERATOR });
      expect(decision.disposition).toBe("allow");
      const sent = sf.seen[0]!;
      // Horizon src/adapters/delegating-authority.ts (before T1): field order included.
      expect(sf.lines[0]).toBe(JSON.stringify({ verb: "authority_request", envelope: sent.envelope, request_id: sent.envelope.extensions["godspeed.authority_request"].operation_id, actor: SERVICE, on_behalf_of: OPERATOR }));
      expect(sent.on_behalf_of).toEqual(OPERATOR);
    });

    test("without delegation there is no on_behalf_of; the request id stays the envelope's operation id", async () => {
      const sf = scripted((request) => JSON.stringify(decisionFor(request, "allow")));
      await new SeaForgeAuthority({ socketPath: sf.path }).decide(action, WORLD);
      expect(Object.keys(sf.seen[0]!)).toEqual(["verb", "envelope", "request_id", "actor"]);
      expect(sf.seen[0]!.request_id).toBe(sf.seen[0]!.envelope.extensions["godspeed.authority_request"].operation_id);
    });

    test("delegation composes with approval and carry", async () => {
      const sf = scripted((request) => JSON.stringify(decisionFor(request, "allow", { approval_id: "apr-op-x", approval_used: true })));
      const decision = await new SeaForgeAuthority({ socketPath: sf.path }).decide(action, WORLD, { approvalId: "apr-op-x" } as never, { lineage: ["env-authority_request-op-old"], transitionLedgerEntry: "01L" }, { onBehalfOf: OPERATOR });
      expect(decision.disposition).toBe("allow");
      expect(sf.seen[0]!.envelope.extensions["godspeed.authority_request"]).toMatchObject({ approval_id: "apr-op-x", transition_ref: "01L" });
      expect(sf.seen[0]!.on_behalf_of).toEqual(OPERATOR);
    });
  });

  describe("actor table", () => {
    test("without an explicit actor: defaulted actor on decide, transition, evidence, settle; none on the read-only listings", async () => {
      const sf = scripted((request) => (request.verb === "authority_request" ? JSON.stringify(decisionFor(request, "allow")) : ok({ approvals: [], transitions: [] })));
      const client = new SeaForgeAuthority({ socketPath: sf.path, requestIdPrefix: "t" });
      await client.decide(action, WORLD);
      await client.requestWorldTransition({ sourceWorldRef: WORLD, targetWorldRef: `world:demo@sha256:${"b".repeat(64)}`, kind: "migration", reason: "r", caller: alice });
      await client.submitEvidence({ envelope_id: "env-e" });
      await client.settle("op-1", WORLD);
      await client.resolveApproval({ approvalId: "apr-1", resolution: "approved", onBehalfOf: OPERATOR });
      await client.authorityClosure({ operationId: "op-1", discriminationObservationId: "d", verificationObservationIds: [] });
      await client.listTransitions();
      await client.listApprovals();
      const byVerb = (verb: string) => sf.seen.filter((r) => r.verb === verb);
      for (const verb of ["authority_request", "authority_evidence", "authority_settle", "authority_approval", "authority_closure"]) {
        for (const r of byVerb(verb)) expect(r.actor, verb).toEqual(SERVICE);
      }
      // As today, listTransitions and the approvals listing carry no actor unless the listing's client was given one.
      expect("actor" in byVerb("authority_transitions")[0]!).toBe(false);
      expect("actor" in byVerb("authority_approvals")[0]!).toBe(false);
    });

    test("with an explicit actor every method sends it, including the listing", async () => {
      const actor = { actor_id: "svc-x", role: "service" };
      const sf = scripted(() => ok({ approvals: [] }));
      const client = new SeaForgeAuthority({ socketPath: sf.path, actor, requestIdPrefix: "t" });
      await client.listApprovals();
      await client.resolveApproval({ approvalId: "apr-1", resolution: "approved", onBehalfOf: OPERATOR });
      await client.authorityClosure({ operationId: "op-1", discriminationObservationId: "d", verificationObservationIds: [] });
      expect(sf.seen.map((r) => r.actor)).toEqual([actor, actor, actor]);
    });
  });

  describe("idempotency", () => {
    test("busy-retries send byte-identical resolve and closure requests", async () => {
      const resolveSf = scripted((_r, n) => (n <= 2 ? BUSY : ok()));
      const client = (path: string) => new SeaForgeAuthority({ socketPath: path, actor: SERVICE, requestIdPrefix: "horizon" });
      expect(await client(resolveSf.path).resolveApproval({ approvalId: "apr-1", resolution: "approved", onBehalfOf: OPERATOR })).toMatchObject({ ok: true });
      expect(resolveSf.lines.length).toBe(3);
      expect(new Set(resolveSf.lines).size).toBe(1);
      const closureSf = scripted((_r, n) => (n <= 2 ? BUSY : ok({ b: 1, c: 2, committed_at: "t", on_time: false })));
      expect(await client(closureSf.path).authorityClosure({ operationId: "op-1", discriminationObservationId: "d", verificationObservationIds: ["v"] })).toMatchObject({ ok: true });
      expect(closureSf.lines.length).toBe(3);
      expect(new Set(closureSf.lines).size).toBe(1);
    });

    test("two separate client instances send the same id (a restart does not change it)", async () => {
      const sf = scripted(() => ok({ b: 1, c: 2, committed_at: "t", on_time: true }));
      for (let i = 0; i < 2; i++) {
        const c = new SeaForgeAuthority({ socketPath: sf.path, actor: SERVICE, requestIdPrefix: "horizon" });
        await c.resolveApproval({ approvalId: "apr-cep:op-1", resolution: "rejected", onBehalfOf: OPERATOR });
        await c.authorityClosure({ operationId: "op-5", discriminationObservationId: "d", verificationObservationIds: [] });
      }
      expect(sf.lines[0]).toBe(sf.lines[2]);
      expect(sf.lines[1]).toBe(sf.lines[3]);
      expect(sf.seen.map((r) => r.request_id)).toEqual(["horizon:apr-cep:op-1:rejected", "horizon:closure:op-5", "horizon:apr-cep:op-1:rejected", "horizon:closure:op-5"]);
    });

    test("the other resolution is a different id", async () => {
      const sf = scripted(() => ok());
      const c = new SeaForgeAuthority({ socketPath: sf.path, requestIdPrefix: "workbench" });
      await c.resolveApproval({ approvalId: "apr-1", resolution: "approved", onBehalfOf: OPERATOR });
      await c.resolveApproval({ approvalId: "apr-1", resolution: "rejected", onBehalfOf: OPERATOR });
      expect(sf.seen.map((r) => r.request_id)).toEqual(["workbench:apr-1:approved", "workbench:apr-1:rejected"]);
    });
  });

  describe("review round 1", () => {
    const ARGS = { approvalId: "apr-1", resolution: "approved" as const };
    test("resolveApproval refuses the service identity as on_behalf_of before sending", async () => {
      const sf = scripted(() => ok());
      expect(await new SeaForgeAuthority({ socketPath: sf.path, requestIdPrefix: "t" }).resolveApproval({ ...ARGS, onBehalfOf: { actor_id: "cognate-service", role: "operator" } })).toMatchObject({ ok: false, errorClass: "invalid_input" });
      const custom = { actor_id: "svc-y", role: "service" };
      expect(await new SeaForgeAuthority({ socketPath: sf.path, requestIdPrefix: "t", actor: custom }).resolveApproval({ ...ARGS, onBehalfOf: { actor_id: "svc-y", role: "operator" } })).toMatchObject({ ok: false, errorClass: "invalid_input" });
      expect(sf.connections).toBe(0);
    });

    test("delegated decide validates onBehalfOf and refuses the service identity with zero bytes sent", async () => {
      const sf = scripted((request) => JSON.stringify(decisionFor(request, "allow")));
      const client = new SeaForgeAuthority({ socketPath: sf.path });
      for (const bad of [undefined, null, "op", {}, { actor_id: "", role: "operator" }, { actor_id: "a", role: "" }, { actor_id: 1, role: "operator" }, { actor_id: "cognate-service", role: "operator" }]) {
        expect((await client.decide(action, WORLD, undefined, undefined, { onBehalfOf: bad as never })).disposition, JSON.stringify(bad)).toBe("unknown");
      }
      expect(sf.connections).toBe(0);
    });

    test("on_behalf_of is built explicitly: extra caller keys never reach the wire", async () => {
      const sf = scripted((request) => (request.verb === "authority_request" ? JSON.stringify(decisionFor(request, "allow")) : ok()));
      const client = new SeaForgeAuthority({ socketPath: sf.path, requestIdPrefix: "t" });
      const dirty = { actor_id: "actor:operator", role: "operator", secret: "x" };
      await client.resolveApproval({ ...ARGS, onBehalfOf: dirty });
      await client.decide(action, WORLD, undefined, undefined, { onBehalfOf: dirty });
      expect(sf.lines[0]).toContain('"on_behalf_of":{"actor_id":"actor:operator","role":"operator"}');
      expect(sf.lines[1]).toContain('"on_behalf_of":{"actor_id":"actor:operator","role":"operator"}}');
      expect(sf.lines.some((l) => l.includes("secret"))).toBe(false);
    });

    test("a per-call timeoutMs that is not a finite number > 0 is invalid_input before sending", async () => {
      const sf = scripted(() => ok({ approvals: [], b: 1, c: 1, committed_at: "t", on_time: true }));
      const client = new SeaForgeAuthority({ socketPath: sf.path, requestIdPrefix: "t" });
      for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "5" as never]) {
        expect(await client.listApprovals({ timeoutMs })).toMatchObject({ ok: false, errorClass: "invalid_input" });
        expect(await client.resolveApproval({ ...ARGS, onBehalfOf: OPERATOR, timeoutMs })).toMatchObject({ ok: false, errorClass: "invalid_input" });
        expect(await client.authorityClosure({ operationId: "o", discriminationObservationId: "d", verificationObservationIds: [], timeoutMs })).toMatchObject({ ok: false, errorClass: "invalid_input" });
      }
      expect(sf.connections).toBe(0);
    });

    test("closure sends a copy of verificationObservationIds", async () => {
      const sf = scripted(() => ok({ b: 1, c: 1, committed_at: "t", on_time: true }));
      const ids = ["v1"];
      await new SeaForgeAuthority({ socketPath: sf.path, requestIdPrefix: "t" }).authorityClosure({ operationId: "o", discriminationObservationId: "d", verificationObservationIds: ids });
      expect(sf.seen[0]!.verification_observation_ids).toEqual(["v1"]);
    });

    test("response_too_large and malformed_response are attempted exactly once", async () => {
      const big = scripted(() => ok({ pad: "x".repeat(2_000) }));
      expect(await new SeaForgeAuthority({ socketPath: big.path, requestIdPrefix: "t", maxResponseBytes: 100 }).resolveApproval({ ...ARGS, onBehalfOf: OPERATOR })).toMatchObject({ errorClass: "response_too_large" });
      expect(big.lines.length).toBe(1);
      const bad = scripted(() => "not json");
      expect(await new SeaForgeAuthority({ socketPath: bad.path }).listApprovals()).toMatchObject({ errorClass: "malformed_response" });
      expect(bad.lines.length).toBe(1);
    });
  });

  test("existing behaviour is unchanged: an oversized or non-JSON reply still makes decide `unknown`, and a failed approvalState is unknown", async () => {
    expect((await new SeaForgeAuthority({ socketPath: scripted(() => JSON.stringify({ pad: "x".repeat(2000) })).path, maxResponseBytes: 100 }).decide(action, WORLD)).disposition).toBe("unknown");
    expect((await new SeaForgeAuthority({ socketPath: scripted(() => "nope").path }).decide(action, WORLD)).disposition).toBe("unknown");
    expect(await new SeaForgeAuthority({ socketPath: scripted(() => "nope").path }).submitEvidence({ envelope_id: "e" })).toMatchObject({ ok: false, errorClass: "unreachable" });
  });
});
