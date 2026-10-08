// Stage 8 end to end, live: a governed Cognate operation -> execution_trace delivered to RealityTrace (the
// released CLI) -> RealityTrace's own evidence -> GodSpeed evidence_packet -> SEA-Forge records it and settles.
//
// Needs a real sea-forge-server (SEA_FORGE_SERVER_BIN), the `domainforge` CLI, the pinned RealityTrace binary
// (`just setup-realitytrace`) and cargo. Without SEA_FORGE_SERVER_BIN the suite is reported as skipped, which is
// NOT a pass; `just sea-forge-live` fails instead of skipping.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Component } from "@godspeedai/kernel-api";
import { createSxrCliPort, evidencePacketEnvelope, governedTraceFor, ObservationDelivery, observationIntent, type SxrEvidenceRow } from "@godspeedai/realitytrace";
import type { AgentDefinition } from "@godspeedai/runtime-api";
import { createRuntime, SeaForgeAuthority, type Runtime, type PendingEvent } from "@godspeedai/runtime-bun";

// `sxr verify` really compiles and runs `cargo test`; the default 5s is not enough on a cold build.
setDefaultTimeout(240_000);

const BIN = process.env.SEA_FORGE_SERVER_BIN;
const SXR = process.env.SXR_BIN ?? join(import.meta.dir, "..", "..", ".tmp", "realitytrace", "bin", "realitytrace");
const CEP_REPO = process.env.CEP_REPO;

const SRC = '@namespace "t"\nentity "Tank" { key id: uuid }\n';
const POLICY = ['version: "0.1"', "rules:", ...["cognate_action", "cognate_capability", "evidence_mutation", "settlement_declaration"].flatMap((kind) => [`  - name: ${kind}`, "    verdict: allow", "    actor_role: service", `    operation_kind: ${kind}`]), ""].join("\n");

const alice = { tenant: "tenant-a", actor: { id: "alice", kind: "user" as const } };
const tool: Component = { id: "tool-provider", provides: [{ id: "tool.ping", version: "1.0.0" }], activate: (fiber) => fiber.provide({ id: "tool.ping", version: "1.0.0" }, () => ({ pong: true })) };
const pinger: AgentDefinition = { id: "agent.pinger", version: "1.0.0", async run(_i, ctx) { return { output: await ctx.invoke("tool.ping", {}) }; } };

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function cepErrors(profile: string, envelope: unknown): string[] {
  const script = "import json,sys; from cep.godspeed import validate_profile, verify_semantics; e=json.load(sys.stdin); p=sys.argv[1]; print(json.dumps(validate_profile(e,p)+verify_semantics(e,p)))";
  const out = Bun.spawnSync(["uv", "run", "--project", CEP_REPO!, "python", "-c", script, profile], { stdin: new TextEncoder().encode(JSON.stringify(envelope)) });
  expect(out.exitCode, out.stderr.toString()).toBe(0);
  return JSON.parse(out.stdout.toString());
}

describe.skipIf(!BIN)("governed operation -> RealityTrace -> evidence -> SEA-Forge settlement (live)", () => {
  let home = "";
  let socket = "";
  let server: ReturnType<typeof Bun.spawn> | undefined;
  let world = "";
  let runtime: Runtime;
  let authority: SeaForgeAuthority;
  let delivery: ObservationDelivery;
  let port: ReturnType<typeof createSxrCliPort>;
  let workflow: Awaited<ReturnType<typeof port.prepare>>;
  const captured: { eventId: string; correlationId: string; occurredAt: string; metadata: Record<string, any> }[] = [];
  const sxrEnv = () => ({ ...process.env, XDG_DATA_HOME: join(home, "xdg-data"), XDG_STATE_HOME: join(home, "xdg-state") });
  const sxr = (args: string[]) => {
    const p = Bun.spawnSync([SXR, ...args], { cwd: join(home, "repo"), env: sxrEnv() });
    return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
  };

  beforeAll(async () => {
    expect(existsSync(SXR), `RealityTrace binary not found at ${SXR}; run \`just setup-realitytrace\``).toBe(true);
    home = mkdtempSync(join(tmpdir(), "cg-settle-"));
    socket = join(tmpdir(), `cg-settle-${process.pid}-${Math.random().toString(36).slice(2, 8)}.sock`);
    const cell = join(home, "cell");
    mkdirSync(join(cell, "worlds"), { recursive: true });
    writeFileSync(join(cell, "worlds/demo.sea"), SRC);
    writeFileSync(join(cell, "sea-forge-policy.yaml"), POLICY);
    writeFileSync(join(cell, "server.yaml"), JSON.stringify({
      socket_path: socket, root: cell,
      identity: { bindings: [{ uid: process.getuid!(), actor_id: "cognate-service", roles: ["service"] }] },
      cep_authority: { enabled: true, policy: "sea-forge-policy.yaml", worlds: [{ name: "demo", base: "worlds", entry: "demo.sea", files: ["demo.sea"] }] },
    }));
    const cli = Bun.spawnSync(["domainforge", "envelope", "--emit", "cep", "--world-name", "demo", "demo.sea"], { cwd: join(cell, "worlds") });
    expect(cli.exitCode, cli.stderr.toString()).toBe(0);
    world = JSON.parse(cli.stdout.toString()).scope.world_ref;
    server = Bun.spawn([BIN!], { env: { ...process.env, SEA_FORGE_ROOT: cell, SEA_FORGE_SOCKET: socket }, stdout: "ignore", stderr: "ignore" });
    for (let i = 0; i < 500 && !existsSync(socket); i++) await Bun.sleep(10);
    expect(existsSync(socket)).toBe(true);

    // RealityTrace's repository: a real cargo project with one passing test, so `sxr verify` can run a real verifier.
    const repo = join(home, "repo");
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "Cargo.toml"), '[package]\nname = "toy-project"\nversion = "0.1.0"\nedition = "2021"\n\n[lib]\npath = "src/lib.rs"\n');
    writeFileSync(join(repo, "src/lib.rs"), "pub fn add(a: i32, b: i32) -> i32 { a + b }\n#[cfg(test)]\nmod tests { use super::*; #[test] fn it_adds() { assert_eq!(add(2, 2), 4); } }\n");
    Bun.spawnSync(["git", "init", "-q"], { cwd: repo });
    Bun.spawnSync(["git", "add", "-A"], { cwd: repo });
    Bun.spawnSync(["git", "-c", "user.email=d@e.com", "-c", "user.name=D", "commit", "-qm", "init"], { cwd: repo });
    port = createSxrCliPort({ bin: SXR, repoDir: repo, env: { XDG_DATA_HOME: join(home, "xdg-data"), XDG_STATE_HOME: join(home, "xdg-state") } });
    workflow = await port.prepare({ title: "does the governed operation reach its declared state" });

    authority = new SeaForgeAuthority({ socketPath: socket, timeoutMs: 5_000 });
    runtime = await createRuntime({
      store: ":memory:",
      policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
      actions: { authorize: () => ({ allow: true, reason: "ok" }) },
      agents: [pinger],
      components: [tool],
      governance: { mode: "sea-forge", worldRef: world, authority },
      outboxFor: (event: PendingEvent) => {
        if (event.eventType !== "run.invocation") return [];
        const trace = governedTraceFor(event as never);
        const capabilityId = typeof event.metadata?.capability === "string" ? event.metadata.capability : undefined;
        return [observationIntent(event, { classification: "reversible_effect", ...(capabilityId ? { capabilityId } : {}), ...(trace ? { trace: trace as never } : {}) })];
      },
    });
    runtime.store.onCommitted((events) => {
      for (const e of events) if (e.eventType === "run.invocation") captured.push({ eventId: e.eventId, correlationId: e.correlationId, occurredAt: e.occurredAt, metadata: (e.metadata ?? {}) as Record<string, any> });
    });
    delivery = new ObservationDelivery(runtime.store, { port, backoff: { baseMs: 20, maxMs: 200, maxAttempts: 5 } });
  });

  afterAll(async () => {
    await runtime?.close();
    server?.kill();
    rmSync(home, { recursive: true, force: true });
    rmSync(socket, { force: true });
  });

  /** One governed run; returns the captured invocation event and the delivered observation's RealityTrace id. */
  async function governedRun(key: string) {
    const before = captured.length;
    const run = await runtime.service.startRun(alice, { agent: pinger.id, input: {}, idempotencyKey: key });
    await runtime.idle();
    expect((await runtime.service.getRun(alice, { runId: run.runId })).status).toBe("completed");
    const event = captured[before]!;
    for (let i = 0; i < 50 && !(await delivery.isRecorded(event.eventId)); i++) {
      await delivery.drain();
      await Bun.sleep(20);
    }
    expect(await delivery.isRecorded(event.eventId)).toBe(true);
    const status = (await delivery.status(event.eventId))!;
    return { event, authorityRef: event.metadata.decision.authority as { operationId: string; decisionEnvelopeId: string; worldRef: string }, targetRef: status.targetRef! };
  }

  const sxrObservationOf = (targetRef: string): string => {
    const [ledgerId, ordinal] = [targetRef.slice(0, targetRef.lastIndexOf(":")), Number(targetRef.slice(targetRef.lastIndexOf(":") + 1))];
    const rows = JSON.parse(sxr(["ledger", "export", "--repo", workflow.repoId]).out) as { ledger_id: string; append_ordinal: number; payload: any }[];
    const row = rows.find((r) => r.ledger_id === ledgerId && r.append_ordinal === ordinal)!;
    return row.payload.observations[0].observation_id;
  };

  const packetFor = async (authorityRef: { operationId: string; decisionEnvelopeId: string }, pick: (row: SxrEvidenceRow) => boolean) => {
    const { question, rows } = await port.readEvidence();
    return evidencePacketEnvelope({ worldRef: world, authority: authorityRef, question, rows: rows.filter(pick) }) as Record<string, unknown>;
  };

  test("the run's recorded decision names the SEA-Forge decision, and the trace RealityTrace records is that decision's trace", async () => {
    const { event, authorityRef, targetRef } = await governedRun("settle-1");
    expect(authorityRef.worldRef).toBe(world);
    expect(authorityRef.decisionEnvelopeId).toBe(`env-authority_decision-${authorityRef.operationId}`);

    const trace = governedTraceFor(event as never)!;
    expect(trace.envelope_kind).toBe("execution_trace");
    expect((trace.lineage_refs as string[])[0]).toBe(authorityRef.decisionEnvelopeId);
    expect((trace.scope as any).world_ref).toBe(world);
    expect((trace.extensions as any)["godspeed.execution_trace"]).toMatchObject({ operation_id: authorityRef.operationId, outcome: "completed" });
    if (CEP_REPO) expect(cepErrors("execution_trace", trace)).toEqual([]);

    // RealityTrace holds exactly those bytes, content-addressed.
    const ledger = JSON.parse(sxr(["ledger", "export", "--repo", workflow.repoId]).out) as { ledger_id: string; append_ordinal: number; payload: any }[];
    const row = ledger.find((r) => `${r.ledger_id}:${r.append_ordinal}` === targetRef)!;
    expect(row.payload.extensions.cognate.observationId).toBe(`obs-${event.eventId}`);
    const stored = row.payload.representations?.[0]?.content_hash ?? JSON.stringify(row.payload.representations);
    expect(String(stored)).toContain(sha(JSON.stringify(trace)));
  });

  test("completion alone is not settlement: a trace's own evidence is `unknown`, and SEA-Forge answers unsettled", async () => {
    const { authorityRef, targetRef } = await governedRun("settle-2");
    const observationId = sxrObservationOf(targetRef);
    await port.deriveEvidence(observationId, "execution_trace");
    const packet = await packetFor(authorityRef, (r) => String(r.evidence.representation_ref).includes(observationId));
    expect((packet.evidence as any[])[0].direction).toBe("unknown");
    if (CEP_REPO) expect(cepErrors("evidence_packet", packet)).toEqual([]);

    const receipt = await authority.submitEvidence(packet);
    expect(receipt.ok, JSON.stringify(receipt)).toBe(true);
    const settled = await authority.settle(authorityRef.operationId, world);
    expect(settled.ok, JSON.stringify(settled)).toBe(true);
    if (settled.ok) {
      expect(settled.status).toBe("unsettled");
      expect(settled.final).toBe(false);
      expect(settled.envelope.envelope_kind).toBe("settlement_packet");
      if (CEP_REPO) expect(cepErrors("settlement_packet", settled.envelope)).toEqual([]);
    }
  });

  test("a real verifier's supporting evidence settles the operation, finally, and the settlement is SEA-Forge's", async () => {
    const { authorityRef } = await governedRun("settle-3");
    // RealityTrace runs a real verifier (cargo test in its repo) under a second run and derives evidence.
    const run2 = JSON.parse(sxr(["run", "begin", "--repo", workflow.repoId, "--snapshot", "snapshot:genesis", "--question", workflow.questionId, "--threshold", workflow.thresholdId, "--json"]).out).run_id;
    expect(sxr(["plan", "create", "--run", run2, "--verifier", "cargo-test", "--target", workflow.target, "--json"]).code).toBe(0);
    const verified = JSON.parse(sxr(["verify", "run", "--run", run2, "--json"]).out).observations[0];
    expect(verified.exit_code).toBe(0);
    expect(sxr(["evidence", "create", "--run", run2, "--observation", verified.observation_id, "--derive", "--json"]).code).toBe(0);

    const packet = await packetFor(authorityRef, (r) => String(r.evidence.representation_ref).includes(verified.observation_id));
    const item = (packet.evidence as any[])[0];
    expect(item).toMatchObject({ direction: "supports", reliability: "medium", source: "realitytrace" });
    if (CEP_REPO) expect(cepErrors("evidence_packet", packet)).toEqual([]);

    expect((await authority.submitEvidence(packet)).ok).toBe(true);
    const settled = await authority.settle(authorityRef.operationId, world);
    expect(settled.ok, JSON.stringify(settled)).toBe(true);
    if (!settled.ok) return;
    expect(settled.status).toBe("settled");
    expect(settled.final).toBe(true);
    if (CEP_REPO) expect(cepErrors("settlement_packet", settled.envelope)).toEqual([]);
    // Asking again returns the recorded settlement; it is not made twice.
    const again = await authority.settle(authorityRef.operationId, world);
    expect(again.ok && again.replayed && again.status === "settled").toBe(true);
    // RealityTrace's own settlement is a different fact and is never read as this one.
    expect(JSON.stringify(settled.envelope)).not.toContain("realitytrace-settlement");
  });

  test("a contradicting verifier result rejects the operation", async () => {
    const { authorityRef } = await governedRun("settle-4");
    // Break the test in RealityTrace's repo, then verify again under a new run.
    const lib = join(home, "repo", "src/lib.rs");
    const original = await Bun.file(lib).text();
    writeFileSync(lib, original.replace("assert_eq!(add(2, 2), 4)", "assert_eq!(add(2, 2), 5)"));
    try {
      const run3 = JSON.parse(sxr(["run", "begin", "--repo", workflow.repoId, "--snapshot", "snapshot:genesis", "--question", workflow.questionId, "--threshold", workflow.thresholdId, "--json"]).out).run_id;
      sxr(["plan", "create", "--run", run3, "--verifier", "cargo-test", "--target", workflow.target, "--json"]);
      const verified = JSON.parse(sxr(["verify", "run", "--run", run3, "--json"]).out).observations[0];
      expect(verified.exit_code).not.toBe(0);
      sxr(["evidence", "create", "--run", run3, "--observation", verified.observation_id, "--derive", "--json"]);
      const packet = await packetFor(authorityRef, (r) => String(r.evidence.representation_ref).includes(verified.observation_id));
      expect((packet.evidence as any[])[0].direction).toBe("contradicts");
      expect((await authority.submitEvidence(packet)).ok).toBe(true);
      const settled = await authority.settle(authorityRef.operationId, world);
      expect(settled.ok && settled.status === "rejected" && settled.final).toBe(true);
    } finally {
      writeFileSync(lib, original);
    }
  });

  test("the chain cannot be forged: wrong operation, wrong decision, other world, and no allow all fail closed", async () => {
    const { authorityRef } = await governedRun("settle-5");
    const good = await packetFor(authorityRef, () => true);
    const tamper = (mutate: (p: any) => void) => {
      const p = structuredClone(good) as any;
      mutate(p);
      return authority.submitEvidence(p);
    };
    expect((await tamper((p) => (p.extensions["godspeed.evidence_packet"].operation_id = "op-someone-else"))).ok).toBe(false);
    expect((await tamper((p) => (p.extensions["godspeed.evidence_packet"].authority_decision_ref = "env-authority_decision-op-other"))).ok).toBe(false);
    expect((await tamper((p) => (p.scope.world_ref = `world:demo@sha256:${"9".repeat(64)}`))).ok).toBe(false);
    expect((await tamper((p) => (p.lineage_refs = ["env-unrelated"]))).ok).toBe(false);
    // And settling an operation that was never allowed has nothing to stand on.
    const ghost = await authority.settle("op-never-allowed", world);
    expect(ghost.ok).toBe(false);
    // The genuine packet is still accepted afterwards: none of the above poisoned the record.
    const accepted = await authority.submitEvidence(good);
    expect(accepted.ok, JSON.stringify(accepted)).toBe(true);
  });
});
