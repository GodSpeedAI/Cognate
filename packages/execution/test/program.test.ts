import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allowCapabilities, isUnavailable } from "@godspeedai/cognate-kernel-api";
import type { InvocationContext } from "@godspeedai/cognate-kernel-api";
import { createCordisKernel } from "@godspeedai/cognate-kernel-cordis";
import { PROGRAM_CAPABILITY, createExecutionWorldRegistry, localExecutionWorld, programExecutorComponent, sha256Hex } from "../src/index.ts";

const ctx: InvocationContext = { actor: { id: "test", kind: "user" }, correlationId: "program-test", tenant: "test" };

const PATCH = [
  "--- a/src/a.txt",
  "+++ b/src/a.txt",
  "@@ -1,3 +1,3 @@",
  " one",
  "-two",
  "+TWO",
  " three",
  "",
].join("\n");
// A second file whose hunk cannot apply: the first file must stay untouched too (no partial application).
const BAD_SECOND = PATCH + ["--- a/src/b.txt", "+++ b/src/b.txt", "@@ -1,1 +1,1 @@", "-nope", "+never", ""].join("\n");

let root: string;
const read = (p: string) => readFile(join(root, p), "utf8");

beforeEach(async () => {
  root = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), "cognate-program-"));
  await Bun.write(join(root, "src/a.txt"), "one\ntwo\nthree\n");
  await Bun.write(join(root, "src/b.txt"), "real\n");
});
afterEach(() => rm(root, { recursive: true, force: true }));

async function kernel(allow: readonly string[] = [PROGRAM_CAPABILITY], world = localExecutionWorld({ worldId: "w" })) {
  const registry = createExecutionWorldRegistry([world]);
  const k = await createCordisKernel({ tenant: "test", principal: { id: "system", kind: "system" }, policy: allowCapabilities("program-test", allow) });
  await (await k.mount(programExecutorComponent(registry))).waitFor("ACTIVE", 5_000);
  return k;
}
async function run(k: Awaited<ReturnType<typeof kernel>>, input: Record<string, unknown>) {
  const lease = k.resolve({ capability: PROGRAM_CAPABILITY });
  if (isUnavailable(lease)) return { ok: false as const, failure: { kind: "unavailable" } };
  return lease.invoke(input, ctx) as Promise<{ ok: boolean; value?: any; failure?: { kind: string; error?: any } }>;
}
const base = () => ({ worldId: "w", workspace: root, patch: PATCH, patchSha256: sha256Hex(PATCH), argv: ["cat", "src/a.txt"] });

describe("program.run", () => {
  test("happy path: applies the pinned patch, runs the argv, reports hash, command, exit code and output digest", async () => {
    const r = await run(await kernel(), base());
    expect(r.ok).toBe(true);
    expect(r.value.patchSha256).toBe(sha256Hex(PATCH));
    expect(r.value.command).toEqual(["cat", "src/a.txt"]);
    expect(r.value.exitCode).toBe(0);
    expect(r.value.stdout).toBe("one\nTWO\nthree\n");
    expect(r.value.outputDigest).toBe(sha256Hex(Buffer.concat([Buffer.from("one\nTWO\nthree\n"), Buffer.from([0]), Buffer.from("")])));
    expect(await read("src/a.txt")).toBe("one\nTWO\nthree\n");
  });

  test("a patch whose sha256 does not match the pin is refused and nothing runs", async () => {
    const r = await run(await kernel(), { ...base(), patchSha256: sha256Hex("something else"), argv: ["touch", "ran.marker"] });
    expect(r.ok).toBe(false);
    expect(r.failure?.error?.reason).toBe("patch_hash_mismatch");
    expect(await read("src/a.txt")).toBe("one\ntwo\nthree\n");
    expect(await Bun.file(join(root, "ran.marker")).exists()).toBe(false);
  });

  test("a tampered patch (right pin for the original) is refused", async () => {
    const r = await run(await kernel(), { ...base(), patch: PATCH.replace("+TWO", "+EVIL") });
    expect(r.failure?.error?.reason).toBe("patch_hash_mismatch");
    expect(await read("src/a.txt")).toBe("one\ntwo\nthree\n");
  });

  test("a patch that does not apply cleanly is refused and the tree is untouched, including earlier files in the patch", async () => {
    const patch = BAD_SECOND;
    const r = await run(await kernel(), { ...base(), patch, patchSha256: sha256Hex(patch), argv: ["touch", "ran.marker"] });
    expect(r.ok).toBe(false);
    expect(r.failure?.error?.reason).toBe("patch_not_applicable");
    expect(await read("src/a.txt")).toBe("one\ntwo\nthree\n");
    expect(await read("src/b.txt")).toBe("real\n");
    expect(await Bun.file(join(root, "ran.marker")).exists()).toBe(false);
  });

  test("a command that exits non-zero is recorded with its exit code and digest, not swallowed", async () => {
    const r = await run(await kernel(), { ...base(), argv: ["bash", "-c", "echo boom 1>&2; exit 3"] });
    expect(r.ok).toBe(false);
    expect(r.failure?.error?.name).toBe("ProgramCommandFailedError");
    expect(r.failure?.error).toMatchObject({ exitCode: 3, patchSha256: sha256Hex(PATCH), command: JSON.stringify(["bash", "-c", "echo boom 1>&2; exit 3"]), patchApplied: true });
    expect(r.failure?.error?.outputDigest).toBe(sha256Hex(Buffer.concat([Buffer.from(""), Buffer.from([0]), Buffer.from("boom\n")])));
  });

  test("the command is argv, not a shell string: metacharacters are literal arguments", async () => {
    const r = await run(await kernel(), { ...base(), argv: ["echo", "$(touch pwned); `touch pwned2`"] });
    expect(r.value.stdout).toBe("$(touch pwned); `touch pwned2`\n");
    expect(await Bun.file(join(root, "pwned")).exists()).toBe(false);
  });

  test("paths are confined to the workspace: patch targets and cwd that escape are refused", async () => {
    const esc = ["--- a/../outside.txt", "+++ b/../outside.txt", "@@ -1,1 +1,1 @@", "-x", "+y", ""].join("\n");
    await writeFile(join(root, "..", "outside.txt"), "x\n");
    const a = await run(await kernel(), { ...base(), patch: esc, patchSha256: sha256Hex(esc) });
    expect(a.failure?.error?.reason).toBe("path_escape");
    expect(await readFile(join(root, "..", "outside.txt"), "utf8")).toBe("x\n");
    await rm(join(root, "..", "outside.txt"));
    const b = await run(await kernel(), { ...base(), cwd: ".." });
    expect(b.failure?.error?.reason).toBe("path_escape");
    const c = await run(await kernel(), { ...base(), cwd: "/etc" });
    expect(c.failure?.error?.reason).toBe("path_escape");
  });

  test("argv must be a non-empty array of strings", async () => {
    for (const argv of [[], "ls", [""], [1], ["a\0b"]]) {
      const r = await run(await kernel(), { ...base(), argv });
      expect(r.failure?.error?.reason).toBe("argv_invalid");
    }
    expect(await read("src/a.txt")).toBe("one\ntwo\nthree\n");
  });

  test("create, delete, rename and binary patches are refused", async () => {
    for (const patch of ["--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,1 @@\n+x\n", "--- a/src/a.txt\n+++ /dev/null\n@@ -1,3 +0,0 @@\n-one\n-two\n-three\n", "--- a/src/a.txt\n+++ b/src/z.txt\n@@ -1,1 +1,1 @@\n-one\n+x\n", "Binary files a/x and b/x differ\n"]) {
      const r = await run(await kernel(), { ...base(), patch, patchSha256: sha256Hex(patch) });
      expect(r.failure?.error?.reason).toBe("patch_unsupported");
    }
  });

  test("it goes through capability policy: without the capability allowed, nothing is applied", async () => {
    const r = await run(await kernel(["something.else"]), { ...base(), argv: ["touch", "ran.marker"] });
    expect(r.ok).toBe(false);
    expect(r.failure?.kind).toBe("denied");
    expect(await read("src/a.txt")).toBe("one\ntwo\nthree\n");
    expect(await Bun.file(join(root, "ran.marker")).exists()).toBe(false);
  });

  test("end-of-file newline handling round-trips", async () => {
    await Bun.write(join(root, "src/n.txt"), "a\nb");
    const patch = ["--- a/src/n.txt", "+++ b/src/n.txt", "@@ -1,2 +1,2 @@", " a", "-b", "\\ No newline at end of file", "+c", "\\ No newline at end of file", ""].join("\n");
    const r = await run(await kernel(), { ...base(), patch, patchSha256: sha256Hex(patch), argv: ["true"] });
    expect(r.ok).toBe(true);
    expect(await read("src/n.txt")).toBe("a\nc");
  });
  describe("symlinks", () => {
    let outside: string;
    beforeEach(async () => {
      outside = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), "cognate-program-out-"));
      await writeFile(join(outside, "secret.txt"), "one\ntwo\nthree\n");
    });
    afterEach(() => rm(outside, { recursive: true, force: true }));
    const untouched = async () => expect(await readFile(join(outside, "secret.txt"), "utf8")).toBe("one\ntwo\nthree\n");
    const patchFor = (path: string) => ["--- a/" + path, "+++ b/" + path, "@@ -1,3 +1,3 @@", " one", "-two", "+TWO", " three", ""].join("\n");
    const runPatch = (path: string, extra: Record<string, unknown> = {}) => {
      const patch = patchFor(path);
      return kernel().then((k) => run(k, { ...base(), patch, patchSha256: sha256Hex(patch), argv: ["touch", "ran.marker"], ...extra }));
    };

    test("a target that is a symlink to a file outside the workspace is refused and the outside file is untouched", async () => {
      await symlink(join(outside, "secret.txt"), join(root, "src/link.txt"));
      const r = await runPatch("src/link.txt");
      expect(r.failure?.error?.reason).toBe("path_escape");
      await untouched();
      expect(await Bun.file(join(root, "ran.marker")).exists()).toBe(false);
    });

    test("a symlinked directory component pointing outside is refused", async () => {
      await symlink(outside, join(root, "linkdir"));
      const r = await runPatch("linkdir/secret.txt");
      expect(r.failure?.error?.reason).toBe("path_escape");
      await untouched();
    });

    test("a symlinked cwd (outside the workspace) is refused and nothing is written", async () => {
      await symlink(outside, join(root, "cwdlink"));
      const r = await run(await kernel(), { ...base(), cwd: "cwdlink", argv: ["touch", "ran.marker"] });
      expect(r.failure?.error?.reason).toBe("path_escape");
      expect(await read("src/a.txt")).toBe("one\ntwo\nthree\n");
      expect(await Bun.file(join(outside, "ran.marker")).exists()).toBe(false);
    });

    test("a symlink that stays inside the workspace is also refused (documented rule: no symlink along any path)", async () => {
      await symlink(join(root, "src/a.txt"), join(root, "src/alias.txt"));
      const r = await runPatch("src/alias.txt");
      expect(r.failure?.error?.reason).toBe("path_escape");
      await mkdir(join(root, "real"));
      await symlink(join(root, "src"), join(root, "innerdir"));
      const r2 = await runPatch("innerdir/a.txt");
      expect(r2.failure?.error?.reason).toBe("path_escape");
      expect(await read("src/a.txt")).toBe("one\ntwo\nthree\n");
    });

    // A world whose file system counts writes and lets a test swap paths at chosen moments (the race the re-checks exist for).
    const hooked = (hooks: { afterRead?: (path: string) => Promise<void>; afterWrite?: (path: string) => Promise<void> }) => {
      const w = localExecutionWorld({ worldId: "w" });
      const writes: string[] = [];
      return {
        writes,
        world: {
          ...w,
          fileSystem: {
            ...w.fileSystem,
            async readText(path: string) {
              const t = await w.fileSystem.readText(path);
              await hooks.afterRead?.(path);
              return t;
            },
            async writeText(path: string, content: string) {
              writes.push(path);
              await w.fileSystem.writeText(path, content);
              await hooks.afterWrite?.(path);
            },
          },
        },
      };
    };

    test("the plan-time check refuses before any write (a good first file is not even written when a later target is a symlink)", async () => {
      await symlink(join(outside, "secret.txt"), join(root, "src/link.txt"));
      const patch = PATCH + patchFor("src/link.txt");
      const h = hooked({});
      const r = await run(await kernel([PROGRAM_CAPABILITY], h.world), { ...base(), patch, patchSha256: sha256Hex(patch), argv: ["true"] });
      expect(r.failure?.error?.reason).toBe("path_escape");
      expect(h.writes).toEqual([]);
      await untouched();
    });

    test("a symlinked cwd is refused before any write", async () => {
      await symlink(outside, join(root, "cwdlink"));
      const h = hooked({});
      const r = await run(await kernel([PROGRAM_CAPABILITY], h.world), { ...base(), cwd: "cwdlink", argv: ["true"] });
      expect(r.failure?.error?.reason).toBe("path_escape");
      expect(h.writes).toEqual([]);
    });

    test("a target swapped for a symlink after planning is caught immediately before the write; the outside file is untouched", async () => {
      const h = hooked({
        afterRead: async (path) => {
          if (!path.endsWith("src/a.txt")) return;
          await rm(path);
          await symlink(join(outside, "secret.txt"), path);
        },
      });
      const r = await run(await kernel([PROGRAM_CAPABILITY], h.world), { ...base(), argv: ["touch", "ran.marker"] });
      expect(r.failure?.error?.reason).toBe("path_escape");
      expect(h.writes).toEqual([]);
      await untouched();
      expect(await Bun.file(join(root, "ran.marker")).exists()).toBe(false);
    });

    test("a cwd swapped for a symlink after the writes is caught before the command runs and the patch is rolled back", async () => {
      await mkdir(join(root, "work"));
      const h = hooked({
        afterWrite: async (path) => {
          if (!path.endsWith("src/a.txt")) return;
          await rm(join(root, "work"), { recursive: true });
          await symlink(outside, join(root, "work"));
        },
      });
      const r = await run(await kernel([PROGRAM_CAPABILITY], h.world), { ...base(), cwd: "work", argv: ["touch", "ran.marker"] });
      expect(r.failure?.error?.reason).toBe("path_escape");
      expect(await Bun.file(join(outside, "ran.marker")).exists()).toBe(false);
      expect(await read("src/a.txt")).toBe("one\ntwo\nthree\n");
    });

    test("a workspace root that is itself reached through a symlink still works", async () => {
      const via = join(outside, "ws-link");
      await symlink(root, via);
      const r = await run(await kernel(), { ...base(), workspace: via });
      expect(r.ok).toBe(true);
      expect(await read("src/a.txt")).toBe("one\nTWO\nthree\n");
    });
  });

  describe("write-failure rollback", () => {
    const twoFiles = ["--- a/src/a.txt", "+++ b/src/a.txt", "@@ -1,3 +1,3 @@", " one", "-two", "+TWO", " three", "--- a/src/b.txt", "+++ b/src/b.txt", "@@ -1,1 +1,1 @@", "-real", "+changed", ""].join("\n");
    const failing = (failOn: string, restoreFails = false) => {
      const w = localExecutionWorld({ worldId: "w" });
      let hits = 0;
      return {
        ...w,
        fileSystem: {
          ...w.fileSystem,
          async writeText(path: string, content: string) {
            if (path.endsWith(failOn)) {
              hits += 1;
              if (hits === 1 || restoreFails) {
                await w.fileSystem.writeText(path, "PARTIAL"); // a torn write, then the fault
                throw new Error("disk full");
              }
            }
            return w.fileSystem.writeText(path, content);
          },
        },
      };
    };

    test("a write that fails on the second file restores the first and the failed one (even if partly written)", async () => {
      const r = await run(await kernel([PROGRAM_CAPABILITY], failing("src/b.txt")), { ...base(), patch: twoFiles, patchSha256: sha256Hex(twoFiles), argv: ["touch", "ran.marker"] });
      expect(r.ok).toBe(false);
      expect(String(r.failure?.error?.message)).toContain("disk full");
      expect(await read("src/a.txt")).toBe("one\ntwo\nthree\n");
      expect(await read("src/b.txt")).toBe("real\n");
      expect(await Bun.file(join(root, "ran.marker")).exists()).toBe(false);
    });

    test("a restore that itself fails is reported, not swallowed", async () => {
      const r = await run(await kernel([PROGRAM_CAPABILITY], failing("src/b.txt", true)), { ...base(), patch: twoFiles, patchSha256: sha256Hex(twoFiles), argv: ["true"] });
      expect(r.ok).toBe(false);
      expect(String(r.failure?.error?.message)).toContain("could not restore: src/b.txt");
      expect(await read("src/a.txt")).toBe("one\ntwo\nthree\n");
    });
  });
});
