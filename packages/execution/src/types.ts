// Framework-owned execution-world contracts (spec §8.2, §28). No transport or library types may
// appear in this file: SSH, WSL, containers and the local machine are providers of these ports, not
// kinds of contract. Everything here is what an app-level tool is allowed to know.

/** A provider-declared world kind. Open by design — `local`, `ssh`, `memory`, later `wsl`, `container`. */
export type WorldKind = string;

/** One filesystem entry's identity. `version` is a provider-owned staleness token, opaque above here. */
export interface FileStat {
  readonly kind: "file" | "directory" | "other";
  readonly size: number;
  readonly version: string;
}

export interface DirEntry {
  readonly name: string;
  readonly kind: "file" | "directory" | "other";
}

/**
 * One process launch. `argv[0]` is the program; `cwd` is a provider-owned root (an OS path for the
 * local provider, a POSIX path for the SSH provider) and is only meaningful to the provider that
 * minted it.
 */
export interface ExecSpec {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface ExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
}

export interface ExecOptions {
  /** Aborted when the invoking run is cancelled; a provider must terminate the process. */
  readonly signal?: AbortSignal;
}

/**
 * Filesystem operations a tool may need. `resolve` is the containment boundary: it must return the
 * canonical path for `path` under `root` and throw `PathEscapeError` for anything outside it.
 */
export interface FileSystemPort {
  resolve(root: string, path: string): string;
  stat(path: string): Promise<FileStat | undefined>;
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  list(path: string): Promise<readonly DirEntry[]>;
  writeText(path: string, content: string): Promise<void>;
  /** Staleness token for `path`, or `undefined` when it does not exist. */
  version(path: string): Promise<string | undefined>;
}

export interface ProcessPort {
  exec(spec: ExecSpec, options?: ExecOptions): Promise<ExecResult>;
}

/**
 * One live execution location. `metadata` is safe for durable state, projections and logs (host,
 * user, root label) — never credentials, keys, or tokens.
 */
export interface ExecutionWorldProvider {
  readonly worldId: string;
  readonly kind: WorldKind;
  readonly metadata: Readonly<Record<string, string>>;
  readonly fileSystem: FileSystemPort;
  readonly process: ProcessPort;
  /** Release every reversible resource this provider owns (connections, handles). Idempotent. */
  dispose(): Promise<void>;
}

/** A provider's identity without its ports — what `list()` and durable state may carry. */
export interface WorldDescriptor {
  readonly worldId: string;
  readonly kind: WorldKind;
  readonly metadata: Readonly<Record<string, string>>;
}

/** The world named by the caller is not registered, or its provider is gone. Fail closed, never fall back. */
export class WorldUnavailableError extends Error {
  override readonly name = "WorldUnavailableError";
  constructor(readonly worldId: string, reason: string) {
    super(reason);
  }
}

/** A path resolved outside its workspace root. Raised by the provider/contract boundary. */
export class PathEscapeError extends Error {
  override readonly name = "PathEscapeError";
  constructor(readonly attempted: string) {
    super(`path escapes the workspace root: ${attempted}`);
  }
}