# Evidence — Remote Workspaces T3–T6 (SSH and WSL execution worlds), 2026-10-04

Plan: `.agents/plans/remote-workspaces.md`. Debt: DEBT-026 (and DEBT-023 progress).

## Commands and results (final code)
| Command | Result |
| --- | --- |
| `bun x tsc --noEmit -p tsconfig.json` ; harness `tsconfig.json` | exit 0 / exit 0 |
| `bun test packages/execution packages/execution-ssh packages/execution-wsl` | 69 pass / 0 fail (ssh 24, wsl 19, execution 26) |
| harness `bun test test` (aimock, real SQLite, real Chromium) | 96 pass / 0 fail / 29 files (new: `J-RW-ssh-workspaces` 4, `E2E-remote-workspaces` 1, `executionWorlds` 5) |
| `just verify` ; `just gates` | exit 0, 78/78 ; exit 0, 78/78 |
| `just remote-workspaces-live` (real OpenSSH 10.0p1 `sshd` built in user space + real WSL `Ubuntu-24.04`; providers and the full app) | 6 consecutive clean runs on the final code: 31 pass / 0 fail, 9 skip (the optional own-host suite, enabled by `COGNATE_SSH_HOST`), ~40–70 s each; no leaked `sleep`/`wsl.exe` processes afterwards |

## What the live gate proves
- Real sshd: key auth, host-key pin/known_hosts (including an `ssh-keygen -H` hashed entry), a wrong key refused before auth,
  a timeout/abort/dispose ends the command **and its whole process tree**, connection reuse and re-dial after the server
  kills every session, ProxyJump through the same sshd, symlink and path escape refused, down server fails closed.
  At application level: probe → pin → key-auth connect → workspace → agent read/bash/edit through sshd (`SSH_CONNECTION`,
  set only by sshd, is present remotely and empty locally) → restart → check → drop → reconnect; no key material in events.
- Real WSL: shared conformance suite, a timeout ends the command inside the distro, quoting/newline/non-ASCII round-trips;
  at application level: connect a distro, workspace inside it, agent read/bash/edit run there (distro `VERSION_ID`
  differs from this host's) and nothing is written locally.

## Defects found and fixed by the real servers (the mock would not have shown them)
- `dash` rejects `kill -TERM -- -PGID`; the group kill silently fell back to the leader, so process *trees* survived (fixed: `kill -s`).
- A real sshd without a pty does not end a command when its channel closes (fixed: supervisor ends the group on TERM or stdin EOF).
- OpenSSH resets connections accepted by the kernel before it is serving; readiness must wait for the SSH banner.
- Per-operation `wsl.exe` launches stalled intermittently (WSL: `UtilAcceptVsock accept4 failed 110`); replaced by pooled sessions.
- The harness `stop()` did not dispose the world registry (SSH connections leaked); `workspace.select` re-select of a remote
  workspace would have re-added it as local; UTF-16/UTF-8 detection in `wsl.exe` list parsing was inverted for UTF-8.

## Not verified / not claimed
- Native Windows host running Bun; SSH `@cert-authority`, keyboard-interactive/2FA; a real third-party SSH host
  (`COGNATE_SSH_HOST` suite is wired but was not run — no host was provided).
- WSL itself remains intermittently unhealthy on this machine; earlier iterations of the gate failed ~1 run in 5 from
  WSL's own errors. See DEBT-026.
