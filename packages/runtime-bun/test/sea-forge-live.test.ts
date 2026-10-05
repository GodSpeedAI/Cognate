// Live CEP authority loop: Cognate <-> a real sea-forge-server over a real Unix socket, in a world pinned by a
// real DomainForge CLI. Needs SEA_FORGE_SERVER_BIN (and `domainforge` on PATH); without the binary the suite
// is reported as skipped, which is NOT a pass -- run it with the binary before claiming the loop works.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentDefinition } from "@cognate/runtime-api";
import type { Component } from "@cognate/kernel-api";
import { createRuntime, SeaForgeAuthority, timeoutSecsEnforcer } from "../src/index.ts";
import { exchange } from "../src/sea-forge-authority.ts";

const BIN = process.env.SEA_FORGE_SERVER_BIN;
const SRC = '@namespace "t"\nentity "Tank" { key id: uuid }\n';
// Same logical file name in each directory: a world's identity includes its logical URIs.
const EDITED = '// reviewed\n@namespace "t"\nentity "Tank" { key id: uuid }\n';
const CHANGED = '@namespace "t"\nentity "Tank" { key id: uuid }\nentity "Pump" { key id: uuid }\n';
const POLICY = [
  'version: "0.1"',
  "rules:",
  "  - name: moves",
  "    verdict: allow",
  "    actor_role: service",
  "    operation_kind: world_transition",
  "  - name: allow-actions",
  "    verdict: allow",
  "    actor_role: service",
  "    operation_kind: cognate_action",
  "  - name: bob-bounded",
  "    verdict: allow",
  "    actor_role: service",
  "    operation_kind: cognate_capability",
  '    subjects: ["actor:tenant-a/bob"]',
  "    disposition: boundary",
  "    boundary_constraints:",
  '      timeout_secs: ["1"]',
  "  - name: approvers",
  "    verdict: allow",
  "    actor_role: operator",
  "    operation_kind: approval_resolution",
  "  - name: gate-capabilities",
  "    verdict: allow",
  "    actor_role: service",
  "    operation_kind: cognate_capability",
  "    requires_approval: true",
  "",
].join("\n");

const alice = { tenant: "tenant-a", actor: { id: "alice", kind: "user" as const } };
const bob = { tenant: "tenant-a", actor: { id: "bob", kind: "user" as const } };
const slow: Component = {
  id: "slow-provider",
  provides: [{ id: "tool.slow", version: "1.0.0" }],
  activate: (fiber) =>
    fiber.provide({ id: "tool.slow", version: "1.0.0" }, (_input, ctx) => new Promise((resolve) => {
      const done = setTimeout(() => resolve({ finished: true }), 6_000);
      ctx.signal.addEventListener("abort", () => (clearTimeout(done), resolve({ aborted: true })), { once: true });
    })),
};
const echo: AgentDefinition = { id: "agent.echo", version: "1.0.0", async run(input) { return { output: input }; } };
const invoker: AgentDefinition = { id: "agent.invoker", version: "1.0.0", async run(_input, ctx) { return { output: await ctx.invoke("tool.ping", {}) }; } };
const tool: Component = { id: "tool-provider", provides: [{ id: "tool.ping", version: "1.0.0" }], activate: (fiber) => fiber.provide({ id: "tool.ping", version: "1.0.0" }, () => ({ pong: true })) };

describe.skipIf(!BIN)("live CEP authority loop (SEA-Forge server + DomainForge CLI)", () => {
  let root = "";
  let socket = "";
  let server: ReturnType<typeof Bun.spawn> | undefined;
  let world = "";
  let worldEdited = "";
  let worldChanged = "";

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "cg-live-"));
    socket = join(tmpdir(), `cg-live-${process.pid}-${Math.random().toString(36).slice(2, 8)}.sock`);
    mkdirSync(join(root, "worlds"));
    writeFileSync(join(root, "worlds/demo.sea"), SRC);
    for (const [dir, src] of [["worlds-edited", EDITED], ["worlds-changed", CHANGED]] as const) {
      mkdirSync(join(root, dir));
      writeFileSync(join(root, dir, "demo.sea"), src);
    }
    writeFileSync(join(root, "sea-forge-policy.yaml"), POLICY);
    writeFileSync(
      join(root, "server.yaml"),
      JSON.stringify({
        socket_path: socket,
        root,
        identity: { bindings: [{ uid: process.getuid!(), actor_id: "cognate-service", roles: ["service"] }, { uid: process.getuid!(), actor_id: "op-alice", roles: ["operator"] }] },
        cep_authority: { enabled: true, policy: "sea-forge-policy.yaml", worlds: ["worlds", "worlds-edited", "worlds-changed"].map((base) => ({ name: "demo", base, entry: "demo.sea", files: ["demo.sea"] })) },
      }),
    );
    // The world_ref comes from DomainForge itself; SEA-Forge must independently arrive at the same one.
    const cli = Bun.spawnSync(["domainforge", "envelope", "--emit", "cep", "--world-name", "demo", "demo.sea"], { cwd: join(root, "worlds") });
    expect(cli.exitCode, cli.stderr.toString()).toBe(0);
    world = JSON.parse(cli.stdout.toString()).scope.world_ref;
    const refOf = (dir: string) => {
      const out = Bun.spawnSync(["domainforge", "envelope", "--emit", "cep", "--world-name", "demo", "demo.sea"], { cwd: join(root, dir) });
      expect(out.exitCode, out.stderr.toString()).toBe(0);
      return JSON.parse(out.stdout.toString()).scope.world_ref as string;
    };
    worldEdited = refOf("worlds-edited");
    worldChanged = refOf("worlds-changed");
    server = Bun.spawn([BIN!], { env: { ...process.env, SEA_FORGE_ROOT: root, SEA_FORGE_SOCKET: socket }, stdout: "ignore", stderr: "ignore" });
    for (let i = 0; i < 500 && !existsSync(socket); i++) await Bun.sleep(10);
    expect(existsSync(socket)).toBe(true);
  });

  afterAll(() => {
    server?.kill();
    rmSync(root, { recursive: true, force: true });
    rmSync(socket, { force: true });
  });

  const open = (worldRef: string, socketPath = socket) =>
    createRuntime({
      store: ":memory:",
      policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
      actions: { authorize: () => ({ allow: true, reason: "ok" }) },
      agents: [echo, invoker],
      components: [tool, slow],
      governance: { mode: "sea-forge", worldRef, authority: new SeaForgeAuthority({ socketPath, timeoutMs: 3_000 }), enforcers: { timeout_secs: timeoutSecsEnforcer } },
    });

  test("DomainForge's world_ref is the world SEA-Forge governs (no 'unknown world')", async () => {
    const rt = await open(world);
    try {
      const run = await rt.service.startRun(alice, { agent: echo.id, input: { hello: 1 }, idempotencyKey: "live-1" });
      await rt.idle();
      expect((await rt.service.getRun(alice, { runId: run.runId })).status).toBe("completed");
    } finally {
      await rt.close();
    }
  });

  test("the real policy gates the capability surface: escalate means the provider never runs", async () => {
    const rt = await open(world);
    try {
      const run = await rt.service.startRun(alice, { agent: invoker.id, input: {}, idempotencyKey: "live-2" });
      await rt.idle();
      expect((await rt.service.getRun(alice, { runId: run.runId })).status).not.toBe("completed");
    } finally {
      await rt.close();
    }
  });

  test("per-subject policy through the real server: bob's capability calls are bounded to 1s, alice's stay gated", async () => {
    const rt = await open(world);
    try {
      expect(await rt.service.invoke(bob, { capability: "tool.ping", input: {} })).toEqual({ pong: true });
      const started = Date.now();
      await expect(rt.service.invoke(bob, { capability: "tool.slow", input: {} })).rejects.toMatchObject({ code: "deadline_exceeded" });
      expect(Date.now() - started).toBeLessThan(4_000);
      await expect(rt.service.invoke(alice, { capability: "tool.ping", input: {} })).rejects.toMatchObject({ code: "permission_denied" });
    } finally {
      await rt.close();
    }
  });

  describe("escalation to a human approval, end to end", () => {
    const call = (frame: Record<string, unknown>) => exchange(socket, frame, 3_000, 256 * 1024) as Promise<Record<string, any>>;
    const resolve = (approvalId: string, resolution: "approved" | "rejected", actor = { actor_id: "op-alice", role: "operator" }) =>
      call({ verb: "authority_approval", approval_id: approvalId, resolution, request_id: `res-${approvalId}-${resolution}-${actor.actor_id}`, actor });
    const pending = async (rt: Awaited<ReturnType<typeof open>>, runId: string) => (await rt.service.listContinuations(alice, { runId, status: "OPEN" }))[0]!;
    const state = (rt: Awaited<ReturnType<typeof open>>, runId: string) => rt.service.getRun(alice, { runId }).then((r) => r.status);
    const until = async <T,>(read: () => Promise<T>, ok: (v: T) => boolean, what: string): Promise<T> => {
      const end = Date.now() + 8_000;
      for (;;) {
        const v = await read();
        if (ok(v)) return v;
        if (Date.now() > end) throw new Error(`timed out: ${what}`);
        await Bun.sleep(20);
      }
    };

    test("wait -> approved by someone else -> resume -> revalidated -> provider runs once; the approval is single-use", async () => {
      const rt = await open(world);
      try {
        const run = await rt.service.startRun(alice, { agent: invoker.id, input: {}, idempotencyKey: "esc-1" });
        await until(() => state(rt, run.runId), (s) => s === "waiting", "run waits on approval");
        const wait = await pending(rt, run.runId);
        const approvalId = (wait.condition as { approvalId: string }).approvalId;
        expect(approvalId).toMatch(/^apr-op-/);

        // Still pending at SEA-Forge: polling changes nothing.
        expect(await rt.pollApprovals()).toBe(0);
        // The requester's own identity cannot approve; an authorized different identity can.
        const selfApprove = await resolve(approvalId, "approved", { actor_id: "cognate-service", role: "service" });
        expect(selfApprove.error_class).toBe("cep_approval_refused");
        expect((await resolve(approvalId, "approved")).ok).toBe(true);

        expect(await rt.pollApprovals()).toBe(1);
        await until(() => state(rt, run.runId), (s) => s === "completed", "run completes after revalidation");
        const final = await call({ verb: "authority_approvals" });
        expect(final.approvals.find((a: any) => a.approval_id === approvalId).state).toBe("used");
      } finally {
        await rt.close();
      }
    });

    test("an unapproved poke cannot get through: resuming by hand is revalidated and refused", async () => {
      const rt = await open(world);
      try {
        const run = await rt.service.startRun(alice, { agent: invoker.id, input: {}, idempotencyKey: "esc-2" });
        await until(() => state(rt, run.runId), (s) => s === "waiting", "waits");
        const wait = await pending(rt, run.runId);
        await rt.service.resolveContinuation(alice, { continuationId: wait.id, action: "resume", input: { approved: true }, idempotencyKey: "poke-1" });
        await until(() => state(rt, run.runId), (s) => s === "failed", "run fails closed at SEA-Forge");
      } finally {
        await rt.close();
      }
    });

    test("a rejected approval fails the run", async () => {
      const rt = await open(world);
      try {
        const run = await rt.service.startRun(alice, { agent: invoker.id, input: {}, idempotencyKey: "esc-3" });
        await until(() => state(rt, run.runId), (s) => s === "waiting", "waits");
        const approvalId = ((await pending(rt, run.runId)).condition as { approvalId: string }).approvalId;
        expect((await resolve(approvalId, "rejected")).ok).toBe(true);
        expect(await rt.pollApprovals()).toBe(1);
        await until(() => state(rt, run.runId), (s) => s === "failed", "run fails");
      } finally {
        await rt.close();
      }
    });
  });

  test("a world SEA-Forge has not registered is refused", async () => {
    const rt = await open(`world:demo@sha256:${"f".repeat(64)}`);
    try {
      await expect(rt.service.startRun(alice, { agent: echo.id, input: {}, idempotencyKey: "live-3" })).rejects.toMatchObject({ code: "permission_denied" });
    } finally {
      await rt.close();
    }
  });

  test("every decision is committed to the cell's append-only ledger", () => {
    const entries: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) (e.isDirectory() ? walk(join(dir, e.name)) : entries.push(join(dir, e.name)));
    };
    walk(root);
    expect(entries.some((p) => p.includes("cognate-authority"))).toBe(true);
  });

  test("with SEA-Forge unreachable the runtime fails closed", async () => {
    const rt = await open(world, join(tmpdir(), "cg-live-nobody-home.sock"));
    try {
      await expect(rt.service.startRun(alice, { agent: echo.id, input: {}, idempotencyKey: "live-4" })).rejects.toMatchObject({ code: "permission_denied" });
    } finally {
      await rt.close();
    }
  });

  describe("world transitions (Stage 10)", () => {
    const authority = () => new SeaForgeAuthority({ socketPath: socket, timeoutMs: 3_000 });
    const call = (frame: Record<string, unknown>) => exchange(socket, frame, 3_000, 256 * 1024) as Promise<Record<string, any>>;
    const move = (target: string, kind: "source_edit_only" | "semantic_change") => ({ sourceWorldRef: world, targetWorldRef: target, kind, reason: "adopt the reviewed model", caller: alice });

    test("DomainForge names three different worlds, and a comment edit is one of them", () => {
      expect(new Set([world, worldEdited, worldChanged]).size).toBe(3);
    });

    test("a meaning-preserving move is allowed; a semantic change escalates until a human approves it", async () => {
      const a = authority();
      expect(await a.listTransitions()).toEqual([]);

      expect(await a.requestWorldTransition(move(worldEdited, "source_edit_only"))).toMatchObject({ disposition: "allow" });

      const asked = await a.requestWorldTransition(move(worldChanged, "semantic_change"));
      expect(asked.disposition).toBe("escalate");
      const approvalId = asked.escalation!.approvalId;
      expect((await a.listTransitions()).map((t) => t.targetWorldRef)).toEqual([worldEdited]);

      // The requester's own identity cannot approve; a different operator can.
      expect((await call({ verb: "authority_approval", approval_id: approvalId, resolution: "approved", request_id: "t-self", actor: { actor_id: "cognate-service", role: "service" } })).ok).not.toBe(true);
      const resolved = await call({ verb: "authority_approval", approval_id: approvalId, resolution: "approved", request_id: "t-ok", actor: { actor_id: "op-alice", role: "operator" } });
      expect(resolved.state).toBe("approved");

      // The retry names the approval; the client links it back to the escalated request.
      const allowed = await a.requestWorldTransition(move(worldChanged, "semantic_change"), { approvalId });
      expect(allowed.disposition).toBe("allow");

      const moves = await a.listTransitions();
      expect(moves).toHaveLength(2);
      expect(moves[0]).toMatchObject({ sourceWorldRef: world, targetWorldRef: worldEdited, semanticClosureEqual: true, compatibility: "compatible" });
      expect(moves[1]).toMatchObject({ targetWorldRef: worldChanged, semanticClosureEqual: false, approvalId });
    });

    test("an unregistered target is refused, not allowed", async () => {
      const decision = await authority().requestWorldTransition(move(`world:demo@sha256:${"e".repeat(64)}`, "semantic_change"));
      expect(decision.disposition).toBe("unknown");
      expect(decision.reason).toContain("cep_transition_refused");
    });
  });
});
