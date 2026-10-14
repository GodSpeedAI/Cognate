# Opt-in Linux child-process execution world

`bubblewrapExecutionWorld` implements the existing filesystem/process ports. It adds no new runtime,
event store, daemon or authorization system. The trusted operator supplies a dedicated workspace,
explicit public runtime directories, and verified patched bubblewrap provenance with the actual
binary SHA-256. The hash is checked before every launch. Unsupported platforms, missing namespaces,
setup failure, changed binary, forbidden mounts/environment and disposed worlds fail closed.

The provider uses new user, PID, network, IPC and UTS namespaces, disables nested user namespaces,
drops capabilities, establishes a new session, clears the environment, mounts selected executables
and libraries read-only, and binds only its workspace read/write. Temporary scratch and minimal
`/dev`/`/proc` are private to the sandbox. `/home`, host `/etc`, host sockets and the host root are
absent. Network egress is denied by the separate network namespace. Both filesystem effects and
process launches go through this namespace; host-side realpath checks improve refusal messages but
are not the enforcement mechanism. Optional Bun binding exposes only the executable, allowing
`tool.run_code`-style nested children to remain contained.

Wall time and combined output are bounded; timeout, abort, disposal and parent termination kill the
namespace's child tree. These are not aggregate CPU, memory, process-count or disk quotas. Those need
delegated cgroups or another enforceable backend before untrusted multi-tenant admission. Runtime
directories and the initial workspace must be audited by the operator: a pre-existing hard link to
sensitive host data is already data inside the workspace. The provider does not contain the host
application, authenticate callers, make arbitrary external effects exactly once, or establish a
production deployment. Independent security review remains required.

The test host uses Ubuntu package `0.11.1-1ubuntu0.3`, newer than the distro fix
`0.11.1-1ubuntu0.2` for [CVE-2026-87766](https://ubuntu.com/security/notices/USN-8779-1).
The upstream `--version` string alone is insufficient evidence of a distro backport.
[Bubblewrap's own security guidance](https://github.com/containers/bubblewrap) makes the caller
responsible for the selected policy. No donor code is copied.

Explicit OS gate:

```sh
COGNATE_BWRAP_TESTS=1 bun test --timeout 15000 packages/execution/test/bubblewrap.test.ts
```

Observed on WSL2 Linux/Bun 1.4.0: ten tests pass, zero failures, 29 assertions. Tests exercise native
filesystem reads/writes, fail-fast symlink/host-secret refusal, denied access to an otherwise reachable
host TCP listener, denied nested user namespaces,
nested Bun children, timeout and cancellation cleanup, bounded output and binary mismatch. A broad
host-root read-only smoke test was used only for initial capability detection; it is not this policy.
