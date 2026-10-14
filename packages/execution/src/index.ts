// Framework-owned execution-world contracts (spec §8.2, §28). No transport or library types cross
// this boundary: SSH, WSL, containers, and the local machine are providers of the same ports.
export {
  PathEscapeError,
  WorldUnavailableError,
} from "./types.ts";
export type {
  DirEntry,
  ExecOptions,
  ExecResult,
  ExecSpec,
  ExecutionWorldProvider,
  FileStat,
  FileSystemPort,
  ProcessPort,
  WorldDescriptor,
  WorldKind,
} from "./types.ts";

export { createExecutionWorldRegistry } from "./registry.ts";
export type { ExecutionWorldRegistry } from "./registry.ts";

export {
  EXECUTION_CAPABILITY_IDS,
  EXECUTION_CAPABILITY_VERSION,
  FILESYSTEM_CAPABILITIES,
  PROCESS_CAPABILITY,
  executionWorldsComponent,
} from "./capabilities.ts";
export type {
  ExecutionWorldsComponentOptions,
  ExecInput,
  ListInput,
  ListResult,
  PathInput,
  ReadInput,
  ReadResult,
  ResolveInput,
  ResolveResult,
  StatResult,
  VersionInput,
  VersionResult,
  WriteInput,
  WriteResult,
} from "./capabilities.ts";

export { localExecutionWorld, resolveLocal } from "./local.ts";
export type { LocalExecutionWorldOptions } from "./local.ts";
export { bubblewrapExecutionWorld } from "./bubblewrap.ts";
export type { BubblewrapExecutionWorldOptions } from "./bubblewrap.ts";

export { memoryExecutionWorld, resolveMemory } from "./memory.ts";
export type { MemoryExecutionWorldOptions } from "./memory.ts";
export { commandFileSystem } from "./command.ts";
export type { RunScript, ScriptResult } from "./command.ts";
export { createRootGuard, execScript, resolvePosix, shellQuote, supervisedExecScript } from "./posix.ts";
