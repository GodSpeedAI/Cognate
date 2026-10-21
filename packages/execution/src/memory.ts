// A deterministic, in-process execution world: a virtual filesystem plus a tiny scripted process
// interpreter. It exists so the normal test suite can exercise every execution-world journey —
// coexistence, switching, provider removal, remote-shaped roots — without a real network, and so
// the abstraction is proven independently of any transport.
//
// It is not a "fake local path": its root is a provider-owned virtual location (`/workspace` by
// default), exactly as opaque above the provider as an SSH root is.
import { posix } from "node:path";
import { PathEscapeError } from "./types.ts";
import type { DirEntry, ExecResult, ExecSpec, ExecutionWorldProvider, FileStat, FileSystemPort, ProcessPort } from "./types.ts";

export interface MemoryExecutionWorldOptions {
  readonly worldId?: string;
  /** Initial file contents, keyed by absolute virtual path. */
  readonly files?: Readonly<Record<string, string>>;
  /** Safe metadata for durable state and UI. */
  readonly metadata?: Readonly<Record<string, string>>;
  /** Directory entries this world pretends exist even when empty. */
  readonly directories?: readonly string[];
}

/** Canonicalize `path` under `root` using POSIX rules, rejecting any escape. */
export function resolveMemory(root: string, path: string): string {
  const base = posix.resolve(root);
  const resolved = posix.resolve(base, path);
  if (resolved !== base && !resolved.startsWith(base + "/")) throw new PathEscapeError(path);
  return resolved;
}

function parentOf(path: string): string {
  return posix.dirname(path);
}

function kindOf(path: string, files: Map<string, string>, directories: Set<string>): DirEntry["kind"] {
  return files.has(path) ? "file" : directories.has(path) ? "directory" : "other";
}

function createMemoryFileSystem(files: Map<string, string>, directories: Set<string>): FileSystemPort {
  // Every write bumps a per-path revision, so a same-size rewrite still yields a new version.
  const revisions = new Map<string, number>();
  const versionOf = (path: string, content: string) => `${content.length}:${revisions.get(path) ?? 0}`;
  return {
    resolve: resolveMemory,
    async stat(path) {
      if (files.has(path)) {
        const content = files.get(path)!;
        return { kind: "file", size: content.length, version: versionOf(path, content) };
      }
      if (directories.has(path)) return { kind: "directory", size: 0, version: `dir:${path}` };
      return undefined;
    },
    async exists(path) {
      return files.has(path) || directories.has(path);
    },
    async readText(path) {
      const content = files.get(path);
      if (content === undefined) throw new Error(`ENOENT: no such file: ${path}`);
      return content;
    },
    async list(path) {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const names = new Set<string>();
      for (const file of files.keys()) if (file.startsWith(prefix)) names.add(file.slice(prefix.length).split("/")[0]!);
      for (const dir of directories) if (dir.startsWith(prefix)) names.add(dir.slice(prefix.length).split("/")[0]!);
      return [...names].filter(Boolean).sort().map((name): DirEntry => ({ name, kind: kindOf(prefix + name, files, directories) }));
    },
    async writeText(path, content) {
      files.set(path, content);
      revisions.set(path, (revisions.get(path) ?? 0) + 1);
      const parent = parentOf(path);
      if (parent && parent !== "/") directories.add(parent);
    },
    async version(path) {
      const content = files.get(path);
      return content === undefined ? undefined : versionOf(path, content);
    },
  };
}

/**
 * The scripted process interpreter. Three deterministic commands are understood so a conformance
 * suite can run unchanged against this world:
 *   `["memory", "echo", marker]`      -> stdout marker, exit 0
 *   `["memory", "fail", marker, code]` -> stderr marker, exit `code`
 *   `["memory", "slow"]`              -> runs until its timeout or abort
 */
function createMemoryProcess(): ProcessPort {
  return {
    async exec(spec: ExecSpec, options): Promise<ExecResult> {
      const [program, verb, ...rest] = spec.argv;
      if (program !== "memory") return { stdout: "", stderr: `memory world: unknown program ${program}`, exitCode: 127, timedOut: false };
      if (verb === "echo") return { stdout: rest.join(" "), stderr: "", exitCode: 0, timedOut: false };
      if (verb === "fail") return { stdout: "", stderr: rest[0] ?? "", exitCode: Number(rest[1] ?? 1), timedOut: false };
      if (verb === "slow") {
        const timeoutMs = spec.timeoutMs ?? 30_000;
        return new Promise<ExecResult>((resolve) => {
          const timer = setTimeout(() => resolve({ stdout: "", stderr: "", exitCode: 124, timedOut: true }), timeoutMs);
          options?.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve({ stdout: "", stderr: "", exitCode: 130, timedOut: false });
            },
            { once: true },
          );
        });
      }
      return { stdout: "", stderr: `memory world: unknown command ${verb}`, exitCode: 127, timedOut: false };
    },
  };
}

/** A deterministic in-process execution world. */
export function memoryExecutionWorld(options: MemoryExecutionWorldOptions = {}): ExecutionWorldProvider {
  const files = new Map<string, string>(Object.entries(options.files ?? {}));
  const directories = new Set<string>(options.directories ?? []);
  return {
    worldId: options.worldId ?? "memory",
    kind: "memory",
    metadata: options.metadata ?? { host: "memory" },
    fileSystem: createMemoryFileSystem(files, directories),
    process: createMemoryProcess(),
    async dispose() {
      files.clear();
      directories.clear();
    },
  };
}