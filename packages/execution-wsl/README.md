# @cognate/execution-wsl — a WSL distribution as an execution world

`wslExecutionWorld({ worldId, distro, user? })` is an `ExecutionWorldProvider` over `wsl.exe`. Roots
are POSIX paths *inside the distribution*; no Windows path ever enters the contract.

## Design: launch `wsl.exe` as rarely as possible

`wsl.exe` is the fragile part. Launching it takes seconds on a cold distro, and under load the
Windows WSL service intermittently stalls or fails launches — plain `wsl.exe -e true` was measured
taking 9–20 s, and WSL itself logs `UtilAcceptVsock:280: accept4 failed 110` when its Windows↔Linux
handshake times out. So the provider keeps a small **pool of persistent `sh -s` sessions** per
distribution and runs *everything* through them as framed requests (stdout, stderr and exit status
come back between unique markers):

- **File operations** and **commands** both run in pooled sessions. In steady state an agent run
  launches no `wsl.exe` at all (a 150 s soak ran 1370 commands with zero stalls); only session start-up
  does, and a session that fails to come up is replaced once before the world fails closed.
- A **command** runs in its own session/process group (`setsid`). On timeout or abort the group is
  killed from a *second* session, and the busy session is closed as a last resort (closing `wsl.exe`
  ends everything it started) — so the whole process tree dies, not just its leader.
- Commands run in parallel in separate sessions; idle sessions return to the pool (max 4) and close
  after a short grace period once no world uses them. A session's lifetime is bound to a stdin pipe, so
  it ends by itself if the host process dies. Holding sessions also keeps the distribution running,
  which WSL would otherwise idle-shut-down.
- Failure is never silent and never local: a missing `wsl.exe`, an unreachable distro, or a disposed
  world raises `WorldUnavailableError`.
- Files are built from one command primitive (`commandFileSystem` in `@cognate/execution`), so the same
  shape fits containers.

## Testing

Hermetic (`test/wsl.test.ts`, 19 tests): the shared conformance suite plus pool behaviour, run
against a real local `sh` through the `shellCommand` seam. Live: `just remote-workspaces-live` runs the
same suite against a real distribution (`COGNATE_WSL_DISTRO`, default `Ubuntu-24.04`).

## Limits

Exercised from inside WSL (Linux host with Windows interop); a native Windows host running Bun is
untested. WSL's own service can still fail a session start-up (reported with `wsl.exe`'s message).
See `.agents/DEBT.md` DEBT-026.
