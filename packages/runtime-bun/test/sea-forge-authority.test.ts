import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAuthorityRequest, createRuntime, type GovernedOperation, interpretDecision, SeaForgeAuthority } from "../src/index.ts";

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
});
