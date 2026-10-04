# Donor provenance — Remote Workspaces (SSH execution world)

| Field | Value |
| --- | --- |
| Repository | `UynajGI/dsh-ssh` (studied in disposable `.tmp/ref/dsh-ssh`, git-ignored, not committed) |
| Revision | `9c344efb9bef13ad942b4e9ea16c203fb0095632` |
| License | MIT |
| Problem studied | How a coding harness can run its read/edit/shell tools on another machine without the tools knowing. |
| Distinctions retained | One authenticated connection reused across operations; a lazily-opened shared SFTP channel; ProxyJump as a chain of `forwardOut` hops; commands wrapped as `cd -- <cwd> && …`; cancellation by closing the channel. |
| Rejected | `strict = false` host-key checking (no verification) — replaced by mandatory pinned/known_hosts verification; a connection-registry file holding plaintext passwords — replaced by the 0600 secret store with only safe metadata in durable state; `ssh://` cwd routing inside the tools — replaced by `executionWorldId` on the workspace and the framework `filesystem.*`/`process.exec` contracts; parallel `ssh_*` tools. |
| Direct adaptation | None. All code is original; only the mechanism above was studied. No donor branding or types appear in runtime semantics. |
| Beyond the donor | Fail-closed semantics; symlink-safe containment; supervised commands that end the whole process tree even when the server ignores signals; probe-then-pin host trust; a conformance suite every provider must pass; a live gate against real OpenSSH. |
