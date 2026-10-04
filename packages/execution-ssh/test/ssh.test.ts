import { mkdir, mkdtemp, rm, symlink, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHmac, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { utils } from "ssh2";
import { PathEscapeError, WorldUnavailableError } from "@cognate/execution";
import { executionWorldConformance } from "@cognate/execution/conformance";
import { HostKeyMismatchError, checkKnownHosts, fingerprintOf, sshExecutionWorld } from "../src/index.ts";
import type { SshWorldOptions } from "../src/index.ts";
import { startSshFixture } from "../src/fixture.ts";
import type { SshFixture } from "../src/fixture.ts";

const PASSWORD = "correct horse battery staple";
const base = (f: SshFixture, extra: Partial<SshWorldOptions> = {}): SshWorldOptions => ({
  worldId: "ssh-test", host: "127.0.0.1", port: f.port, username: "dev", auth: { kind: "password", password: PASSWORD }, hostKeys: { fingerprints: [f.fingerprint] }, readyTimeoutMs: 5000, ...extra,
});

executionWorldConformance("ssh (ssh2 fixture server)", async () => {
  const fixture = await startSshFixture({ users: { dev: { password: PASSWORD } } });
  const root = await mkdtemp(join(tmpdir(), "cognate-ssh-"));
  await mkdir(join(root, "nested"), { recursive: true });
  return {
    provider: sshExecutionWorld(base(fixture)),
    root,
    commands: {
      echo: (m) => ({ argv: ["printf", "%s", m], cwd: root }),
      fail: (m, code) => ({ argv: ["sh", "-c", `printf %s ${JSON.stringify(m)} 1>&2; exit ${code}`], cwd: root }),
      slow: () => ({ argv: ["sleep", "30"], cwd: root }),
    },
    cleanup: async () => { await fixture.close(); await rm(root, { recursive: true, force: true }); },
  };
});

describe("ssh provider specifics", () => {
  const open: { dispose(): Promise<void> }[] = [];
  const fixtures: SshFixture[] = [];
  const dirs: string[] = [];
  const fx = async (o: Parameters<typeof startSshFixture>[0] = { users: { dev: { password: PASSWORD } } }) => { const f = await startSshFixture(o); fixtures.push(f); return f; };
  const dir = async () => { const d = await mkdtemp(join(tmpdir(), "cognate-ssh-")); dirs.push(d); return d; };
  const world = (o: SshWorldOptions) => { const w = sshExecutionWorld(o); open.push(w); return w; };
  afterEach(async () => {
    for (const w of open.splice(0)) await w.dispose();
    for (const f of fixtures.splice(0)) await f.close();
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });

  test("a host-key policy is mandatory; an empty one is refused at construction", () => {
    expect(() => sshExecutionWorld({ worldId: "w", host: "h", username: "u", auth: { kind: "password", password: "p" }, hostKeys: {} })).toThrow(/host-key policy/);
  });

  test("a changed/unknown host key is refused (never retried) and the error carries no secrets", async () => {
    const real = await fx();
    const imposter = await fx();
    const w = world(base(real, { hostKeys: { fingerprints: [imposter.fingerprint] } }));
    const err = await w.process.exec({ argv: ["true"], cwd: "/tmp" }).catch((e) => e);
    expect(err).toBeInstanceOf(HostKeyMismatchError);
    expect(err).toBeInstanceOf(WorldUnavailableError);
    expect(String(err.message)).not.toContain(PASSWORD);
    expect(String(err.message)).toContain(real.fingerprint);
    expect(real.stats.execs).toBe(0); // authentication never happened, so no command ran
  });

  test("known_hosts: plain [host]:port, hashed, and revoked entries", async () => {
    const f = await fx();
    const key = f.hostKeyBlob;
    const plain = f.knownHostsLine();
    expect(checkKnownHosts(plain, "127.0.0.1", f.port, key)).toBe("trusted");
    expect(checkKnownHosts(plain, "127.0.0.1", f.port + 1, key)).toBe("unknown");
    const salt = randomBytes(20);
    const hashed = `|1|${salt.toString("base64")}|${createHmac("sha1", salt).update(`[127.0.0.1]:${f.port}`).digest("base64")} ssh-ed25519 ${key.toString("base64")}`;
    expect(checkKnownHosts(hashed, "127.0.0.1", f.port, key)).toBe("trusted");
    expect(checkKnownHosts(`@revoked ${plain.replace(/^\S+/, "*")}\n${plain}`, "127.0.0.1", f.port, key)).toBe("revoked");
    const w = world(base(f, { hostKeys: { knownHosts: hashed } }));
    expect((await w.process.exec({ argv: ["printf", "ok"], cwd: "/tmp" })).stdout).toBe("ok");
    const wRevoked = world(base(f, { worldId: "r", hostKeys: { knownHosts: `@revoked ${plain}`, fingerprints: [f.fingerprint] } }));
    await expect(wRevoked.process.exec({ argv: ["true"], cwd: "/tmp" })).rejects.toThrow(HostKeyMismatchError);
  });

  test("public-key auth works; a wrong password fails closed without leaking it", async () => {
    const kp = utils.generateKeyPairSync("ed25519");
    const f = await fx({ users: { dev: { password: PASSWORD, publicKeys: [kp.public] } } });
    const keyed = world(base(f, { auth: { kind: "key", privateKey: kp.private } }));
    expect((await keyed.process.exec({ argv: ["printf", "k"], cwd: "/tmp" })).stdout).toBe("k");
    const bad = world(base(f, { worldId: "bad", auth: { kind: "password", password: "nope-secret-xyz" } }));
    const err = await bad.process.exec({ argv: ["true"], cwd: "/tmp" }).catch((e) => e);
    expect(err).toBeInstanceOf(WorldUnavailableError);
    expect(String(err.message)).not.toContain("nope-secret-xyz");
  });

  test("metadata is safe for durable state: no credentials, includes the verified host key", async () => {
    const f = await fx();
    const w = world(base(f));
    expect(w.kind).toBe("ssh");
    expect(w.metadata).toEqual({ host: "127.0.0.1", port: String(f.port), username: "dev", auth: "password" });
    await w.process.exec({ argv: ["true"], cwd: "/tmp" });
    expect(w.metadata.hostKey).toBe(f.fingerprint);
    expect(JSON.stringify(w.metadata)).not.toContain(PASSWORD);
  });

  test("an unreachable host fails closed and never executes locally", async () => {
    const f = await fx();
    const marker = join(await dir(), "ran-locally");
    const w = world(base(f));
    await f.close();
    await expect(w.process.exec({ argv: ["touch", marker], cwd: "/tmp" })).rejects.toThrow(WorldUnavailableError);
    expect(existsSync(marker)).toBe(false);
  });

  test("a dropped connection is re-established on the next operation (idempotent reads retry once)", async () => {
    const f = await fx();
    const root = await dir();
    await writeFile(join(root, "a.txt"), "hello");
    const w = world(base(f));
    const path = w.fileSystem.resolve(root, "a.txt");
    expect(await w.fileSystem.readText(path)).toBe("hello");
    const before = f.stats.connections;
    f.dropConnections();
    await Bun.sleep(100);
    expect(await w.fileSystem.readText(path)).toBe("hello");
    expect((await w.process.exec({ argv: ["printf", "again"], cwd: root })).stdout).toBe("again");
    expect(f.stats.connections).toBeGreaterThan(before);
  });

  test("a symlink inside the root pointing outside is refused for read, write and stat", async () => {
    const f = await fx();
    const root = await dir(); const outside = await dir();
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(outside, join(root, "link"));
    const w = world(base(f));
    const escape = w.fileSystem.resolve(root, "link/secret.txt");
    await expect(w.fileSystem.readText(escape)).rejects.toThrow(PathEscapeError);
    await expect(w.fileSystem.stat(escape)).rejects.toThrow(PathEscapeError);
    await expect(w.fileSystem.writeText(w.fileSystem.resolve(root, "link/new.txt"), "x")).rejects.toThrow(PathEscapeError);
    expect(existsSync(join(outside, "new.txt"))).toBe(false);
    expect(() => w.fileSystem.resolve(root, "../x")).toThrow(PathEscapeError);
    expect(() => w.fileSystem.resolve("relative", "x")).toThrow(PathEscapeError);
  });

  test("dispose closes the connection, SFTP and live channels; later use fails closed", async () => {
    const f = await fx();
    const root = await dir();
    const w = world(base(f));
    await w.fileSystem.writeText(w.fileSystem.resolve(root, "x"), "1");
    const slow = w.process.exec({ argv: ["sleep", "30"], cwd: root, timeoutMs: 20_000 });
    await Bun.sleep(200);
    expect(f.stats.open).toBe(1);
    expect(f.stats.liveExecs).toBe(1);
    await w.dispose();
    await slow; // resolves (channel closed), never hangs
    await Bun.sleep(150);
    expect(f.stats.open).toBe(0);
    expect(f.stats.liveExecs).toBe(0); // the remote process was ended, not leaked
    await expect(w.process.exec({ argv: ["true"], cwd: root })).rejects.toThrow(WorldUnavailableError);
    await expect(w.fileSystem.readText(join(root, "x"))).rejects.toThrow(WorldUnavailableError);
    await w.dispose();
  });

  test("a timeout ends the remote command even when the server ignores signal requests", async () => {
    const f = await fx({ users: { dev: { password: PASSWORD } }, ignoreSignals: true });
    const w = world(base(f));
    const r = await w.process.exec({ argv: ["sleep", "30"], cwd: "/tmp", timeoutMs: 300 });
    expect(r.timedOut).toBe(true);
    await Bun.sleep(150);
    expect(f.stats.liveExecs).toBe(0);
  });

  test("a timeout ends the command's whole process tree, not just its leader", async () => {
    const f = await fx({ users: { dev: { password: PASSWORD } }, ignoreSignals: true });
    const w = world(base(f));
    const r = await w.process.exec({ argv: ["bash", "-lc", "sleep 4801.7 & sleep 4801.7; wait"], cwd: "/tmp", timeoutMs: 500 });
    expect(r.timedOut).toBe(true);
    await Bun.sleep(1800);
    const left = (await Bun.$`pgrep -x sleep -a`.nothrow().text()).split("\n").filter((l) => l.endsWith(" 4801.7")).length;
    expect(left).toBe(0);
  });

  test("ProxyJump: the target is reached only through the jump host, and both hosts are verified", async () => {
    const jump = await fx();
    const target = await fx();
    const w = world({ ...base(target), jump: [{ host: "127.0.0.1", port: jump.port, username: "dev", auth: { kind: "password", password: PASSWORD }, hostKeys: { fingerprints: [jump.fingerprint] } }] });
    expect((await w.process.exec({ argv: ["printf", "via-jump"], cwd: "/tmp" })).stdout).toBe("via-jump");
    expect(jump.stats.connections).toBe(1);
    expect(target.stats.execs).toBe(1);
    const wrong = world({ ...base(target, { worldId: "j2" }), jump: [{ host: "127.0.0.1", port: jump.port, username: "dev", auth: { kind: "password", password: PASSWORD }, hostKeys: { fingerprints: [target.fingerprint] } }] });
    await expect(wrong.process.exec({ argv: ["true"], cwd: "/tmp" })).rejects.toThrow(HostKeyMismatchError);
  });

  test("large content and awkward names round-trip over SFTP; output is capped", async () => {
    const f = await fx();
    const root = await dir();
    const w = world(base(f, { maxOutputBytes: 1000 }));
    const path = w.fileSystem.resolve(root, "we ird 'name'.txt");
    const body = `é\n"q"\n${"y".repeat(500_000)}`;
    await w.fileSystem.writeText(path, body);
    expect(await w.fileSystem.readText(path)).toBe(body);
    expect(await readFile(join(root, "we ird 'name'.txt"), "utf8")).toBe(body);
    const noisy = await w.process.exec({ argv: ["sh", "-c", "head -c 5000 /dev/zero | tr '\\0' z"], cwd: root });
    expect(noisy.stdout.length).toBe(1000);
  });

  test("fingerprintOf matches the OpenSSH SHA256 format", async () => {
    const f = await fx();
    expect(f.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    expect(fingerprintOf(f.hostKeyBlob)).toBe(f.fingerprint);
  });
});

import { probeHostKey } from "../src/index.ts";
describe("probeHostKey", () => {
  test("reports the fingerprint without authenticating or running anything", async () => {
    const f = await startSshFixture({ users: { dev: { password: PASSWORD } } });
    try {
      const probe = await probeHostKey({ host: "127.0.0.1", port: f.port, knownHosts: f.knownHostsLine() });
      expect(probe).toEqual({ fingerprint: f.fingerprint, keyType: "ssh-ed25519", known: "trusted" });
      expect((await probeHostKey({ host: "127.0.0.1", port: f.port, knownHosts: "" })).known).toBe("unknown");
      expect(f.stats.execs).toBe(0);
    } finally { await f.close(); }
    await expect(probeHostKey({ host: "127.0.0.1", port: 1, timeoutMs: 500 })).rejects.toThrow(/cannot reach/);
  });
});
