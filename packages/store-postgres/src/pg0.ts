// Optional pg0 driver: resolves (and if needed starts) a local pg0-managed PostgreSQL instance and
// returns its connection URL. pg0 (https://github.com/vectorize-io/pg0) is a zero-configuration
// PostgreSQL distribution; Cognate uses it for local development and tests but never requires it —
// an explicit `postgres://` URL always works without this module.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export interface Pg0Options {
  /** pg0 instance name (default `cognate-dev`, matching `just db-up`). */
  readonly name?: string;
  /**
   * Path to the pg0 binary. Resolution order: this option, `$COGNATE_PG0_BIN`, `.tmp/pg0/pg0`
   * (what `just db-setup` installs), then `pg0` on PATH.
   */
  readonly bin?: string;
  /** Fail instead of starting the instance when it is not running (default false). */
  readonly noStart?: boolean;
}

function run(bin: string, args: readonly string[]): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (error: Error) => resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function uriFrom(output: string): string | undefined {
  return output.match(/URI:\s*(postgres(?:ql)?:\/\/\S+)/)?.[1];
}

/** Resolve the pg0 binary without starting anything (exported for diagnostics and the justfile).
 * `.tmp/pg0/pg0` (what `just db-setup` installs) is found from the working directory or any parent,
 * so apps booted from a subdirectory locate the repo's pinned binary. */
export function findPg0Bin(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.COGNATE_PG0_BIN) return process.env.COGNATE_PG0_BIN;
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const candidate = join(dir, ".tmp", "pg0", "pg0");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
  }
  return "pg0";
}

/**
 * Return the connection URL of the named pg0 instance, starting it first unless `noStart`.
 * Throws a descriptive error when pg0 is not installed or the instance cannot be reached.
 */
export async function resolvePg0Url(options: Pg0Options = {}): Promise<string> {
  const bin = findPg0Bin(options.bin);
  const name = options.name ?? "cognate-dev";
  const info = await run(bin, ["info", "--name", name]);
  const running = info.code === 0 ? uriFrom(info.stdout) : undefined;
  if (running) return running;
  if (options.noStart) {
    throw new Error(`pg0 instance "${name}" is not running (bin: ${bin}). Start it with \`just db-up\`.`);
  }
  const start = await run(bin, ["start", "--name", name]);
  const url = uriFrom(start.stdout);
  if (start.code !== 0 || !url) {
    throw new Error(`pg0 could not start instance "${name}" (bin: ${bin}): ${start.stderr.trim() || start.stdout.trim()}`);
  }
  return url;
}
