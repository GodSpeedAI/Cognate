# @godspeedai/cognate-execution-wsl

A WSL distribution as a Cognate execution world: filesystem and process ports implemented over `wsl.exe`, behind the same contracts as every other provider — so an agent's tools run inside Linux while the host stays wherever it is. Roots are POSIX paths *inside the distribution*; no Windows path ever enters the contract.

**Where it works:** this provider is exercised on a Linux host running inside WSL with Windows interop (`wsl.exe` on the `PATH`). A native Windows host running Bun is untested, and the provider is meaningless without a WSL installation and a distribution to target. If you just need "a Linux box", [`@godspeedai/cognate-execution-ssh`](https://www.npmjs.com/package/@godspeedai/cognate-execution-ssh) is the more portable remote provider.

## Installation

```sh
bun add @godspeedai/cognate-execution-wsl
```

Requires [Bun](https://bun.sh) >= 1.4.0, a WSL installation reachable via `wsl.exe` (override the binary with `wslBin`), and [`@godspeedai/cognate-execution`](https://www.npmjs.com/package/@godspeedai/cognate-execution), whose contracts this provider implements.

## Quick start

```ts
import { wslExecutionWorld } from "@godspeedai/cognate-execution-wsl";

const world = wslExecutionWorld({ worldId: "ubuntu", distro: "Ubuntu-24.04" });

const path = world.fileSystem.resolve("/home/me/project", "README.md");
const readme = await world.fileSystem.readText(path);
const result = await world.process.exec({ argv: ["cargo", "test"], cwd: "/home/me/project", timeoutMs: 300_000 });
console.log(result.exitCode, result.stdout, result.timedOut);

await world.dispose();
```

## Design: launch `wsl.exe` as rarely as possible

`wsl.exe` is the fragile part of the stack — launching it takes seconds on a cold distribution, and under load the Windows WSL service intermittently stalls or fails launches (a plain `wsl.exe -e true` has been measured taking 9–20 seconds). The provider therefore keeps a small pool of persistent `sh -s` sessions per distribution and runs *everything* through them as framed requests (stdout, stderr, and exit status return between unique markers):

- In steady state an agent run launches no `wsl.exe` at all; only session start-up does. A session that fails to come up is replaced once before the world fails closed.
- A command runs in its own process group (`setsid`). On timeout or abort the group is killed from a second session, and the busy session is closed as a last resort — closing `wsl.exe` ends everything it started, so the whole process tree dies.
- Commands run in parallel in separate sessions; idle sessions return to the pool (up to 4) and close after a short grace period once no world uses them. A session's lifetime is bound to its stdin pipe, so it ends by itself if the host process dies. Holding sessions also keeps the distribution from being idled shut down by WSL.
- File operations build on `commandFileSystem` from [`@godspeedai/cognate-execution`](https://www.npmjs.com/package/@godspeedai/cognate-execution), so the same shape fits containers.
- Failure is never silent and never local: a missing `wsl.exe`, an unreachable distribution, or a disposed world raises `WorldUnavailableError`.

## Options

| Option | Meaning |
| --- | --- |
| `worldId`, `distro` | registry name and the WSL distribution to target |
| `user?` | Linux user inside the distribution (`wsl.exe -u`); omit for the default |
| `wslBin?` | path to the `wsl.exe` binary (default: `wsl.exe` on the `PATH`) |
| `defaultTimeoutMs?` | default command timeout (30 s) |
| `fileOpTimeoutMs?` | stall budget for one file operation on an established session (restarted and retried once) |
| `sessionStartTimeoutMs?` | how long a fresh session may take to come up |
| `maxOutputBytes?` | per-command output cap (10 MiB) |
| `shellCommand?` | test seam replacing the whole launch command (must read the script from stdin like `sh -s`) |

## Limits

- Exercised from inside WSL (Linux host with Windows interop); a native Windows host running Bun is untested.
- WSL's own service can still fail a session start-up; the error reports `wsl.exe`'s message rather than falling back to local execution.
- Containment uses `realpath`-based checks (check-then-use); a concurrently swapped symlink is not prevented.

## Related packages

- [`@godspeedai/cognate-execution`](https://www.npmjs.com/package/@godspeedai/cognate-execution) — the contracts and conformance suite this provider implements.
- [`@godspeedai/cognate-execution-ssh`](https://www.npmjs.com/package/@godspeedai/cognate-execution-ssh) — the SSH host provider, a portable alternative.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
