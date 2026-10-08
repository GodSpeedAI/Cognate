# @godspeedai/execution-ssh — an SSH host as an execution world

`sshExecutionWorld(options)` is an `ExecutionWorldProvider`: files over SFTP, commands over `exec`,
behind the same `filesystem.*` / `process.exec` contracts as every other world. Nothing above the
provider knows it is SSH.

```ts
const world = sshExecutionWorld({
  worldId: "build-box", host: "build.example.com", username: "dev",
  auth: { kind: "key", privateKeyPath: "~/.ssh/id_ed25519" },     // or { kind: "agent" } / { kind: "password", password }
  hostKeys: { fingerprints: ["SHA256:…"] },                       // or { knownHostsPath } — REQUIRED
  jump: [{ host: "bastion", username: "dev", auth: { kind: "agent" }, hostKeys: { knownHostsPath } }], // ProxyJump
});
```

## What it guarantees

| Guarantee | How |
| --- | --- |
| The server is who you pinned | A host-key policy is mandatory; no TOFU, no accept-anything mode. Mismatch → `HostKeyMismatchError`, never retried, raised before any authentication. Hashed/plain `known_hosts`, `[host]:port`, wildcards, negation and `@revoked` are honoured. |
| Trust is a human act | `probeHostKey()` reads the key and *refuses* it, so nothing is authenticated or sent; show the fingerprint to a person, then pin it. |
| Fail closed | An unreachable host, changed key or disposed world raises `WorldUnavailableError`. Nothing ever falls back to local execution. |
| Containment | `resolve` rejects lexical escapes; a symlink inside the root pointing outside is refused before read/write/stat/list (SFTP `realpath`). |
| A cancelled command really ends | Commands run under a supervisor: own process group, ended on `TERM` **or** when stdin reaches EOF (closed channel, dropped connection) — so it works against servers that ignore signal requests, and the whole process *tree* dies. |
| Reconnect | A dropped connection is re-dialled on the next operation; idempotent file operations retry once, commands and writes never do. |
| Disposal | `dispose()` closes live channels, SFTP and every hop; idempotent; later calls fail closed. |
| No secrets leak | `metadata` carries host, port, user, auth *kind* and the verified host-key fingerprint — never a password, passphrase or key. |

## Testing

- `test/ssh.test.ts` runs the shared conformance suite and every behaviour above against a real
  ssh2 `Server` (`./fixture`: auth, `exec` on a real shell, an SFTP subset, direct-tcpip forwarding).
- The live gate (`just remote-workspaces-live`) runs the same suite against a **real OpenSSH sshd**
  built in user space (`just setup-openssh`), and optionally against your own host
  (`COGNATE_SSH_HOST`, `COGNATE_SSH_USER`, `COGNATE_SSH_KEY`).

## Known limits

Remote login shell must accept `exec sh -c '<posix script>'`. `version` is `mtime(seconds):size`. The
symlink check is check-then-use (a concurrent swap between check and use is not prevented). No
keyboard-interactive/2FA, no `@cert-authority`. See `.agents/DEBT.md` (DEBT-026).
