# Current status

**Status revision:** 30

**Stage:** Remote Workspaces T3-T6: SSH and WSL execution worlds implemented, bound to the model, surfaced in the console, and verified against a real OpenSSH sshd and a real WSL distribution

**Summary:** @cognate/execution-ssh (ssh2: mandatory host-key verification, probe-then-pin trust, SFTP, supervised commands that end whole process trees, ProxyJump, reconnect, fail-closed, symlink-safe containment) and @cognate/execution-wsl (pooled persistent shell sessions so steady state launches no wsl.exe) pass the shared conformance suite hermetically and live. The harness can connect, check and disconnect worlds at runtime (secrets only in the 0600 secret store; safe metadata + pinned fingerprint durable; restart rebuilds worlds), the Add-workspace dialog has SSH/WSL tabs with fingerprint confirmation, saved connections, plain-language errors, a sidebar badge and an unreachable-world banner, and all ten catalogued Remote Workspaces journeys have named tests.

**Verified:**
- tsc root+harness exit 0; execution packages 69/0; harness suite 96/0 (incl. J-RW-ssh-workspaces, E2E-remote-workspaces); just verify 78/78; just gates 78/78
- just remote-workspaces-live: 6 consecutive clean runs on the final code (31 pass, 0 fail) against real OpenSSH sshd (built in user space) and real WSL Ubuntu-24.04; no leaked processes
- Real servers exposed and drove fixes for dash kill syntax, sshd channel-close semantics, sshd readiness, wsl.exe launch stalls, registry disposal, remote re-select, wsl list decoding

**Limits:**
- WSL's own service fails intermittently on this machine (UtilAcceptVsock accept4 failed 110): earlier iterations of the live gate failed ~1 run in 5; steady state no longer launches wsl.exe but session start-up still does (DEBT-026)
- The optional own-host SSH suite (COGNATE_SSH_HOST) was not run: no host provided
- Native Windows host, @cert-authority, keyboard-interactive/2FA not covered; SSH containment is check-then-use; version is mtime-seconds:size (DEBT-026)
- Cognitive-navigation capabilities remain unbound to .sea (DEBT-023); execution-world capabilities are now bound
- Work is uncommitted in the working tree pending operator decision

**Next:** Operator decision on commit/push of this tranche; then a live-gate run against your own SSH host (COGNATE_SSH_HOST/USER/KEY) and a native-Windows WSL run

**Evidence:**
- .agents/evidence/2026-10-04-remote-workspaces-ssh-wsl.md
- .agents/evidence/remote-workspaces-donor-provenance.md
- .agents/plans/remote-workspaces.md
