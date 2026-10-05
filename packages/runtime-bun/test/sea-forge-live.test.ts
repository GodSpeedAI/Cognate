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

const BIN = process.env.SEA_FORGE_SERVER_BIN;
const SRC = '@namespace "t"\nentity "Tank" { key id: uuid }\n';
const POLICY = [
  'version: "0.1"',
  "rules:",
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

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "cg-live-"));
    socket = join(tmpdir(), `cg-live-${process.pid}-${Math.random().toString(36).slice(2, 8)}.sock`);
    mkdirSync(join(root, "worlds"));
    writeFileSync(join(root, "worlds/demo.sea"), SRC);
    writeFileSync(join(root, "sea-forge-policy.yaml"), POLICY);
    writeFileSync(
      join(root, "server.yaml"),
      JSON.stringify({
        socket_path: socket,
        root,
        identity: { bindings: [{ uid: process.getuid!(), actor_id: "cognate-service", roles: ["service"] }] },
        cep_authority: { enabled: true, policy: "sea-forge-policy.yaml", worlds: [{ name: "demo", base: "worlds", entry: "demo.sea", files: ["demo.sea"] }] },
      }),
    );
    // The world_ref comes from DomainForge itself; SEA-Forge must independently arrive at the same one.
    const cli = Bun.spawnSync(["domainforge", "envelope", "--emit", "cep", "--world-name", "demo", "demo.sea"], { cwd: join(root, "worlds") });
    expect(cli.exitCode, cli.stderr.toString()).toBe(0);
    world = JSON.parse(cli.stdout.toString()).scope.world_ref;
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
});
