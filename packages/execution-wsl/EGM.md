# packages/execution-wsl — a WSL distribution as an execution world

## Overview

WSL distribution used as an execution world: filesystem and process ports over `wsl.exe -e sh -s`, with the same contracts as every other provider `[package.json:description]`. The single export subpath points at one source file, and the only dependency is the `@godspeedai/cognate-execution@workspace:*` contract package `[package.json:exports]`. The provider never falls back to local execution: an unavailable distro surfaces as `WorldUnavailableError` from the shared contract package `[src/index.ts:wslExecutionWorld]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — the `wslExecutionWorld` provider, session pool, and framed request protocol
- test/ — conformance plus WSL-specific session-pool tests that drive `shellCommand` with local `sh -s`; no separate contract

## Global Invariants

- The default launch command is `wsl.exe -d <distro> [-u <user>] --cd / -e sh -s`; `shellCommand` overrides it wholesale for tests `[src/index.ts:wslExecutionWorld]`
- Pool identity is the joined launch command, so two worlds naming the same command share one pool `[src/index.ts:acquirePool]`
- Idle pools are held for a 20 s grace period after the last world releases them, with the timer unref'd `[src/index.ts:acquirePool]`
- At most four idle sessions are retained per pool; a session that is unhealthy or over the cap is closed `[src/index.ts:wslExecutionWorld]`
- Every operation after `dispose` throws `WorldUnavailableError` rather than reaching the distribution `[src/index.ts:wslExecutionWorld]`
- Session start-up retries once and then fails closed with the distro name in the message `[src/index.ts:wslExecutionWorld]`

## Global Side Effects

- Spawns `wsl.exe` child processes through `Bun.spawn` with piped stdin, stdout, and stderr `[src/index.ts:wslExecutionWorld]`
- Kills a timed-out or aborted command's process group with TERM then KILL from a second session `[src/index.ts:wslExecutionWorld]`
- Module-level `pools` map survives across worlds in the same process `[src/index.ts:acquirePool]`

## Verification

- Run: `cd packages/execution-wsl && bun test`
