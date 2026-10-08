# @godspeedai/execution — execution worlds

A `Workspace` says *what* a user is working on. An **Execution World** says *where* its files are
read and its commands run. Higher-level tools (`read`, `edit`, `bash`, `run_code`, and anything
else that consumes a filesystem or a process) depend on the framework-owned contracts in this
package — never on a transport.

```
Workspace ──executionWorldId──▶ Execution World ──provider──▶ FileSystemPort / ProcessPort
```

## Contracts

| Export | Kind | Meaning |
| --- | --- | --- |
| `FileSystemPort` | port | `resolve`, `stat`, `exists`, `readText`, `list`, `writeText`, `version` |
| `ProcessPort` | port | `exec(spec, { signal })` → `{ stdout, stderr, exitCode, timedOut }` |
| `ExecutionWorldProvider` | provider | one `worldId` + `kind` + safe `metadata` + both ports + `dispose()` |
| `createExecutionWorldRegistry()` | factory | register / unregister / get providers; `list()` returns secret-free descriptors |
| `executionWorldsComponent(registry)` | component | publishes `filesystem.*` and `process.exec`, routed by `worldId` |
| `localExecutionWorld()` | provider | the local machine (current behaviour) |
| `memoryExecutionWorld()` | provider | deterministic in-process fixture for tests |
| `executionWorldConformance()` | kit | the suite every provider must pass unchanged |

Capability ids: `filesystem.resolve`, `filesystem.stat`, `filesystem.readText`,
`filesystem.writeText`, `filesystem.list`, `filesystem.version`, `process.exec`.

## Why providers, not parallel tools

`ssh_read` / `wsl_bash` / `container_edit` would multiply the model-facing tool catalog by the
number of transports and put transport knowledge in the agent loop. Replacing the *provider* under
one `filesystem.*` / `process.exec` contract moves execution to another machine with zero change to
the tools, the agent, the sessions, the plans, or the approvals. Removing a provider makes its
capabilities resolve `unavailable` — a clean failure, never a silent local fallback. See
`docs/decisions/ADR-0013-execution-worlds-are-providers.md`.

## Testing

`@godspeedai/execution/conformance` exports `executionWorldConformance({ name, create })`; each
provider's test file calls it. It asserts, for any provider: containment rejects escapes, a
missing file is `undefined` not a throw, read/write round-trip, `version` changes with content,
`exec` reports stdout/stderr/exit code, a timeout is `timedOut: true`, an abort cancels, and
`dispose()` is idempotent.