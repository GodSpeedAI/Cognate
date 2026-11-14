// The `program` executor capability (FDE WP-15): apply a hash-pinned unified diff inside a declared workspace,
// then run one declared command, and report patch hash, command, exit code and output digest.
//
// It is an ordinary capability: it is published by a component and invoked through the kernel, so the caller's
// capability policy and the runtime's governance decide whether it runs at all. Nothing here authorizes itself.
//
// Safety rules, each with a refusal test:
//  - the patch must hash (sha256 of its UTF-8 bytes) to the pinned value, or nothing happens;
//  - the patch is applied in memory first and written only if every hunk of every file applies exactly
//    (no fuzz, no offset); a failed write restores the files already written, so there is no partial application;
//  - the command is an argv array handed to the world's process port: no shell, no interpolation, no env override;
//  - every path (patch targets, working directory) resolves under the declared workspace root, lexically and, on a
//    world that offers `realPath`, really: the real path must equal the real workspace root plus the same relative
//    path, so a symlink anywhere along a path is refused (one that points outside, and also one that stays inside:
//    refusing is the simple rule and removes aliasing). The check runs again immediately before each write and before
//    the command. Residual: a link swapped in between that last check and the write by a concurrent process on the
//    same host is not excluded (Node offers no portable no-follow write through this port).
// v1 patches modify existing text files only; create, delete, rename and binary patches are refused.
import { createHash } from "node:crypto";
import type { CapabilityContract, Component, SemanticRef } from "@godspeedai/cognate-kernel-api";
import type { ExecutionWorldRegistry } from "./registry.ts";

export const PROGRAM_CAPABILITY = "program.run";
export const PROGRAM_CAPABILITY_VERSION = "1.0.0";

export interface ProgramRunInput {
  readonly worldId: string;
  /** The declared workspace root; every path is confined to it. */
  readonly workspace: string;
  /** Unified diff text (`git diff` style, `a/` `b/` prefixes optional). */
  readonly patch: string;
  /** Lower-case hex sha256 of the patch's UTF-8 bytes. */
  readonly patchSha256: string;
  /** The command: argv[0] is the program. Never passed through a shell. */
  readonly argv: readonly string[];
  /** Working directory relative to the workspace (default: the workspace). */
  readonly cwd?: string;
  readonly timeoutMs?: number;
}

export interface ProgramRunResult {
  readonly patchSha256: string;
  readonly filesPatched: readonly string[];
  readonly command: readonly string[];
  readonly exitCode: number;
  readonly timedOut: boolean;
  /** sha256 over stdout bytes, one 0x00 byte, then stderr bytes. */
  readonly outputDigest: string;
  readonly stdout: string;
  readonly stderr: string;
}

export type ProgramRefusal = "patch_hash_mismatch" | "patch_malformed" | "patch_unsupported" | "patch_not_applicable" | "argv_invalid" | "path_escape";

/** Refused before the command ran and with the workspace untouched. */
export class ProgramRefusedError extends Error {
  override readonly name = "ProgramRefusedError";
  constructor(readonly reason: ProgramRefusal, detail: string) {
    super(`program.run refused (${reason}): ${detail}`);
  }
}

/** The patch applied and the command ran but exited non-zero (or timed out). The facts are on the error and survive into the invocation record. */
export class ProgramCommandFailedError extends Error {
  override readonly name = "ProgramCommandFailedError";
  readonly patchApplied = true;
  constructor(
    readonly exitCode: number,
    readonly timedOut: boolean,
    readonly patchSha256: string,
    /** The argv as JSON text (the invocation record keeps only primitive error fields). */
    readonly command: string,
    readonly outputDigest: string,
  ) {
    super(`program.run command exited ${exitCode}${timedOut ? " (timed out)" : ""}`);
  }
}

export const sha256Hex = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

// ── Unified diff ───────────────────────────────────────────────────────────────

interface Hunk {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly lines: readonly { readonly op: " " | "-" | "+"; readonly text: string }[];
  /** `\ No newline at end of file` markers: after an old-side line, after a new-side line. */
  readonly oldNoEol: boolean;
  readonly newNoEol: boolean;
}
interface FilePatch {
  readonly path: string;
  readonly hunks: readonly Hunk[];
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function targetPath(raw: string): string {
  const path = raw.split("\t")[0]!.trim();
  return path.startsWith("a/") || path.startsWith("b/") ? path.slice(2) : path;
}

export function parsePatch(patch: string): FilePatch[] {
  if (patch.includes("\r")) throw new ProgramRefusedError("patch_unsupported", "CR line endings are not supported");
  const lines = patch.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const files: { path: string; hunks: Hunk[] }[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^(new file mode|deleted file mode|rename |copy |old mode|new mode|Binary files|GIT binary patch)/.test(line)) {
      throw new ProgramRefusedError("patch_unsupported", `only in-place text edits are supported (${line.split(" ").slice(0, 2).join(" ")})`);
    }
    if (line.startsWith("--- ")) {
      const next = lines[i + 1];
      if (next === undefined || !next.startsWith("+++ ")) throw new ProgramRefusedError("patch_malformed", "--- without +++");
      const from = targetPath(line.slice(4));
      const to = targetPath(next.slice(4));
      if (from === "/dev/null" || to === "/dev/null") throw new ProgramRefusedError("patch_unsupported", "creating or deleting files is not supported");
      if (from !== to) throw new ProgramRefusedError("patch_unsupported", "renames are not supported");
      files.push({ path: to, hunks: [] });
      i += 2;
      continue;
    }
    const m = HUNK.exec(line);
    if (m) {
      const file = files.at(-1);
      if (!file) throw new ProgramRefusedError("patch_malformed", "hunk before any file header");
      const oldCount = m[2] === undefined ? 1 : Number(m[2]);
      const newCount = m[4] === undefined ? 1 : Number(m[4]);
      const body: { op: " " | "-" | "+"; text: string }[] = [];
      let oldNoEol = false;
      let newNoEol = false;
      let seenOld = 0;
      let seenNew = 0;
      i += 1;
      while (i < lines.length && (seenOld < oldCount || seenNew < newCount || lines[i]!.startsWith("\\"))) {
        const l = lines[i]!;
        const op = l[0];
        if (op === "\\") {
          const prev = body.at(-1);
          if (!prev) throw new ProgramRefusedError("patch_malformed", "stray no-newline marker");
          if (prev.op !== "+") oldNoEol = true;
          if (prev.op !== "-") newNoEol = true;
        } else if (op === " " || op === "-" || op === "+") {
          body.push({ op, text: l.slice(1) });
          if (op !== "+") seenOld += 1;
          if (op !== "-") seenNew += 1;
        } else if (l === "" && (seenOld < oldCount || seenNew < newCount)) {
          // An editor stripped the single space of an empty context line.
          body.push({ op: " ", text: "" });
          seenOld += 1;
          seenNew += 1;
        } else throw new ProgramRefusedError("patch_malformed", `unexpected line inside hunk: ${l.slice(0, 40)}`);
        i += 1;
      }
      if (seenOld !== oldCount || seenNew !== newCount) throw new ProgramRefusedError("patch_malformed", "hunk line counts do not match its header");
      file.hunks.push({ oldStart: Number(m[1]), oldCount, lines: body, oldNoEol, newNoEol });
      continue;
    }
    i += 1; // `diff --git`, `index`, blank and prose lines between files are ignored
  }
  if (files.length === 0 || files.some((f) => f.hunks.length === 0)) throw new ProgramRefusedError("patch_malformed", "the patch contains no hunks");
  return files;
}

/** Apply every hunk of one file exactly; throws `patch_not_applicable` on any mismatch. Pure. */
export function applyHunks(path: string, original: string, hunks: readonly Hunk[]): string {
  const trailing = original.endsWith("\n");
  const src = original.split("\n");
  if (trailing) src.pop();
  const out: string[] = [];
  let cursor = 0;
  let newTrailing = trailing;
  const refuse = (why: string): never => {
    throw new ProgramRefusedError("patch_not_applicable", `${path}: ${why}`);
  };
  for (const hunk of hunks) {
    const start = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
    if (start < cursor) refuse("hunks overlap or are out of order");
    if (start > src.length) refuse(`hunk at line ${hunk.oldStart} is past the end of the file`);
    out.push(...src.slice(cursor, start));
    let at = start;
    for (const { op, text } of hunk.lines) {
      if (op === "+") {
        out.push(text);
        continue;
      }
      if (src[at] !== text) refuse(`context mismatch at line ${at + 1}`);
      if (op === " ") out.push(text);
      at += 1;
    }
    cursor = at;
    if (hunk.oldNoEol && trailing) refuse("patch expects no newline at end of file");
    if (hunk.newNoEol) newTrailing = false;
    else if (at >= src.length) newTrailing = true;
  }
  out.push(...src.slice(cursor));
  return out.join("\n") + (newTrailing && out.length > 0 ? "\n" : "");
}

// ── Capability ─────────────────────────────────────────────────────────────────

const validArgv = (argv: unknown): argv is string[] => Array.isArray(argv) && argv.length > 0 && argv.every((a) => typeof a === "string" && !a.includes("\0")) && argv[0] !== "";

export interface ProgramExecutorOptions {
  readonly semanticRef?: SemanticRef;
}

export function programExecutorComponent(registry: ExecutionWorldRegistry, options: ProgramExecutorOptions = {}): Component {
  const contract: CapabilityContract = { id: PROGRAM_CAPABILITY, version: PROGRAM_CAPABILITY_VERSION, semanticRef: options.semanticRef };
  return {
    id: "execution:program",
    semanticRef: options.semanticRef,
    provides: [contract],
    activate(fiber) {
      fiber.provide(contract, async (raw, ctx): Promise<ProgramRunResult> => {
        const input = raw as ProgramRunInput;
        const world = registry.get(input.worldId);
        const fs = world.fileSystem;

        if (typeof input.patch !== "string" || typeof input.patchSha256 !== "string") throw new ProgramRefusedError("patch_malformed", "patch and patchSha256 are required");
        if (sha256Hex(input.patch) !== input.patchSha256.toLowerCase()) throw new ProgramRefusedError("patch_hash_mismatch", "the patch does not hash to the pinned sha256");
        if (!validArgv(input.argv)) throw new ProgramRefusedError("argv_invalid", "argv must be a non-empty array of strings");
        const resolveIn = (path: string): string => {
          if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) throw new ProgramRefusedError("path_escape", `absolute path: ${path}`);
          try {
            return fs.resolve(input.workspace, path);
          } catch (error) {
            if (error instanceof Error && error.name === "PathEscapeError") throw new ProgramRefusedError("path_escape", path);
            throw error;
          }
        };
        const cwd = resolveIn(input.cwd ?? ".");
        const rootAbs = fs.resolve(input.workspace, ".");
        /** Refuse unless the real path is the real root plus the same relative path (no symlink anywhere along it). */
        const assertReal = async (absolute: string, label: string, mustExist: boolean): Promise<void> => {
          if (!fs.realPath) return;
          const realRoot = await fs.realPath(rootAbs);
          const real = await fs.realPath(absolute);
          if (real === undefined) {
            if (mustExist || (await fs.exists(absolute))) throw new ProgramRefusedError("path_escape", `${label}: cannot resolve real path`);
            return;
          }
          if (realRoot === undefined) throw new ProgramRefusedError("path_escape", "workspace root cannot be resolved");
          const expected = absolute === rootAbs ? realRoot : realRoot.replace(/\/$/, "") + absolute.slice(rootAbs.length);
          if (real !== expected) throw new ProgramRefusedError("path_escape", `${label}: a symlink along the path is not allowed`);
        };
        await assertReal(cwd, "cwd", false);

        // Plan: read and apply everything in memory before touching the workspace.
        const planned: { readonly path: string; readonly absolute: string; readonly before: string; readonly after: string }[] = [];
        const seen = new Set<string>();
        for (const file of parsePatch(input.patch)) {
          if (seen.has(file.path)) throw new ProgramRefusedError("patch_malformed", `${file.path} appears twice`);
          seen.add(file.path);
          const absolute = resolveIn(file.path);
          await assertReal(absolute, file.path, false);
          if (!(await fs.exists(absolute))) throw new ProgramRefusedError("patch_not_applicable", `${file.path} does not exist`);
          const before = await fs.readText(absolute);
          planned.push({ path: file.path, absolute, before, after: applyHunks(file.path, before, file.hunks) });
        }

        // Commit: write all; on any failure put back every file touched (including the one whose write failed, which
        // may be partly written), then rethrow. Guarantee: if every restore write succeeds the tree equals its original;
        // a restore that itself fails is reported in the error, never swallowed. Each target is re-verified immediately
        // before its write.
        const touched: typeof planned[number][] = [];
        try {
          for (const file of planned) {
            await assertReal(file.absolute, file.path, true);
            touched.push(file);
            await fs.writeText(file.absolute, file.after);
          }
          await assertReal(cwd, "cwd", false);
        } catch (error) {
          const unrestored: string[] = [];
          for (const file of touched.reverse()) {
            try {
              await assertReal(file.absolute, file.path, true);
              await fs.writeText(file.absolute, file.before);
            } catch {
              unrestored.push(file.path);
            }
          }
          if (unrestored.length > 0) throw new Error(`program.run write failed and could not restore: ${unrestored.join(", ")} (${error instanceof Error ? error.message : String(error)})`);
          throw error;
        }

        const result = await world.process.exec({ argv: input.argv, cwd, ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }) }, { signal: ctx.signal });
        const outputDigest = sha256Hex(Buffer.concat([Buffer.from(result.stdout, "utf8"), Buffer.from([0]), Buffer.from(result.stderr, "utf8")]));
        if (result.exitCode !== 0 || result.timedOut) {
          throw new ProgramCommandFailedError(result.exitCode, result.timedOut, input.patchSha256.toLowerCase(), JSON.stringify(input.argv), outputDigest);
        }
        return { patchSha256: input.patchSha256.toLowerCase(), filesPatched: planned.map((p) => p.path), command: input.argv, exitCode: result.exitCode, timedOut: false, outputDigest, stdout: result.stdout, stderr: result.stderr };
      });
    },
  };
}
