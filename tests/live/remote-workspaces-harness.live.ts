// Live gate, application level: the Cognate harness app (real runtime, SQLite, aimock agent) with a
// workspace on a REAL OpenSSH sshd and on a REAL WSL distribution. The evidence that work happened
// there: `SSH_CONNECTION` is set only by sshd, and the distro's /etc/os-release differs from this host.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@cognate/client";
import { connectTransport, devToken } from "@cognate/protocol-connect-bun";
import { createRemoteRuntimeService } from "@cognate/protocol-connect";
import { LOCAL_OPERATOR, startServer } from "../../validation/reconstructions/deepseek-harness/cognate/src/server.ts";
import { bootAimock } from "../../validation/reconstructions/deepseek-harness/cognate/test/helpers.ts";
import { startRealSshd } from "./sshd.ts";
import type { RealSshd } from "./sshd.ts";

const clientFor = (url: string) => createClient({ service: createRemoteRuntimeService(connectTransport(url), () => devToken(LOCAL_OPERATOR)), caller: LOCAL_OPERATOR });
type Client = ReturnType<typeof clientFor>;
const finish = async (app: Awaited<ReturnType<typeof startServer>>, runId: string) => { for (let i = 0; i < 1200; i++) { const r = await app.runtime.service.getRun(LOCAL_OPERATOR, { runId }); if (["completed", "failed", "cancelled"].includes(r.status)) return r; await new Promise((x) => setTimeout(x, 25)); } throw new Error("run did not finish"); };
const runAgent = async (app: Awaited<ReturnType<typeof startServer>>, client: Client, workspaceId: string, message: string) => {
  const sessionId = randomUUID();
  const run = await client.startRun("agent.coding", { sessionId, workspaceId, message } as never, { idempotencyKey: randomUUID(), correlationId: `session:${sessionId}` });
  return finish(app, run.runId);
};

let sshd: RealSshd;
let aimock: Awaited<ReturnType<typeof bootAimock>>;
beforeAll(async () => { sshd = await startRealSshd(); aimock = await bootAimock(); });
afterAll(async () => { await sshd?.stop(); await aimock?.stop(); });

const configureModel = (client: Client) => client.invoke("model.configure", { providerId: "mock", baseURL: `http://127.0.0.1:${aimock.port}/v1`, protocol: "openai-compatible", model: "mock-model-1", apiKey: "" });

describe("live app: real OpenSSH sshd", () => {
  test("probe -> pin -> key-auth connect -> workspace -> read/bash/edit through sshd -> restart", async () => {
    const home = await mkdtemp(join(tmpdir(), "cognate-live-home-"));
    const remote = await mkdtemp(join(tmpdir(), "cognate-live-remote-"));
    await mkdir(join(remote, "src"), { recursive: true });
    await writeFile(join(remote, "src/greet.ts"), 'export const greet = () => "Hello";\n');
    const keyPath = join(sshd.dir, "client");
    let app = await startServer({ port: 0, home });
    let client = clientFor(app.url);
    try {
      await configureModel(client);
      const probe = (await client.invoke("execution.world.probe", { host: "127.0.0.1", port: sshd.port })) as { fingerprint: string; keyType: string };
      expect(probe.fingerprint).toBe(sshd.fingerprint);
      expect(probe.keyType).toBe("ssh-ed25519");

      const world = (await client.invoke("execution.world.connect", { kind: "ssh", ssh: { host: "127.0.0.1", port: sshd.port, username: sshd.user, auth: { kind: "key", privateKeyPath: keyPath }, hostKeyFingerprint: probe.fingerprint } } as never)) as { worldId: string; metadata: Record<string, string>; home: string };
      expect(world.metadata.hostKey).toBe(sshd.fingerprint);
      const via = (await client.invoke("process.exec", { worldId: world.worldId, argv: ["sh", "-c", 'printf %s "$SSH_CONNECTION"'], cwd: "/" })) as { stdout: string };
      expect(via.stdout).toContain("127.0.0.1"); // set only by sshd: this really ran over SSH
      const local = (await client.invoke("process.exec", { worldId: "local", argv: ["sh", "-c", 'printf %s "$SSH_CONNECTION"'], cwd: "/" })) as { stdout: string };
      expect(local.stdout).toBe("");

      const sel = (await client.invoke("workspace.select", { path: remote, worldId: world.worldId })) as { workspaceId: string; executionWorldId: string };
      expect(sel.executionWorldId).toBe(world.worldId);
      const done = await runAgent(app, client, sel.workspaceId, "[[scenario:multi]] check and change the greeting");
      expect(done.status).toBe("completed");
      expect(await readFile(join(remote, "src/greet.ts"), "utf8")).toContain("Howdy");

      // no key material in durable state; the key is referenced by path only
      const events: string[] = [];
      for await (const e of app.runtime.service.events(LOCAL_OPERATOR, {})) events.push(JSON.stringify(e.payload));
      const keyBody = (await readFile(keyPath, "utf8")).split("\n").slice(1, 3).join("");
      expect(events.join("")).not.toContain(keyBody);

      await app.stop();
      app = await startServer({ port: 0, home });
      client = clientFor(app.url);
      const check = (await client.invoke("execution.world.check", { worldId: world.worldId })) as { ok: boolean };
      expect(check.ok).toBe(true);

      await sshd.dropSessions();
      await Bun.sleep(300);
      expect(((await client.invoke("execution.world.check", { worldId: world.worldId })) as { ok: boolean }).ok).toBe(true); // reconnects after a drop
    } finally {
      await app.stop();
      await rm(home, { recursive: true, force: true });
      await rm(remote, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("live app: real WSL distribution", () => {
  const distro = process.env.COGNATE_WSL_DISTRO ?? "Ubuntu-24.04";
  test("connect a distribution -> workspace inside it -> read/bash/edit run in the distro", async () => {
    const home = await mkdtemp(join(tmpdir(), "cognate-live-home-"));
    const app = await startServer({ port: 0, home });
    const client = clientFor(app.url);
    const root = `/tmp/cognate-live-wsl-ws-${Date.now()}`;
    try {
      await configureModel(client);
      // The dialog shows "WSL did not respond — Try again" when wsl.exe itself fails (e.g. WSL's own
      // `UtilAcceptVsock accept4 failed 110`); this does what a person would: try again, up to 3 times.
      type Listed = { available: boolean; distros: { name: string }[]; reason?: string; detail?: string };
      let listed = (await client.invoke("execution.wsl.list", {})) as Listed;
      for (let i = 1; i < 3 && !listed.available; i++) listed = (await client.invoke("execution.wsl.list", {})) as Listed;
      expect(`${listed.available} ${listed.reason ?? ""} ${listed.detail ?? ""}`.trim()).toBe("true");
      expect(listed.distros.map((d) => d.name)).toContain(distro);

      const world = (await client.invoke("execution.world.connect", { kind: "wsl", wsl: { distro } } as never)) as { worldId: string; metadata: Record<string, string> };
      expect(world.metadata.distro).toBe(distro);
      const exec = (argv: string[], cwd = "/tmp") => client.invoke("process.exec", { worldId: world.worldId, argv, cwd }) as Promise<{ stdout: string; exitCode: number }>;
      const inDistro = (await exec(["sh", "-c", ". /etc/os-release; printf %s \"$VERSION_ID\""])).stdout;
      const onHost = (await Bun.$`sh -c '. /etc/os-release; printf %s "$VERSION_ID"'`.text()).trim();
      expect(inDistro).toBe(distro.replace(/^Ubuntu-/, ""));
      expect(inDistro).not.toBe(onHost); // it really ran in the other distribution

      await exec(["mkdir", "-p", `${root}/src`]);
      await client.invoke("filesystem.writeText", { worldId: world.worldId, path: `${root}/src/greet.ts`, content: 'export const greet = () => "Hello";\n' });
      const sel = (await client.invoke("workspace.select", { path: root, worldId: world.worldId })) as { workspaceId: string; root: string };
      expect(sel.root).toBe(root); // a distro path, not a local placeholder
      const done = await runAgent(app, client, sel.workspaceId, "[[scenario:multi]] check and change the greeting");
      expect(done.status).toBe("completed");
      const after = (await client.invoke("filesystem.readText", { worldId: world.worldId, path: `${root}/src/greet.ts` })) as { content: string };
      expect(after.content).toContain("Howdy");
      expect(await Bun.file(join(root, "src/greet.ts")).exists()).toBe(false); // nothing was written locally
    } finally {
      await app.stop();
      await Bun.$`wsl.exe -d ${distro} --cd / -e rm -rf ${root}`.nothrow().quiet();
      await rm(home, { recursive: true, force: true });
    }
  }, 180_000);
});
