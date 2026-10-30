# execution-ssh / src — SSH execution world internals

## Overview

Implements an SSH host as an `ExecutionWorldProvider` from `@godspeedai/cognate-execution`: files move over SFTP, commands over `exec`, and jump hosts chain via `forwardOut` `[index.ts:sshExecutionWorld]`. The world fails closed — an unreachable host, a changed host key, or a disposed world raises `WorldUnavailableError` and nothing falls back to local execution `[index.ts:sshExecutionWorld]`. `fixture.ts` provides a real ssh2 `Server` for deterministic tests and is a test double for the remote end only `[fixture.ts:startSshFixture]`.

## Interface

- `sshExecutionWorld` — builds the world provider with files and process surfaces `[index.ts:sshExecutionWorld]`
- `probeHostKey` — reads a server key, records it, then refuses it so nothing is authenticated `[index.ts:probeHostKey]`
- `HostKeyMismatchError` — `WorldUnavailableError` subclass carrying host and offered fingerprint `[index.ts:HostKeyMismatchError]`
- `HostKeyPolicy` — fingerprints, inline `known_hosts` text, or a `known_hosts` path `[hostKeys.ts:HostKeyPolicy]`
- `verifyHostKey` / `checkKnownHosts` / `fingerprintOf` — re-exported host-identity functions `[hostKeys.ts:verifyHostKey]`
- `startSshFixture` — ssh2 server with password/public-key auth, exec, SFTP subset, and direct-tcpip `[fixture.ts:startSshFixture]`
- `SshWorldOptions` / `SshHop` / `SshAuth` — connection options including `jump` hops outermost first `[index.ts:SshWorldOptions]`

## Invariants

- Every hop must carry a non-empty host-key policy or construction throws `[index.ts:sshExecutionWorld]`
- A revoked known_hosts key is never accepted even if another policy would trust it `[hostKeys.ts:verifyHostKey]`
- `@cert-authority` lines are ignored, and hashed `|1|salt|hash` entries are matched by HMAC-SHA1 `[hostKeys.ts:checkKnownHosts]`
- A path operation runs `guard.assertContained` before every SFTP call, so containment is checked per operation `[index.ts:sshExecutionWorld]`
- Writes are never retried, so a half-completed write surfaces instead of repeating `[index.ts:sshExecutionWorld]`
- Timeouts default to 30 000 ms and output is capped at 10 MiB `[index.ts:DEFAULT_TIMEOUT_MS]`
- SFTP status 2 is treated as "no such file", so a missing path is `undefined` rather than an error `[index.ts:NO_SUCH_FILE]`

## Side Effects

- TCP connections to SSH servers, including forwarded sockets for jump hops `[index.ts:sshExecutionWorld]`
- Remote filesystem mutation through SFTP `writeFile` `[index.ts:sshExecutionWorld]`
- Local host-key file read at connect time when `knownHostsPath` is set `[hostKeys.ts:safeRead]`
- Credential file read when `SshAuth.kind` is `key` with `privateKeyPath`, and `SSH_AUTH_SOCK` env lookup for `agent` auth `[index.ts:authConfig]`
- The fixture binds a local listening socket and runs a real local shell for `exec` `[fixture.ts:startSshFixture]`

## Verification

- Run: `cd packages/execution-ssh && bun test`
