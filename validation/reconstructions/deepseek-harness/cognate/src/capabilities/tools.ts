// Tool capabilities for `agent.coding`'s tool loop (T7): `tool.read`, `tool.edit`, `tool.bash`,
// `tool.run_code`. Every call is scoped to a workspace root (`workspaceRoot` in the input) and
// rejects any resolved path that escapes it. `tool.bash` and `tool.run_code` run as a real Bun
// subprocess with `cwd` = the workspace root, a timeout, and output caps; output is not streamed
// through `HandlerContext.progress` here because these calls are made from inside `agent.coding`'s
// `ctx.invoke`, which already records the call and its result as a `run.invocation` event — a
// second progress channel would just duplicate that. (`model.generate`'s use of `progress`, by
// contrast, streams *within* a single already-recorded invocation — see `modelProvider.ts`.)
import { resolve, sep } from "node:path";
import { readFile, writeFile, stat } from "node:fs/promises";
import type { Component, SemanticRef } from "@cognate/kernel-api";

const MAX_OUTPUT = 20_000;
const DEFAULT_TIMEOUT_MS = 30_000;

export class PathEscapeError extends Error {
  override readonly name = "PathEscapeError";
}

/** Resolve `relativeOrAbsolute` against `workspaceRoot`, rejecting any escape from it. */
export function resolveInWorkspace(workspaceRoot: string, relativeOrAbsolute: string): string {
  const root = resolve(workspaceRoot);
  const resolved = resolve(root, relativeOrAbsolute);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new PathEscapeError(`path escapes workspace root: ${relativeOrAbsolute}`);
  }
  return resolved;
}

function cap(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…(truncated)` : text;
}

async function runSubprocess(
  argv: readonly string[],
  options: { readonly cwd: string; readonly timeoutMs?: number },
): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number; readonly timedOut: boolean }> {
  const proc = Bun.spawn([...argv], { cwd: options.cwd, stdout: "pipe", stderr: "pipe" });
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  try {
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    const exitCode = await proc.exited;
    return { stdout: cap(stdout), stderr: cap(stderr), exitCode, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

// -- tool.read ---------------------------------------------------------------------------------
export interface ToolReadInput {
  readonly workspaceRoot: string;
  readonly file_path: string;
}
export interface ToolReadResult {
  readonly file_path: string;
  readonly content: string;
}

// -- tool.edit ---------------------------------------------------------------------------------
export interface ToolEditInput {
  readonly workspaceRoot: string;
  readonly file_path: string;
  readonly old_string: string;
  readonly new_string: string;
  readonly replace_all?: boolean;
}
export interface ToolEditResult {
  readonly file_path: string;
  readonly replacements: number;
  /** Unified-diff-style lines (` ` unchanged, `-` removed, `+` added) for the UI's diff view
   *  (`10-file-change-collapsed`/`-expanded`). A simple common-prefix/suffix line diff — enough for
   *  this reconstruction's single/few-line replacements, not a general diff algorithm. */
  readonly diffLines: readonly string[];
  readonly additions: number;
  readonly deletions: number;
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = 0;
  for (;;) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    count++;
    index = found + needle.length;
  }
  return count;
}

/** Common-prefix/suffix line diff: everything before the first differing line and after the last
 *  differing line is shown as context (` `); the differing middle is shown as removed (`-`) old
 *  lines followed by added (`+`) new lines. */
function diffLines(oldText: string, newText: string): { readonly diffLines: readonly string[]; readonly additions: number; readonly deletions: number } {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  let oldSuffix = oldLines.length;
  let newSuffix = newLines.length;
  while (oldSuffix > prefix && newSuffix > prefix && oldLines[oldSuffix - 1] === newLines[newSuffix - 1]) {
    oldSuffix--;
    newSuffix--;
  }
  const removed = oldLines.slice(prefix, oldSuffix);
  const added = newLines.slice(prefix, newSuffix);
  const lines: string[] = [
    ...oldLines.slice(0, prefix).map((l) => ` ${l}`),
    ...removed.map((l) => `-${l}`),
    ...added.map((l) => `+${l}`),
    ...oldLines.slice(oldSuffix).map((l) => ` ${l}`),
  ];
  return { diffLines: lines, additions: added.length, deletions: removed.length };
}

// -- tool.bash ---------------------------------------------------------------------------------
export interface ToolBashInput {
  readonly workspaceRoot: string;
  readonly command: string;
  readonly description?: string;
  readonly timeoutMs?: number;
}
export interface ToolBashResult {
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

// -- tool.run_code -----------------------------------------------------------------------------
// The reference's `run_code` (dsh-tools `packages/core/tools/src/ptc.ts`) executes a JS snippet in
// a sandbox that exposes a `tools` object (e.g. `tools.bash(...)`) and can request an elevated
// `sandbox_permissions` level, which is what triggers approval (see `approvalGate.ts`). This
// reconstruction gives `code` a small, original harness — not copied from the reference — that
// defines `tools.bash` in terms of this same `tool.bash` execution path, then runs the snippet as
// an `bun -e` subprocess with `cwd` = the workspace root.
export interface ToolRunCodeInput {
  readonly workspaceRoot: string;
  readonly code: string;
  readonly description?: string;
  readonly sandbox_permissions?: string;
  readonly justification?: string;
  readonly timeoutMs?: number;
}
export interface ToolRunCodeResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

const RUN_CODE_HARNESS = (code: string) => `
const tools = {
  bash: async ({ command }) => {
    const proc = Bun.spawn(["bash", "-lc", command], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    const exitCode = await proc.exited;
    return { stdout, stderr, exitCode };
  },
};
(async () => {
${code}
})().catch((e) => { console.error(String(e && e.message ? e.message : e)); process.exitCode = 1; });
`;

/** Every `tool.<name>` capability this app publishes, mounted as one component. */
export function toolCapabilitiesComponent(semanticRef?: SemanticRef): Component {
  const contract = (name: string) => ({ id: `tool.${name}`, version: "1.0.0", semanticRef });
  return {
    id: "tools:all",
    provides: [contract("read"), contract("edit"), contract("bash"), contract("run_code")],
    activate(fiber) {
      fiber.provide(contract("read"), async (rawInput): Promise<ToolReadResult> => {
        const input = rawInput as ToolReadInput;
        const path = resolveInWorkspace(input.workspaceRoot, input.file_path);
        const content = await readFile(path, "utf8");
        return { file_path: input.file_path, content };
      });

      fiber.provide(contract("edit"), async (rawInput): Promise<ToolEditResult> => {
        const input = rawInput as ToolEditInput;
        const path = resolveInWorkspace(input.workspaceRoot, input.file_path);
        const current = await readFile(path, "utf8");
        const occurrences = countOccurrences(current, input.old_string);
        if (occurrences === 0) throw new Error(`tool.edit: old_string not found in ${input.file_path}`);
        if (occurrences > 1 && !input.replace_all) {
          throw new Error(`tool.edit: old_string is not unique in ${input.file_path} (${occurrences} matches) — provide more context or set replace_all`);
        }
        const next = input.replace_all
          ? current.split(input.old_string).join(input.new_string)
          : current.replace(input.old_string, input.new_string);
        await writeFile(path, next, "utf8");
        const diff = diffLines(current, next);
        return { file_path: input.file_path, replacements: input.replace_all ? occurrences : 1, ...diff };
      });

      fiber.provide(contract("bash"), async (rawInput): Promise<ToolBashResult> => {
        const input = rawInput as ToolBashInput;
        const root = resolve(input.workspaceRoot);
        const { stdout, stderr, exitCode, timedOut } = await runSubprocess(["bash", "-lc", input.command], {
          cwd: root,
          timeoutMs: input.timeoutMs,
        });
        return { command: input.command, exitCode, stdout, stderr, timedOut };
      });

      fiber.provide(contract("run_code"), async (rawInput): Promise<ToolRunCodeResult> => {
        const input = rawInput as ToolRunCodeInput;
        const root = resolve(input.workspaceRoot);
        const { stdout, stderr, exitCode, timedOut } = await runSubprocess(["bun", "-e", RUN_CODE_HARNESS(input.code)], {
          cwd: root,
          timeoutMs: input.timeoutMs,
        });
        return { exitCode, stdout: cap(stdout), stderr: cap(stderr), timedOut };
      });
    },
  };
}

/** Existence check used by `edit`'s read-before-edit guard in `agent.coding` (does the file exist on disk yet?). */
export async function fileExists(workspaceRoot: string, filePath: string): Promise<boolean> {
  try {
    const info = await stat(resolveInWorkspace(workspaceRoot, filePath));
    return info.isFile();
  } catch {
    return false;
  }
}
