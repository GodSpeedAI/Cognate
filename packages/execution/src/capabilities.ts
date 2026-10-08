// The capability surface of the framework: every filesystem/process operation a tool may consume,
// published once per app and routed to the provider named by the caller's `worldId`.
//
// The capability component owns no filesystem and no process. It resolves a world and delegates —
// which is exactly why removing a provider makes these capabilities fail cleanly instead of
// silently doing the work locally.
import type { CapabilityContract, Component, SemanticRef } from "@godspeedai/kernel-api";
import type { ExecutionWorldRegistry } from "./registry.ts";
import { WorldUnavailableError } from "./types.ts";
import type { DirEntry, ExecResult, FileStat } from "./types.ts";

export const FILESYSTEM_CAPABILITIES = [
  "filesystem.resolve",
  "filesystem.stat",
  "filesystem.readText",
  "filesystem.writeText",
  "filesystem.list",
  "filesystem.version",
] as const;

export const PROCESS_CAPABILITY = "process.exec";

export const EXECUTION_CAPABILITY_IDS: readonly string[] = [...FILESYSTEM_CAPABILITIES, PROCESS_CAPABILITY];

export const EXECUTION_CAPABILITY_VERSION = "1.0.0";

/** Inputs. `worldId` selects the provider; absolute `path` values come from a prior `filesystem.resolve`. */
export interface ResolveInput {
  readonly worldId: string;
  readonly root: string;
  readonly path: string;
}
export interface PathInput {
  readonly worldId: string;
  readonly path: string;
}
export interface ReadInput {
  readonly worldId: string;
  readonly path: string;
}
export interface WriteInput {
  readonly worldId: string;
  readonly path: string;
  readonly content: string;
}
export interface ListInput {
  readonly worldId: string;
  readonly path: string;
}
export interface VersionInput {
  readonly worldId: string;
  readonly path: string;
}
export interface ExecInput {
  readonly worldId: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface ResolveResult {
  readonly path: string;
}
export interface StatResult {
  /** `null` means "does not exist" — not an error. */
  readonly stat: FileStat | null;
}
export interface ReadResult {
  readonly content: string;
}
export interface WriteResult {
  readonly ok: true;
}
export interface ListResult {
  readonly entries: readonly DirEntry[];
}
export interface VersionResult {
  readonly version: string | null;
}

export interface ExecutionWorldsComponentOptions {
  /** One semantic anchor for the whole execution-world capability family (all ids share it). */
  readonly semanticRef?: SemanticRef;
}

/**
 * Publishes `filesystem.*` and `process.exec` against a registry. Any capability for an unknown or
 * disposed world raises `WorldUnavailableError`; there is no fallback path.
 */
export function executionWorldsComponent(registry: ExecutionWorldRegistry, options: ExecutionWorldsComponentOptions = {}): Component {
  const contract = (id: string): CapabilityContract => ({ id, version: EXECUTION_CAPABILITY_VERSION, semanticRef: options.semanticRef });
  const provides = EXECUTION_CAPABILITY_IDS.map(contract);
  return {
    id: "execution:worlds",
    semanticRef: options.semanticRef,
    provides,
    activate(fiber) {
      fiber.provide(contract("filesystem.resolve"), (raw): ResolveResult => {
        const input = raw as ResolveInput;
        return { path: registry.get(input.worldId).fileSystem.resolve(input.root, input.path) };
      });

      fiber.provide(contract("filesystem.stat"), async (raw): Promise<StatResult> => {
        const input = raw as PathInput;
        const stat = await registry.get(input.worldId).fileSystem.stat(input.path);
        return { stat: stat ?? null };
      });

      fiber.provide(contract("filesystem.readText"), async (raw): Promise<ReadResult> => {
        const input = raw as ReadInput;
        return { content: await registry.get(input.worldId).fileSystem.readText(input.path) };
      });

      fiber.provide(contract("filesystem.writeText"), async (raw): Promise<WriteResult> => {
        const input = raw as WriteInput;
        await registry.get(input.worldId).fileSystem.writeText(input.path, input.content);
        return { ok: true };
      });

      fiber.provide(contract("filesystem.list"), async (raw): Promise<ListResult> => {
        const input = raw as ListInput;
        return { entries: await registry.get(input.worldId).fileSystem.list(input.path) };
      });

      fiber.provide(contract("filesystem.version"), async (raw): Promise<VersionResult> => {
        const input = raw as VersionInput;
        const version = await registry.get(input.worldId).fileSystem.version(input.path);
        return { version: version ?? null };
      });

      fiber.provide(contract(PROCESS_CAPABILITY), async (raw, ctx): Promise<ExecResult> => {
        const input = raw as ExecInput;
        return registry.get(input.worldId).process.exec(
          { argv: input.argv, cwd: input.cwd, ...(input.env ? { env: input.env } : {}), ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }) },
          { signal: ctx.signal },
        );
      });
    },
  };
}

export { WorldUnavailableError };