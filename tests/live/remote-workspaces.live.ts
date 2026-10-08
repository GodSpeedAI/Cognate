// Live gate for Remote Workspaces: the SSH and WSL execution-world providers against REAL servers —
// an OpenSSH sshd (user space, loopback, built by `just setup-openssh`) and a real WSL distribution.
// Run with `just remote-workspaces-live` (or `bun scripts/remote-workspaces-live.ts`). It FAILS, never
// skips, when its prerequisites are missing. Optional: COGNATE_SSH_HOST/USER/KEY[/PORT/ROOT] points the
// same suite at a host of your own (host key from ~/.ssh/known_hosts).
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PathEscapeError, WorldUnavailableError } from "@godspeedai/execution";
import { executionWorldConformance } from "@godspeedai/execution/conformance";
import { HostKeyMismatchError, sshExecutionWorld } from "@godspeedai/execution-ssh";
import type { SshWorldOptions } from "@godspeedai/execution-ssh";
import { wslExecutionWorld } from "@godspeedai/execution-wsl";
import { startRealSshd } from "./sshd.ts";
import type { RealSshd } from "./sshd.ts";

const survivors = async (marker: string) => (await Bun.$`pgrep -x sleep -a`.nothrow().text()).split("\n").filter((l) => l.endsWith(` ${marker}`)).length;

// ---- real OpenSSH --------------------------------------------------------------------------------
let sshd: RealSshd;
const baseOpts = (o: Partial<SshWorldOptions> = {}): SshWorldOptions => ({
  worldId: "live-ssh", host: "127.0.0.1", port: sshd.port, username: sshd.user, auth: { kind: "key", privateKey: sshd.clientKeyPem },
  hostKeys: { fingerprints: [sshd.fingerprint] }, readyTimeoutMs: 10_000, ...o,
});
beforeAll(async () => { sshd = await startRealSshd(); });
afterAll(async () => { await sshd?.stop(); });

describe("live: OpenSSH sshd", () => {
  const worlds: { dispose(): Promise<void> }[] = [];
  const world = (o: Partial<SshWorldOptions> = {}) => { const w = sshExecutionWorld(baseOpts(o)); worlds.push(w); return w; };
  const dirs: string[] = [];
  const tmp = async () => { const d = await mkdtemp(join(tmpdir(), "cognate-live-")); dirs.push(d); return d; };
  afterAll(async () => { for (const w of worlds) await w.dispose(); for (const d of dirs) await rm(d, { recursive: true, force: true }); });

  test("authenticates with a key, verifies the host key, runs commands and file I/O in the right cwd", async () => {
    const w = world();
    const root = await tmp();
    expect((await w.process.exec({ argv: ["pwd"], cwd: root })).stdout.trim()).toBe(root);
    const f = w.fileSystem.resolve(root, "hello world.txt");
    await w.fileSystem.writeText(f, "héllo\n'q'");
    expect(await w.fileSystem.readText(f)).toBe("héllo\n'q'");
    expect(w.metadata.hostKey).toBe(sshd.fingerprint);
    expect(JSON.stringify(w.metadata)).not.toContain("PRIVATE KEY");
  });

  test("a wrong host key is refused before any authentication or command", async () => {
    const w = world({ worldId: "bad-hk", hostKeys: { fingerprints: ["SHA256:" + "A".repeat(43)] } });
    await expect(w.process.exec({ argv: ["true"], cwd: "/tmp" })).rejects.toThrow(HostKeyMismatchError);
  });

  test("known_hosts policy: a hashed entry produced by ssh-keygen -H is honoured", async () => {
    const dir = await tmp();
    const file = join(dir, "known_hosts");
    await writeFile(file, `[127.0.0.1]:${sshd.port} ${sshd.hostPublicLine.split(" ").slice(0, 2).join(" ")}\n`);
    await Bun.$`${join(import.meta.dir, "..", "..", ".tmp", "openssh", "prefix", "bin", "ssh-keygen")} -H -f ${file}`.quiet();
    const w = world({ worldId: "kh", hostKeys: { knownHostsPath: file } });
    expect((await w.process.exec({ argv: ["printf", "ok"], cwd: "/tmp" })).stdout).toBe("ok");
  });

  test("a timeout ends the remote command AND its whole process tree on a real sshd", async () => {
    const w = world();
    const r = await w.process.exec({ argv: ["bash", "-lc", "sleep 4711.1 & sleep 4711.1; wait"], cwd: "/tmp", timeoutMs: 700 });
    expect(r.timedOut).toBe(true);
    await Bun.sleep(2500);
    expect(await survivors("4711.1")).toBe(0);
  });

  test("abort ends the remote command; disposing the world ends in-flight commands", async () => {
    const w = world({ worldId: "abort" });
    const c = new AbortController();
    const p = w.process.exec({ argv: ["sleep", "4712.2"], cwd: "/tmp", timeoutMs: 60_000 }, { signal: c.signal });
    await Bun.sleep(600);
    expect(await survivors("4712.2")).toBe(1);
    c.abort();
    await p;
    await Bun.sleep(2500);
    expect(await survivors("4712.2")).toBe(0);
    const w2 = world({ worldId: "dispose" });
    const p2 = w2.process.exec({ argv: ["sleep", "4713.3"], cwd: "/tmp", timeoutMs: 60_000 });
    await Bun.sleep(600);
    await w2.dispose();
    await p2;
    await Bun.sleep(2500);
    expect(await survivors("4713.3")).toBe(0);
    await expect(w2.process.exec({ argv: ["true"], cwd: "/tmp" })).rejects.toThrow(WorldUnavailableError);
  });

  test("the connection is reused, and re-established after the server drops every session", async () => {
    const w = world({ worldId: "reuse" });
    const root = await tmp();
    await w.process.exec({ argv: ["true"], cwd: root });
    const f = w.fileSystem.resolve(root, "a.txt");
    await w.fileSystem.writeText(f, "one");
    await sshd.dropSessions();
    await Bun.sleep(300);
    expect(await w.fileSystem.readText(f)).toBe("one");
    expect((await w.process.exec({ argv: ["printf", "back"], cwd: root })).stdout).toBe("back");
  });

  test("ProxyJump through the sshd to itself, each hop verified", async () => {
    const w = world({ worldId: "jump", jump: [{ host: "127.0.0.1", port: sshd.port, username: sshd.user, auth: { kind: "key", privateKey: sshd.clientKeyPem }, hostKeys: { fingerprints: [sshd.fingerprint] } }] });
    expect((await w.process.exec({ argv: ["printf", "hop"], cwd: "/tmp" })).stdout).toBe("hop");
  });

  test("symlink escape and path escape are refused; a down server fails closed", async () => {
    const w = world({ worldId: "esc" });
    const root = await tmp(); const outside = await tmp();
    await writeFile(join(outside, "secret"), "s");
    await symlink(outside, join(root, "link"));
    await expect(w.fileSystem.readText(w.fileSystem.resolve(root, "link/secret"))).rejects.toThrow(PathEscapeError);
    expect(() => w.fileSystem.resolve(root, "../x")).toThrow(PathEscapeError);
    const dead = sshExecutionWorld({ ...baseOpts({ worldId: "dead" }), port: 1 });
    await expect(dead.process.exec({ argv: ["true"], cwd: "/tmp" })).rejects.toThrow(WorldUnavailableError);
  });

  executionWorldConformance("live OpenSSH sshd", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-live-conf-"));
    await mkdir(join(root, "nested"), { recursive: true });
    return {
      provider: sshExecutionWorld(baseOpts({ worldId: "conf" })), root,
      commands: {
        echo: (m) => ({ argv: ["printf", "%s", m], cwd: root }),
        fail: (m, code) => ({ argv: ["sh", "-c", `printf %s ${JSON.stringify(m)} 1>&2; exit ${code}`], cwd: root }),
        slow: () => ({ argv: ["sleep", "30"], cwd: root }),
      },
      cleanup: () => rm(root, { recursive: true, force: true }),
    };
  });
});

// ---- the user's own host (optional) --------------------------------------------------------------
const ownHost = process.env.COGNATE_SSH_HOST;
describe.skipIf(!ownHost)("live: your SSH host (COGNATE_SSH_HOST)", () => {
  const opts = (): SshWorldOptions => ({
    worldId: "own", host: ownHost!, port: Number(process.env.COGNATE_SSH_PORT ?? 22), username: process.env.COGNATE_SSH_USER ?? process.env.USER ?? "root",
    auth: process.env.COGNATE_SSH_KEY ? { kind: "key", privateKeyPath: process.env.COGNATE_SSH_KEY } : { kind: "agent" },
    hostKeys: { knownHostsPath: process.env.COGNATE_SSH_KNOWN_HOSTS ?? join(homedir(), ".ssh", "known_hosts") },
  });
  executionWorldConformance(`your host ${ownHost}`, async () => {
    const root = process.env.COGNATE_SSH_ROOT ?? `/tmp/cognate-live-${Date.now()}`;
    const provider = sshExecutionWorld(opts());
    await provider.process.exec({ argv: ["mkdir", "-p", join(root, "nested")], cwd: "/" });
    return {
      provider, root,
      commands: {
        echo: (m) => ({ argv: ["printf", "%s", m], cwd: root }),
        fail: (m, code) => ({ argv: ["sh", "-c", `printf %s ${JSON.stringify(m)} 1>&2; exit ${code}`], cwd: root }),
        slow: () => ({ argv: ["sleep", "30"], cwd: root }),
      },
      cleanup: async () => { await sshExecutionWorld(opts()).process.exec({ argv: ["rm", "-rf", root], cwd: "/" }).catch(() => {}); },
    };
  });
});

// ---- real WSL ------------------------------------------------------------------------------------
const wslDistro = process.env.COGNATE_WSL_DISTRO ?? "Ubuntu-24.04";
describe("live: WSL distribution", () => {
  const wslBin = "wsl.exe";
  test("wsl.exe and the distribution are present (this gate fails, not skips, without them)", async () => {
    const out = (await Bun.$`${wslBin} -l -q`.nothrow().text()).replace(/\0/g, "");
    expect(out).toContain(wslDistro);
  });
  executionWorldConformance(`live WSL (${wslDistro})`, async () => {
    const provider = wslExecutionWorld({ worldId: "live-wsl", distro: wslDistro });
    const root = `/tmp/cognate-live-wsl-${Date.now()}`;
    await provider.process.exec({ argv: ["mkdir", "-p", `${root}/nested`], cwd: "/tmp" });
    return {
      provider, root,
      commands: {
        echo: (m) => ({ argv: ["printf", "%s", m], cwd: root }),
        fail: (m, code) => ({ argv: ["sh", "-c", `printf %s ${JSON.stringify(m)} 1>&2; exit ${code}`], cwd: root }),
        slow: () => ({ argv: ["sleep", "30"], cwd: root }),
      },
      cleanup: async () => { await wslExecutionWorld({ worldId: "c", distro: wslDistro }).process.exec({ argv: ["rm", "-rf", root], cwd: "/tmp" }).catch(() => {}); },
    };
  });
  test("a timeout ends the command inside the distribution", async () => {
    const p = wslExecutionWorld({ worldId: "live-wsl-kill", distro: wslDistro });
    const r = await p.process.exec({ argv: ["sleep", "4714.4"], cwd: "/tmp", timeoutMs: 1500 });
    expect(r.timedOut).toBe(true);
    await Bun.sleep(1500);
    const left = await wslExecutionWorld({ worldId: "chk", distro: wslDistro }).process.exec({ argv: ["sh", "-c", "pgrep -x sleep -a | grep -c ' 4714.4$' || true"], cwd: "/tmp" });
    expect(left.stdout.trim()).toBe("0");
  });
  test("a path with spaces/quotes/newlines and non-ASCII content round-trips in the distribution", async () => {
    const p = wslExecutionWorld({ worldId: "live-wsl-io", distro: wslDistro });
    const root = `/tmp/cognate-live-wsl-io-${Date.now()}`;
    await p.process.exec({ argv: ["mkdir", "-p", root], cwd: "/tmp" });
    try {
      const f = p.fileSystem.resolve(root, "we ird 'name'.txt");
      await p.fileSystem.writeText(f, "héllo ✓\n\"q\"\n$(no)");
      expect(await p.fileSystem.readText(f)).toBe("héllo ✓\n\"q\"\n$(no)");
    } finally { await p.process.exec({ argv: ["rm", "-rf", root], cwd: "/tmp" }); }
  });
});
