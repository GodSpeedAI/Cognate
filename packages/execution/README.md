# @godspeedai/cognate-execution

Execution-world contracts for Cognate: the framework-owned filesystem and process ports that higher-level tools (`read`, `edit`, `bash`, and anything else that touches files or runs commands) consume, plus the provider registry that swaps *where* those operations happen — local machine, SSH host, WSL distribution, or your own — without changing the tools.

**When to use this package:** you want file/process access behind replaceable providers, or you are writing a provider (SSH, a container runtime, a test double) that must satisfy the same contracts. Ready-made providers: [`@godspeedai/cognate-execution-ssh`](https://www.npmjs.com/package/@godspeedai/cognate-execution-ssh) and [`@godspeedai/cognate-execution-wsl`](https://www.npmjs.com/package/@godspeedai/cognate-execution-wsl).

The idea in one line: a workspace says *what* a user works on; an execution world says *where* its files are read and its commands run; replacing the provider under one `filesystem.*` / `process.exec` contract moves execution to another machine with zero change to the tools, the agent, or the approvals.

## Installation

```sh
bun add @godspeedai/cognate-execution
```

Requires [Bun](https://bun.sh) >= 1.4.0. Depends on [`@godspeedai/cognate-kernel-api`](https://www.npmjs.com/package/@godspeedai/cognate-kernel-api) for the `Component` shape only — no transport or library types cross this package's boundary.

## Quick start

```ts
import { createExecutionWorldRegistry, localExecutionWorld } from "@godspeedai/cognate-execution";

const registry = createExecutionWorldRegistry([
  localExecutionWorld({ worldId: "local", metadata: { host: "dev-box" } }),
]);

const world = registry.get("local");
const path = world.fileSystem.resolve("/home/me/workspace", "src/app.ts"); // canonical path; escapes throw PathEscapeError
const exists = await world.fileSystem.exists(path);
const result = await world.process.exec({ argv: ["bun", "test"], cwd: "/home/me/workspace", timeoutMs: 60_000 });
console.log(result.exitCode, result.stdout, result.timedOut);

await registry.dispose();
```

`registry.get` throws `WorldUnavailableError` for an unknown or disposed world — it never falls back to another world. A missing file is reported as `undefined` from `stat`/`version`, not as an error. Provider `metadata` is safe for durable state and logs: host names and auth *kinds*, never credentials.

To expose the worlds as capabilities (so agents and tools invoke `filesystem.readText` and `process.exec` instead of importing providers), mount the capability component on your runtime or kernel:

```ts
import { executionWorldsComponent } from "@godspeedai/cognate-execution";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";

const runtime = await createRuntime({
  store: "./app.sqlite",
  agents: [/* ... */],
  policy, // authorize the filesystem.*/process.exec capabilities
  actions,
  components: [executionWorldsComponent(registry)],
});
```

## Contracts and providers

| Export | Kind | Meaning |
| --- | --- | --- |
| `FileSystemPort` | port | `resolve`, `stat`, `exists`, `readText`, `list`, `writeText`, `version` |
| `ProcessPort` | port | `exec(spec, { signal })` → `{ stdout, stderr, exitCode, timedOut }` |
| `ExecutionWorldProvider` | provider | one `worldId`, `kind`, safe `metadata`, both ports, idempotent `dispose()` |
| `createExecutionWorldRegistry()` | factory | register/unregister/get providers; `list()` returns secret-free descriptors |
| `executionWorldsComponent(registry)` | component | publishes the capabilities below, routed by the caller's `worldId` |
| `localExecutionWorld()` | provider | the local machine (`node:fs` + `Bun.spawn`) |
| `memoryExecutionWorld()` | provider | deterministic in-process world with a virtual filesystem and scripted commands (`memory echo/fail/slow`) for tests |
| `PathEscapeError`, `WorldUnavailableError` | errors | path escaped its root; world unknown, unreachable, or disposed |

Published capability ids: `filesystem.resolve`, `filesystem.stat`, `filesystem.readText`, `filesystem.writeText`, `filesystem.list`, `filesystem.version`, `process.exec`. Removing a provider makes its capabilities resolve unavailable — a clean failure, never a silent local fallback.

Also exported: `commandFileSystem(runScript)` — a `FileSystemPort` built from a single "run this POSIX script" primitive (used by the WSL provider; handy for containers); the POSIX helpers `shellQuote`, `execScript`, `supervisedExecScript`, `resolvePosix`, `createRootGuard`; and the `./conformance` subpath.

## Writing a provider

Export a function that returns an `ExecutionWorldProvider`, and prove it with the shared suite:

```ts
import { executionWorldConformance } from "@godspeedai/cognate-execution/conformance";

executionWorldConformance("my-world", async () => ({
  provider: myExecutionWorld({ /* ... */ }),
  root: "/workspace", // a location this provider owns
  commands: {
    echo: (marker) => ({ argv: ["printf", "%s", marker], cwd: "/workspace" }),
    fail: (marker, code) => ({ argv: ["sh", "-c", `printf %s ${JSON.stringify(marker)} 1>&2; exit ${code}`], cwd: "/workspace" }),
    slow: () => ({ argv: ["sleep", "30"], cwd: "/workspace" }),
  },
}));
```

The suite asserts, for any provider: containment rejects escapes, a missing file is `undefined` rather than a throw, reads and writes round-trip, `version` changes with content, `exec` reports stdout/stderr/exit code, timeouts and aborts really end the process, and `dispose()` is idempotent. The shipped local, memory, SSH, and WSL providers all pass it unchanged.

## Limitations

- The contracts define files and processes only — no sockets, no watch, no glob.
- `resolve` containment is lexical for the local world (symlinks are resolved as-is); the SSH provider adds a symlink check, and `commandFileSystem`-based worlds check via `realpath`. A check-then-use race on a concurrently swapped symlink is not prevented anywhere.
- `cwd` in an `ExecSpec` is provider-owned: an OS path for local, a POSIX path inside the distribution for WSL, and so on — only meaningful to the provider that minted it.

## Related packages

- [`@godspeedai/cognate-execution-ssh`](https://www.npmjs.com/package/@godspeedai/cognate-execution-ssh) — SSH host provider (SFTP + remote exec over `ssh2`).
- [`@godspeedai/cognate-execution-wsl`](https://www.npmjs.com/package/@godspeedai/cognate-execution-wsl) — WSL distribution provider.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) — hosts the capability component via `createRuntime`.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
