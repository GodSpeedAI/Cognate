// A FileSystemPort built from one primitive: "run a POSIX script on the world and give me its
// output". It is how a world with no native file API (a WSL distro, a container) satisfies the same
// `filesystem.*` contract, with no transport type crossing this boundary. Content travels as base64
// inside the script, so it is binary-safe and bounded only by the world's own limits.
import { createRootGuard, shellQuote } from "./posix.ts";
import type { DirEntry, FileStat, FileSystemPort } from "./types.ts";

export interface ScriptResult { readonly stdout: string; readonly stderr: string; readonly exitCode: number }
export type RunScript = (script: string, options?: { readonly signal?: AbortSignal }) => Promise<ScriptResult>;

const KIND: Record<string, FileStat["kind"]> = { f: "file", d: "directory" };

export function commandFileSystem(run: RunScript): FileSystemPort {
  const q = shellQuote;
  const ok = async (script: string): Promise<string> => {
    const r = await run(script);
    if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `command failed (exit ${r.exitCode})`);
    return r.stdout;
  };
  const guard = createRootGuard(async (path) => {
    const r = await run(`realpath -- ${q(path)}`);
    return r.exitCode === 0 ? r.stdout.replace(/\n$/, "") : undefined;
  });
  const statOf = async (path: string): Promise<FileStat | undefined> => {
    await guard.assertContained(path);
    // %F is human text; %f/%s/%.9Y are stable. Format: <type-bits-hex>|<size>|<mtime-ns>
    const r = await run(`stat -c '%f|%s|%.9Y' -- ${q(path)}`);
    if (r.exitCode !== 0) return undefined;
    const [bits, size, mtime] = r.stdout.trim().split("|");
    const mode = Number.parseInt(bits ?? "0", 16);
    const kind = (mode & 0o170000) === 0o100000 ? "file" : (mode & 0o170000) === 0o040000 ? "directory" : "other";
    return { kind, size: Number(size), version: `${mtime}:${size}` };
  };
  return {
    resolve: (root, path) => guard.resolve(root, path),
    stat: statOf,
    async exists(path) {
      return (await statOf(path)) !== undefined;
    },
    async readText(path) {
      await guard.assertContained(path);
      return Buffer.from((await ok(`base64 -w0 < ${q(path)}`)).trim(), "base64").toString("utf8");
    },
    async list(path) {
      await guard.assertContained(path);
      const out = await ok(`find ${q(path)} -mindepth 1 -maxdepth 1 -printf '%y\\0%f\\0'`);
      const parts = out.split("\0");
      const entries: DirEntry[] = [];
      for (let i = 0; i + 1 < parts.length; i += 2) entries.push({ name: parts[i + 1]!, kind: (KIND[parts[i]!] ?? "other") as DirEntry["kind"] });
      return entries;
    },
    async writeText(path, content) {
      await guard.assertContained(path);
      const b64 = Buffer.from(content, "utf8").toString("base64");
      await ok(`printf %s ${q(b64)} | base64 -d > ${q(path)}`);
    },
    async version(path) {
      return (await statOf(path))?.version;
    },
  };
}
