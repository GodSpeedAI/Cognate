// Shared machinery for the CopilotKit-reconstruction architectural purity suite
// (prompt Phase 13 — .agents/prompts/copilotkit-reconstruction-test.md).
// Techniques mirror the deepseek-harness architecture suite, retargeted to this
// reconstruction's paths and reference pin.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ARCH_DIR = dirname(fileURLToPath(import.meta.url)); // .../copilot/tests/architecture
export const REC = resolve(ARCH_DIR, "..", ".."); // validation/reconstructions/copilot
export const ROOT = resolve(REC, "..", "..", ".."); // repository root
export const APP = join(REC, "cognate"); // reconstruction app workspace
export const APP_SRC = join(APP, "src");
export const APP_TEST = join(APP, "test");
export const CAPTURE_DIR = join(REC, "capture"); // capture/compare tooling
export const TESTS_DIR = join(REC, "tests"); // architecture + protocol + persistence suites
export const REFERENCE_MANIFEST = join(REC, "reference-manifest.json");

export const CODE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".generated",
  "screenshots", // the reconstruction's own captures, not reference material
  ".data",
  "dist",
  ".next",
  ".turbo",
  "logs",
  "diffs",
]);

interface WalkEntry {
  name: string;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

/** Symlink-safe recursive walk. Never follows symlinks (the pinned tarball contains broken ones). */
export function walk(dir: string, exts: readonly string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    let entries: WalkEntry[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue; // vanished or unreadable mid-scan: nothing to assert about it
    }
    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name) || entry.isSymbolicLink()) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (exts.includes(extname(entry.name))) out.push(full);
    }
  }
  return out;
}

/** Every file under a directory regardless of extension (symlink-safe, exclusions apply). */
export function walkAll(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    let entries: WalkEntry[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name) || entry.isSymbolicLink()) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out;
}

export function rel(path: string): string {
  return path.startsWith(ROOT + "/") ? path.slice(ROOT.length + 1) : path;
}

/**
 * Every import/require/dynamic-import specifier in a source text.
 * Self-naming strings ("copilotkit-reconstruction.chat" agent ids, /health payloads)
 * are NOT specifiers and are deliberately not matched — the reconstruction legitimately
 * names itself after what it reconstructs.
 */
export function importSpecifiers(text: string): string[] {
  const specifiers: string[] = [];
  const re =
    /(?:import|export)\s+(?:[\s\S]*?from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|import\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) specifiers.push(m[1] ?? m[2] ?? m[3] ?? "");
  return specifiers;
}

/** Reference checkout location: the reconstruction's own manifest is the source of truth. */
export function referenceCheckout(): { clonePath: string; present: boolean; source: string } {
  let clonePath = join(ROOT, ".tmp/ref/copilotkit");
  let source = "default path .tmp/ref/copilotkit (manifest absent)";
  if (existsSync(REFERENCE_MANIFEST)) {
    try {
      const manifest = JSON.parse(readFileSync(REFERENCE_MANIFEST, "utf8")) as { clonePath?: unknown };
      if (typeof manifest.clonePath === "string" && manifest.clonePath.length > 0) {
        clonePath = manifest.clonePath;
        source = "reference-manifest.json clonePath";
      }
    } catch {
      // fall back to the default path; the manifest test asserts it separately
    }
  }
  return { clonePath, present: existsSync(clonePath), source };
}

/** Git against the repository root; cwd: ROOT so pathspecs are repo-relative. */
export function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

/**
 * Run an async fn with the process cwd temporarily moved to `dir`, always restoring.
 * Bun.build's node_modules resolution behaves differently inside `bun test` than in a
 * plain `bun run` process; building an app workspace with that workspace as cwd is the
 * configuration proven to resolve its dependencies identically in both contexts.
 */
export async function withChdir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

export interface Lockfile {
  workspaces: Record<string, { name?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }>;
  packages: Record<string, unknown[]>;
}

/**
 * bun.lock is JSONC (trailing commas across newlines); boundedly repair and parse.
 * Callers must treat a failed validation as a test failure, never a silent pass.
 */
export function loadLockfile(): Lockfile {
  const text = readFileSync(join(ROOT, "bun.lock"), "utf8");
  const repaired = text.replace(/,(\s*[}\]])/g, "$1");
  const parsed = JSON.parse(repaired) as Lockfile;
  // Validation: the repair must not have corrupted the shape we rely on.
  if (!parsed || typeof parsed !== "object" || typeof parsed.workspaces !== "object" || typeof parsed.packages !== "object") {
    throw new Error("bun.lock did not parse into the expected { workspaces, packages } shape");
  }
  if (!parsed.workspaces["validation/reconstructions/copilot/cognate"]) {
    throw new Error("bun.lock workspaces is missing the copilot reconstruction entry");
  }
  if (Object.keys(parsed.packages).length === 0) {
    throw new Error("bun.lock packages map is empty — parse repair likely corrupted the file");
  }
  return parsed;
}

export const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

/**
 * Transitive dependency-name closure of a workspace, from the lockfile's own declarations.
 * Workspace packages resolve through their workspaces entry; registry packages through the
 * packages-map metadata. Peer dependencies over-approximate the closure, which is the safe
 * direction for a purity ban.
 */
export function dependencyClosure(lock: Lockfile, startWorkspaceKey: string): Map<string, string> {
  const workspaceKeyByName = new Map<string, string>();
  for (const [key, entry] of Object.entries(lock.workspaces)) {
    if (entry?.name) workspaceKeyByName.set(entry.name, key);
  }
  const closure = new Map<string, string>();
  const queue: { name: string; via: string }[] = [];
  const start = lock.workspaces[startWorkspaceKey];
  for (const field of DEP_FIELDS) {
    for (const name of Object.keys(start?.[field] ?? {})) queue.push({ name, via: startWorkspaceKey });
  }
  while (queue.length) {
    const { name, via } = queue.shift()!;
    if (closure.has(name)) continue;
    closure.set(name, via);
    let depNames: string[] = [];
    const wsKey = workspaceKeyByName.get(name);
    if (wsKey !== undefined) {
      const wsEntry = lock.workspaces[wsKey]!;
      for (const field of DEP_FIELDS) depNames.push(...Object.keys(wsEntry[field] ?? {}));
    } else {
      const pkgEntry = lock.packages[name];
      const meta = (pkgEntry?.[2] ?? {}) as Record<string, Record<string, string> | undefined>;
      for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
        depNames.push(...Object.keys(meta[field] ?? {}));
      }
    }
    for (const dep of depNames) if (!closure.has(dep)) queue.push({ name: dep, via: name });
  }
  return closure;
}
