# Plan — Remote Workspaces (Execution Worlds)

**Feature (user-facing):** Remote Workspaces.
**Abstraction (architecture):** Execution World.
**Branch:** `cognate/harness`. **Normative method:** the `building-with-cognate` skill
(`.agents/skills/building-with-cognate/SKILL.md`) and its companions
`deriving-interaction-domain-models` and `domainforge-sea`.

## Problem

The DeepSeek Harness reconstruction's model-facing tools (`read`, `edit`, `bash`,
`run_code`) call `node:fs` and `Bun.spawn` directly
(`validation/reconstructions/deepseek-harness/cognate/src/capabilities/tools.ts`). A
workspace is a local OS path (`workspace.path` → `{ path }`). There is no seam where a
different execution location (SSH host, later WSL/container) can be substituted without
changing the tools or the agent loop.

## Target direction

```
.sea / workspace semantics
  → Workspace            (identity, title, execution-world reference, provider-owned root)
  → ExecutionWorld       (local | ssh | wsl | container…)
  → framework-owned capability contracts (filesystem.*, process.*)
  → replaceable providers
```

Invariant: `tool.read`, `tool.edit`, `tool.bash`, `tool.run_code`, agents, sessions,
plans, approvals, subagents and the model-facing tool definitions never learn whether the
workspace is local or remote. A workspace decides **where** the capability executes.

## Donor

`UynajGI/dsh-ssh` (MIT), cloned to `.tmp/ref/dsh-ssh` (git-ignored), pinned at
`9c344efb9bef13ad942b4e9ea16c203fb0095632`. Reference for mechanism only — no runtime
dependency, no DeepSeek/Cordis/`@deepseek-ai/*` types. Provenance:
`.agents/evidence/remote-workspaces-donor-provenance.md`.

## Tranches (dependency order)

### T1 — Model and characterize
Derive the IDM additions in `.sea/interaction/interaction-model.sea` for: select/create an
execution world; add a workspace in that world; read a remote file; edit a remote file;
execute a command remotely; cancellation/timeout; connection failure; reconnect; local and
remote coexisting; switching without changing tool/agent semantics. Update the journey
catalog, translation map, assumptions, and handoff. Validate with the DomainForge CLI.
**Gate:** `domainforge validate/parse` clean; `just verify` substrate check still green.

### T2 — Extract the local execution provider (framework-owned contracts)
New framework package `@cognate/execution`: framework-owned `FileSystemPort`,
`ProcessPort`, `ExecutionWorldProvider`, an `ExecutionWorldRegistry`, the
`executionWorldsComponent` that publishes `filesystem.*` / `process.*` capabilities, a
`localExecutionWorld` provider (preserves current behaviour), a deterministic
`memoryExecutionWorld` fixture, and an `executionWorldConformance` kit. Refactor the
reconstruction so `tools.ts` invokes the capabilities instead of touching `node:fs` /
`Bun.spawn`; `workspace.path` returns `{ root, executionWorldId }`; the `workspaces`
projection carries `executionWorldId`. Existing harness journeys stay green.
**Success criterion:** removing the local provider makes dependent execution capability
resolution fail cleanly (no local fallback); restoring it re-enables the behaviour with no
change to the tool implementations.

### T3 — SSH execution-world provider
`@cognate/execution-ssh` over `ssh2`, behind the same contracts: persistent connection
reuse, SFTP filesystem, remote subprocess execution, cwd, timeout, cancellation,
key/password/agent auth, host-key verification, ProxyJump, clean disposal. Fail closed —
never fall back to local execution. Deterministic fixture test for the normal suite; a
separately runnable live integration gate (`scripts/remote-workspaces-live.ts`).

### T4 — Workspace routing
`Workspace` gains `executionWorldId` + provider-owned `root`; `workspace.select` accepts a
world; durable state carries only safe connection metadata + secret references. No fake
local placeholder directories for remote roots.

### T5 — End-to-end SSH journeys
Journey tests named after the catalog ids: local still works; SSH workspace registers;
`read`/`edit`/`bash` hit the remote; cwd corresponds to the remote root; no SSH branch in
the agent/tool loop; switching back restores local; remote failure never falls back;
path escape denied; cancellation aborts the remote path; restart preserves safe metadata;
secrets never enter SQLite/event/projection payloads; disposal closes SSH/SFTP resources.

### T6 — WSL provider or bounded follow-up
Decide whether a WSL execution-world provider can be implemented cleanly now; otherwise
produce a contract proof that it fits the same `filesystem.*` / `process.*` contracts
without changing consumers.

## Naming

- User-facing: **Remote Workspaces**.
- Abstraction: **Execution World**.
- Capability ids describe *what* is provided: `filesystem.*`, `process.*`, `workspace.*`
  (checked against the existing namespace before adoption).
- No `ssh_read` / `ssh_bash` / `wsl_*` parallel tools.

## Security invariants

Default deny; capability invocation stays policy-checked; path containment enforced by the
provider/contract boundary; no fallback from failed remote execution to local execution;
host identity verified; secrets outside durable event history; remote roots cannot escape
into unrelated workspaces; cancellation and cleanup explicit; provider selection cannot
grant authority; execution-world selection does not bypass approval/sandbox policy.
`read-only` / `workspace-write` / `full-access` semantics are preserved — a remote
workspace is not an authority escape hatch.

## Verification

Narrow gates per tranche, then the reconstruction tests, architecture tests, typecheck,
`just verify`, `just gates`, plus the new live SSH gate. Record exact commands and results.
Completion requires the canonical journeys to settle through the real Cognate
agent/tool/workspace path with the local provider behaviourally intact.


## Status (2026-10-04)

| Tranche | State | Evidence |
| --- | --- | --- |
| T1 model + journey catalog | done (commit `953f556`) | `.sea/interaction/` |
| T2 local provider, contracts, conformance kit | done (commit `953f556`) | `packages/execution` |
| T3 SSH provider | done | `packages/execution-ssh` (23 hermetic tests incl. conformance); live gate against a real OpenSSH sshd |
| T4 workspace routing + runtime world management | done | `execution.world.*` capabilities, `execution-worlds` projection, boot restore, bindings to `ExecutionWorld` / `WorldConnection` |
| T5 end-to-end journeys | done | `J-RW-ssh-workspaces` (4 tests naming all ten catalog journeys), `E2E-remote-workspaces` (browser), live app journeys |
| T6 WSL | **implemented, not just proven** | `packages/execution-wsl` (19 hermetic tests incl. conformance and pool behaviour); live gate against a real distro |
| Live gate | `just remote-workspaces-live` | real `sshd` built in user space (`just setup-openssh`) + real WSL distro |

### Decisions and deviations from the route above
- **Host trust is probe-then-pin.** The provider has no trust-on-first-use; `execution.world.probe` reads the
  key and refuses it, a human confirms the fingerprint in the dialog, and `connect` pins it.
- **Commands are supervised** (own process group; ended on TERM or stdin EOF) because a real sshd without a
  pty does not end a command when its channel closes.
- **WSL runs everything over a pool of persistent shell sessions** instead of a `wsl.exe` launch per
  operation (launches stall intermittently at the Windows level); commands get their own process group and
  are killed from a second session on timeout/abort.
- Secrets live only in the 0600 secret store; events/projections carry safe metadata and the pinned fingerprint.
- Not done: SSH `@cert-authority`, keyboard-interactive/2FA, a native-Windows-host run of the WSL provider (DEBT-026).
