import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { PathEscapeError, WorldUnavailableError } from "@godspeedai/cognate-execution";
import { executionWorldConformance } from "@godspeedai/cognate-execution/conformance";
import { wslExecutionWorld } from "../src/index.ts";

// Hermetic: `sh -s` stands in for `wsl.exe -d <distro> -e sh -s` (both read the script on stdin),
// so this proves the provider's script construction, quoting, containment and lifecycle against a
// real POSIX shell. The live gate (scripts/remote-workspaces-live.ts) runs the same suite against
// a real distro.
const make = () => wslExecutionWorld({ worldId: "wsl-test", distro: "Test", shellCommand: ["sh", "-s"] });

executionWorldConformance("wsl (hermetic sh)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cognate-wsl-"));
  await mkdir(join(root, "nested"), { recursive: true });
  return {
    provider: make(),
    root,
    commands: {
      echo: (m) => ({ argv: ["printf", "%s", m], cwd: root }),
      fail: (m, code) => ({ argv: ["sh", "-c", `printf %s ${JSON.stringify(m)} 1>&2; exit ${code}`], cwd: root }),
      slow: () => ({ argv: ["sleep", "30"], cwd: root }),
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
});

describe("wsl provider specifics", () => {
  test("content with quotes, newlines, unicode and a large body round-trips byte for byte", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-wsl-"));
    const p = make();
    try {
      const path = p.fileSystem.resolve(root, "weird 'name' $x.txt");
      const body = `it's "quoted"\n$(echo no)\n\`tick\` ✓ ${"x".repeat(300_000)}`;
      await p.fileSystem.writeText(path, body);
      expect(await p.fileSystem.readText(path)).toBe(body);
    } finally { await p.dispose(); await rm(root, { recursive: true, force: true }); }
  });
  test("argv with spaces/quotes/newlines is passed intact; env and cwd apply", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-wsl-"));
    const p = make();
    try {
      const r = await p.process.exec({ argv: ["sh", "-c", 'printf "%s|%s|%s" "$0" "$FOO" "$(pwd)"', "a b'c\nd"], cwd: root, env: { FOO: "x y" } });
      expect(r.stdout).toBe(`a b'c\nd|x y|${root}`);
    } finally { await p.dispose(); await rm(root, { recursive: true, force: true }); }
  });
  test("a symlink inside the root that points outside is refused; names with newlines list correctly", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-wsl-"));
    const outside = await mkdtemp(join(tmpdir(), "cognate-wsl-out-"));
    const p = make();
    try {
      await Bun.write(join(outside, "secret.txt"), "secret");
      await Bun.spawn(["ln", "-s", outside, join(root, "link")]).exited;
      await Bun.write(join(root, "a\nb.txt"), "n");
      const escape = p.fileSystem.resolve(root, "link/secret.txt");
      await expect(p.fileSystem.readText(escape)).rejects.toThrow(PathEscapeError);
      await expect(p.fileSystem.writeText(p.fileSystem.resolve(root, "link/new.txt"), "x")).rejects.toThrow(PathEscapeError);
      expect((await p.fileSystem.list(root)).map((e) => e.name).sort()).toEqual(["a\nb.txt", "link"]);
    } finally { await p.dispose(); await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  });
  test("a relative or Windows-style root is rejected; disposal fails closed", async () => {
    const p = make();
    expect(() => p.fileSystem.resolve("relative/dir", "x")).toThrow(PathEscapeError);
    expect(() => p.fileSystem.resolve("C:\\Users\\x", "y")).toThrow(PathEscapeError);
    await p.dispose();
    await expect(p.process.exec({ argv: ["true"], cwd: "/" })).rejects.toThrow(WorldUnavailableError);
    await expect(p.fileSystem.readText("/etc/hostname")).rejects.toThrow(WorldUnavailableError);
    expect(p.metadata).toEqual({ distro: "Test" });
  });
  test("a missing wsl binary fails closed instead of running locally", async () => {
    const p = wslExecutionWorld({ worldId: "w", distro: "Nope", wslBin: "/nonexistent/wsl.exe" });
    await expect(p.process.exec({ argv: ["echo", "local"], cwd: "/tmp" })).rejects.toThrow(WorldUnavailableError);
  });
});

describe("wsl session pool", () => {
  test("a session that stalls at start-up is replaced once; then every operation reuses the pooled session (no further launches)", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-wsl-"));
    const marker = join(root, "launches");
    // The first launch stalls (like a wedged wsl.exe); later launches behave.
    const flaky = ["sh", "-c", `n=$(cat '${marker}' 2>/dev/null || echo 0); echo $((n+1)) > '${marker}'; if [ "$n" = 0 ]; then exec sleep 30; else exec sh -s; fi`];
    const p = wslExecutionWorld({ worldId: "flaky", distro: "T", shellCommand: flaky, fileOpTimeoutMs: 400, sessionStartTimeoutMs: 400 });
    try {
      await Bun.write(join(root, "f.txt"), "data");
      expect(await p.fileSystem.readText(p.fileSystem.resolve(root, "f.txt"))).toBe("data");
      for (let i = 0; i < 5; i++) await p.process.exec({ argv: ["true"], cwd: root });
      await p.fileSystem.stat(join(root, "f.txt"));
      expect((await Bun.file(marker).text()).trim()).toBe("2"); // one stalled launch + one good one; 10+ operations reused it
    } finally { await p.dispose(); await rm(root, { recursive: true, force: true }); }
  });

  test("an unreachable distribution fails closed for files and commands alike", async () => {
    const stuck = wslExecutionWorld({ worldId: "stuck", distro: "T", shellCommand: ["sleep", "30"], fileOpTimeoutMs: 300, sessionStartTimeoutMs: 300 });
    await expect(stuck.fileSystem.readText("/etc/hostname")).rejects.toThrow(WorldUnavailableError);
    await expect(stuck.process.exec({ argv: ["true"], cwd: "/" })).rejects.toThrow(WorldUnavailableError);
    await stuck.dispose();
  });

  test("a session that dies at start-up (service error) is replaced; a command that fails is returned as-is and never retried", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-wsl-"));
    const marker = join(root, "starts");
    const launcher = ["sh", "-c", `n=$(cat '${marker}' 2>/dev/null || echo 0); echo $((n+1)) > '${marker}'; if [ "$n" = 0 ]; then echo "Error code: Wsl/Service/WSAETIMEDOUT" >&2; exit 1; fi; exec sh -s`];
    const p = wslExecutionWorld({ worldId: "svc", distro: "T", shellCommand: launcher, sessionStartTimeoutMs: 2000 });
    try {
      expect(await p.process.exec({ argv: ["printf", "%s", "ran"], cwd: root })).toMatchObject({ stdout: "ran", exitCode: 0, timedOut: false });
      const f = await p.process.exec({ argv: ["sh", "-c", "echo bad >&2; exit 7"], cwd: root });
      expect(f).toMatchObject({ exitCode: 7, stderr: "bad\n" });
      expect((await Bun.file(marker).text()).trim()).toBe("2"); // failed launch + replacement; the failing command did not cause another
    } finally { await p.dispose(); await rm(root, { recursive: true, force: true }); }
  });

  test("a timed-out command's whole process tree is ended and the pool keeps working", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-wsl-"));
    const p = make();
    try {
      const r = await p.process.exec({ argv: ["sh", "-c", "sleep 4803.9 & sleep 4803.9; wait"], cwd: root, timeoutMs: 600 });
      expect(r.timedOut).toBe(true);
      await Bun.sleep(1500);
      const left = (await Bun.$`pgrep -x sleep -a`.nothrow().text()).split("\n").filter((l) => l.endsWith(" 4803.9")).length;
      expect(left).toBe(0);
      expect((await p.process.exec({ argv: ["printf", "%s", "after"], cwd: root })).stdout).toBe("after");
    } finally { await p.dispose(); await rm(root, { recursive: true, force: true }); }
  });

  test("concurrent commands run in parallel sessions; output is not mixed up", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-wsl-"));
    const p = make();
    try {
      const started = Date.now();
      const rs = await Promise.all([1, 2, 3, 4].map((n) => p.process.exec({ argv: ["sh", "-c", `sleep 0.5; printf %s ${n}`], cwd: root })));
      expect(rs.map((r) => r.stdout)).toEqual(["1", "2", "3", "4"]);
      expect(Date.now() - started).toBeLessThan(1900); // parallel, not 4 x 0.5s
    } finally { await p.dispose(); await rm(root, { recursive: true, force: true }); }
  });
});
