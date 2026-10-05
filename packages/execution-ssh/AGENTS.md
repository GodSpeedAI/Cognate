# packages/execution-ssh

Rules for changing this provider:

- Host-key verification stays mandatory. Never add trust-on-first-use or an accept-all option.
- Never fall back to local execution; every connection/auth/host-key failure is a `WorldUnavailableError`.
- Commands must go through `supervisedExecScript` so cancellation cannot orphan a remote process tree.
- `metadata` and every error message must stay secret-free (no passwords, passphrases, key bodies).
- `ssh2` types stay inside this package; only `@cognate/execution` interfaces cross its boundary.
- Any behaviour change needs a test in `test/ssh.test.ts` and, if it concerns a real server, in
  `tests/live/remote-workspaces.live.ts`.
