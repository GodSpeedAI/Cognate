import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

async function kernel(allow: readonly string[] = [PROGRAM_CAPABILITY]) {
  const registry = createExecutionWorldRegistry([localExecutionWorld({ worldId: "w" })]);
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
});
