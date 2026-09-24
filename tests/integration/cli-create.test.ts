// CG-CLI-001 (spec §37 Phase 10): generate a starter in a clean directory, install, test, run dev, survive restart.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = mkdtempSync(join(tmpdir(), "cognate-cli-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const repo = resolve(".");
const bin = resolve("packages/cli/src/bin.ts");

async function run(cmd: string[], cwd: string, env: Record<string, string> = {}) {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } });
  const [exit, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { exit, stdout, stderr };
}

async function devServer(cwd: string, port: number) {
  const proc = Bun.spawn(["bun", "run", "dev", "--port", String(port)], { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env } });
  const reader = proc.stdout.getReader();
  let out = "";
  const deadline = Date.now() + 30_000;
  while (!out.includes("listening") && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    out += new TextDecoder().decode(value);
  }
  reader.releaseLock();
  if (!out.includes("listening")) throw new Error(`dev server did not start: ${out}\n${await new Response(proc.stderr).text()}`);
  return proc;
}

describe("cognate create / dev (Phase 10)", () => {
  const app = join(root, "my-app");

  test("create generates the documented starter layout and reports unsupported adapters", async () => {
    const result = await run(["bun", bin, "create", app, "--profile", "copilot", "--source", repo, "--with", "sona"], root);
    expect(result.exit).toBe(0);
    for (const path of ["domain", "src/agents", "src/capabilities", "src/components", "src/projections", "src/ui", "cognate.config.ts", "package.json"]) expect(existsSync(join(app, path))).toBe(true);
    expect(result.stdout + result.stderr).toMatch(/unsupported.*sona/i);
    const manifest = await Bun.file(join(app, "package.json")).json();
    expect(JSON.stringify(manifest)).not.toContain("sona");
    expect(manifest.scripts.dev).toContain("cognate dev");
  }, 120_000);

  test("the generated app installs its pinned packages and passes its own tests", async () => {
    expect((await run(["bun", "install"], app)).exit).toBe(0);
    const tests = await run(["bun", "test"], app);
    expect(tests.stderr).toMatch(/\d+ pass/);
    expect(tests.exit).toBe(0);
  }, 300_000);

  test("bun dev serves health with a loaded semantic projection, runs an agent, and survives restart", async () => {
    const port = 43_000 + Math.floor(Math.random() * 1000);
    let server = await devServer(app, port);
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    expect(health).toMatchObject({ ok: true, semantic: { objects: expect.any(Number), digest: expect.stringMatching(/^sha256:/) } });
    expect(health.semantic.objects).toBeGreaterThan(0);
    const call = (method: string, body: unknown) => fetch(`http://127.0.0.1:${port}/cognate.v1.RuntimeService/${method}`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer tenant-a:alice" }, body: JSON.stringify(body) }).then((r) => r.json());
    const started = await call("StartRun", { agent: health.agents[0], input: { message: "hello" }, idempotencyKey: "cli-1" });
    expect(started.runId).toBeString();
    let status = "";
    for (let i = 0; i < 300 && !["RUN_STATUS_COMPLETED", "RUN_STATUS_WAITING"].includes(status); i++) {
      status = (await call("GetRun", { runId: started.runId })).status;
      await Bun.sleep(20);
    }
    expect(["RUN_STATUS_COMPLETED", "RUN_STATUS_WAITING"]).toContain(status);
    server.kill();
    await server.exited;
    server = await devServer(app, port);
    expect((await call("GetRun", { runId: started.runId })).runId).toBe(started.runId);
    expect((await (await fetch(`http://127.0.0.1:${port}/`)).text()).toLowerCase()).toContain("<!doctype html>");
    server.kill();
    await server.exited;
  }, 120_000);

  test("the harness profile generates too", async () => {
    const result = await run(["bun", bin, "create", join(root, "my-agent"), "--profile", "harness", "--source", repo], root);
    expect(result.exit).toBe(0);
    expect(existsSync(join(root, "my-agent", "cognate.config.ts"))).toBe(true);
  }, 120_000);
});
