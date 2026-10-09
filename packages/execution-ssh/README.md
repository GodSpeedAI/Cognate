# @godspeedai/cognate-execution-ssh

An SSH host as a Cognate execution world: files over SFTP, commands over remote `exec` — behind the same `filesystem.*` / `process.exec` contracts as every other provider, so nothing above the provider knows it is SSH. Built on the [`ssh2`](https://www.npmjs.com/package/ssh2) package.

**When to use this package:** an agent should read, write, and run commands on a remote machine you can reach over SSH (optionally through a jump host), with host identity verified before anything is sent. For the local machine use [`@godspeedai/cognate-execution`](https://www.npmjs.com/package/@godspeedai/cognate-execution)'s `localExecutionWorld`; for a WSL distribution use [`@godspeedai/cognate-execution-wsl`](https://www.npmjs.com/package/@godspeedai/cognate-execution-wsl).

## Installation

```sh
bun add @godspeedai/cognate-execution-ssh
```

Requires [Bun](https://bun.sh) >= 1.4.0. Depends on `ssh2` and [`@godspeedai/cognate-execution`](https://www.npmjs.com/package/@godspeedai/cognate-execution) (the contracts this provider implements).

## Quick start

```ts
import { sshExecutionWorld } from "@godspeedai/cognate-execution-ssh";

const world = sshExecutionWorld({
  worldId: "build-box",
  host: "build.example.com",
  username: "dev",
  auth: { kind: "key", privateKeyPath: "~/.ssh/id_ed25519" }, // or { kind: "agent" } / { kind: "password", password }
  hostKeys: { fingerprints: ["SHA256:..."] }, // REQUIRED — or { knownHostsPath: "/home/me/.ssh/known_hosts" }
  jump: [ // ProxyJump, optional; each hop is verified like the target
    { host: "bastion.example.com", username: "dev", auth: { kind: "agent" }, hostKeys: { knownHostsPath: "/home/me/.ssh/known_hosts" } },
  ],
});

const path = world.fileSystem.resolve("/srv/workspace", "README.md");
const readme = await world.fileSystem.readText(path);
const result = await world.process.exec({ argv: ["cargo", "test"], cwd: "/srv/workspace", timeoutMs: 300_000 });

console.log(world.metadata); // { host, port, username, auth: "key", hostKey: "SHA256:..." } — safe for logs

await world.dispose();
```

Construction refuses an empty host-key policy outright. A first connection to a new host should go through `probeHostKey`, which reads the server's key and *refuses it* — nothing is authenticated or sent — so a human can decide to pin the fingerprint it printed:

```ts
import { probeHostKey } from "@godspeedai/cognate-execution-ssh";

const probe = await probeHostKey({ host: "build.example.com" });
console.log(probe.fingerprint, probe.keyType, probe.known); // "SHA256:..." "ssh-ed25519" "unknown"
// Show it to a person; pin it in hostKeys.fingerprints or known_hosts before connecting for real.
```

## What it guarantees

- **The server is who you pinned.** Host-key verification is mandatory — no trust-on-first-use, no accept-anything mode. A mismatch raises `HostKeyMismatchError` before authentication is ever attempted and is never retried. Hashed and plain `known_hosts` entries, `[host]:port` forms, wildcards, negation, and `@revoked` markers are honoured; `@cert-authority` entries are ignored (unsupported).
- **Fail closed.** An unreachable host, a changed key, or a disposed world raises `WorldUnavailableError`. Nothing ever falls back to local execution.
- **Containment.** `resolve` rejects lexical escapes, and a symlink inside the root pointing outside is refused before any read/write/stat/list (via SFTP `realpath`).
- **A cancelled command really ends.** Commands run under a supervisor with their own process group, ended on `TERM` or when stdin reaches EOF — so the whole process tree dies even against servers that ignore signal requests or drop the connection.
- **Reconnect.** A dropped connection is re-dialled on the next operation; idempotent file operations retry once, commands and writes never do.
- **Clean disposal.** `dispose()` closes live channels, SFTP, and every hop; it is idempotent, and later operations fail closed.
- **No secrets leak.** `metadata` carries host, port, user, auth *kind*, and the verified host-key fingerprint — never a password, passphrase, or key. Errors never echo credentials either.

## Testing your integration

The `./fixture` subpath exports `startSshFixture` — a real in-process SSH server (ssh2 `Server`) with password/public-key auth, a working `exec`, an SFTP subset, and direct-tcpip forwarding for ProxyJump — so your own tests can run the shared conformance suite from [`@godspeedai/cognate-execution/conformance`](https://www.npmjs.com/package/@godspeedai/cognate-execution) against a genuine SSH client/server pair without an external machine.

## Known limits

- The remote login shell must accept `exec sh -c '<posix script>'`.
- `version` is `mtime(seconds):size`, so two writes within the same second with equal size look unchanged.
- The symlink containment check is check-then-use: a concurrent swap between the check and the operation is not prevented.
- No keyboard-interactive/2FA authentication and no `@cert-authority` support.

## Related packages

- [`@godspeedai/cognate-execution`](https://www.npmjs.com/package/@godspeedai/cognate-execution) — the contracts and conformance suite this provider implements.
- [`@godspeedai/cognate-execution-wsl`](https://www.npmjs.com/package/@godspeedai/cognate-execution-wsl) — the WSL distribution provider.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
