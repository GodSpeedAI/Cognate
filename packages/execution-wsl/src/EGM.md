# execution-wsl / src — provider, session pool, and frame protocol

## Overview

One file implements a WSL distribution as an `ExecutionWorldProvider`. Because `wsl.exe` launches can take seconds, the provider keeps a small pool of persistent `sh -s` sessions per distribution and runs every file operation and command through them as framed requests `[index.ts:ShellSession]`. Steady-state operation therefore launches no `wsl.exe` at all; only session start-up does `[index.ts:checkout]`. File operations reuse the shared `commandFileSystem` script-based port, and commands reuse `execScript`, both from `@godspeedai/cognate-execution` `[index.ts:wslExecutionWorld]`.

## Interface

- `wslExecutionWorld(options: WslWorldOptions): ExecutionWorldProvider` — synchronous factory returning `kind: "wsl"` with distro/user metadata `[index.ts:wslExecutionWorld]`
- `WslWorldOptions` — `worldId`, `distro`, optional `user`, `wslBin`, `defaultTimeoutMs`, `fileOpTimeoutMs`, `sessionStartTimeoutMs`, `maxOutputBytes`, `shellCommand` `[index.ts:WslWorldOptions]`
- `Request` — one framed request with `token`, `pid`, `wait(timeoutMs)`; resumable after reporting pending `[index.ts:Request]`
- `ShellSession` — one long-lived `sh -s` handling one request at a time, with `start`, `tryComplete`, `partial`, `reset`, `close` `[index.ts:ShellSession]`
- `acquirePool` — reference-counted pool keyed by the joined launch command `[index.ts:acquirePool]`

## Invariants

- A frame is complete only when both the stdout marker `<token>:<code>` and the stderr marker `<token>:E` have arrived `[index.ts:tryComplete]`
- Frame tokens are fresh UUIDs per request, so stale bytes from an abandoned frame cannot satisfy a later one `[index.ts:ShellSession]`
- Output is truncated to `maxBytes` per frame, and a session exceeding `bufferLimit` is closed as overflowed `[index.ts:pump]`
- A dead session or an expired deadline yields `done: false` with exit code `-1` instead of hanging `[index.ts:wait]`
- The exec pid is stripped from stdout before the result is returned `[index.ts:tryComplete]`
- Commands run under `setsid` so the whole tree can be killed; the busy session is closed only as a last resort `[index.ts:execIn]`
- A timed-out command whose frame never completes reports exit code `143` with `timedOut: true` `[index.ts:execIn]`
- File operations retry once on a stalled frame and then fail closed with the budget in the message `[index.ts:run]`
- `fileSystem.resolve` is the shared lexical guard, and each port method re-checks that the world is open `[index.ts:wslExecutionWorld]`

## Side Effects

- `Bun.spawn` of the launch command per session, with `stdin: "pipe"` `[index.ts:ShellSession]`
- Writes framed scripts into the session's stdin pipe `[index.ts:start]`
- `kill -s TERM` then `kill -s KILL` against the negative pid from a second session `[index.ts:killGroup]`
- Pool shutdown timer keeps the distribution warm for `SESSION_GRACE_MS` and is `unref`'d so it cannot hold the process open `[index.ts:acquirePool]`
- `dispose` closes in-use sessions and releases the pool reference `[index.ts:wslExecutionWorld]`

## Verification

- Run: `cd packages/execution-wsl && bun test`
