// The local machine as an execution world. This is the behaviour every tool already had before the
// execution-world abstraction existed: `node:fs` for files, `Bun.spawn` for processes, containment
// enforced by resolving against the workspace root.
import { readFile, writeFile, stat as statFile, readdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { PathEscapeError } from "./types.ts";
import type { DirEntry, ExecResult, ExecSpec, FileStat, ExecutionWorldProvider, FileSystemPort, ProcessPort } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface LocalExecutionWorldOptions {
  readonly worldId?: string;
  /** Safe metadata for durable state and UI. Never credentials. */
  readonly metadata?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

function kindOf(stats: { isFile(): boolean; isDirectory(): boolean }): FileStat["kind"] {
  return stats.isFile() ? "file" : stats.isDirectory() ? "directory" : "other";
}

/** Canonicalize `path` under `root`, rejecting any escape. The one containment rule for local. */
export function resolveLocal(root: string, path: string): string {
  const base = resolve(root);
  const resolved = resolve(base, path);
  if (resolved !== base && !resolved.startsWith(base + sep)) throw new PathEscapeError(path);
  return resolved;
}

/** Sub-second mtime plus inode: a same-size rewrite within one second still changes the version. */
function versionOf(stats: { mtimeNs: bigint; size: bigint; ino: bigint }): string {
  return `${stats.mtimeNs}:${stats.size}:${stats.ino}`;
}

const statBigint = (path: string) => statFile(path, { bigint: true }).catch(() => undefined);

function createLocalFileSystem(): FileSystemPort {
  return {
    resolve: resolveLocal,
    async stat(path) {
      const stats = await statBigint(path);
      if (!stats) return undefined;
      return { kind: kindOf(stats), size: Number(stats.size), version: versionOf(stats) };
    },
    async exists(path) {
      const stats = await statBigint(path);
      return stats !== undefined;
    },
    async readText(path) {
      return readFile(path, "utf8");
    },
    async list(path) {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.map((entry): DirEntry => ({ name: entry.name, kind: entry.isFile() ? "file" : entry.isDirectory() ? "directory" : "other" }));
    },
    async writeText(path, content) {
      await writeFile(path, content, "utf8");
    },
    async version(path) {
      const stats = await statBigint(path);
      return stats ? versionOf(stats) : undefined;
    },
  };
}

function createLocalProcess(timeoutMs: number): ProcessPort {
  return {
    async exec(spec: ExecSpec, options): Promise<ExecResult> {
      const proc = Bun.spawn([...spec.argv], {
        cwd: spec.cwd,
        ...(spec.env ? { env: { ...process.env, ...spec.env } } : {}),
        stdout: "pipe",
        stderr: "pipe",
      });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, spec.timeoutMs ?? timeoutMs);
      const onAbort = () => proc.kill();
      options?.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
        const exitCode = await proc.exited;
        return { stdout, stderr, exitCode, timedOut };
      } finally {
        clearTimeout(timer);
        options?.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

/** The local machine as a provider of the execution-world contracts. */
export function localExecutionWorld(options: LocalExecutionWorldOptions = {}): ExecutionWorldProvider {
  return {
    worldId: options.worldId ?? "local",
    kind: "local",
    metadata: options.metadata ?? { host: "localhost" },
    fileSystem: createLocalFileSystem(),
    process: createLocalProcess(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    async dispose() {
      // Local execution holds no connection; disposal is a no-op that keeps the contract honest.
    },
  };
}