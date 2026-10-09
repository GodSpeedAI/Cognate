# Cognate workspace commands. `just verify` is the regression baseline; `just gates` reports every ledger gate honestly.

# Inspect available commands and prerequisites
setup:
    @bun --version
    @just --version

# Launch the Artifact Viewer over the documentation tree (loopback only; Ctrl+C to stop)
show-documents *args:
    bun scripts/show-documents.ts {{args}}

# Show the latest complete agent status without reading its history
status:
    @tail -n 1 .agents/CURRENT_STATUS.yaml

# Check workbench routing, ledger identities, statuses, and debt bindings
check:
    bun run check

# Type-check every package, profile, test, and script
typecheck:
    bun run typecheck

# Run every workspace test, including contract suites still RED for unimplemented requirements
test:
    bun run test

# Published-package README gate (docs/package-readme-standard.md)
docs:
    bun scripts/check-readmes.mjs

# Regression baseline: substrate check, typecheck, gate-runner tests, README gate, and every gate claimed implemented
verify: check typecheck docs
    bun test ./tests/proof-routing.test.ts
    bun scripts/gate.ts --implemented

# Run one requirement's proof gate, e.g. `just gate CG-KRN-001`; unmet gates fail
gate id:
    bun scripts/gate.ts {{id}}

# Report every ledger gate (PASS/FAIL) and status drift; exits non-zero while any gate is unmet
gates:
    bun scripts/gate.ts --all

# Install the pinned RealityTrace CLI from crates.io (0.3.0, adds ingest --extensions) used by AK-006 and CG-RT-002 (no local checkout needed)
setup-realitytrace:
    cargo install realitytrace --version 0.3.0 --locked --root .tmp/realitytrace

# Install the pinned, checksum-verified pg0 binary (v0.15.2: PostgreSQL 18.1 + pgvector) into .tmp/pg0
db-setup:
    bun scripts/setup-pg0.ts

# Start the local pg0 PostgreSQL instance used by store-postgres tests and apps (starts if needed)
db-up:
    bun scripts/db.ts up

# Stop the local pg0 PostgreSQL instance (data persists under ~/.pg0/instances)
db-down:
    bun scripts/db.ts down

# Show the local pg0 instance status and connection URI
db-status:
    bun scripts/db.ts status

# Apply the store-postgres versioned schema migrations to the local instance
db-migrate:
    bun scripts/db.ts migrate

# Dump the Cognate schema from the local instance into .tmp/backups/
db-backup:
    bun scripts/db.ts backup

# Restore a backup file written by db-backup into the local instance
db-restore *args:
    bun scripts/db.ts restore {{args}}

# Build a user-space OpenSSH (sshd) into .tmp/openssh for the live remote-workspace gate (no root, no system install)
setup-openssh:
    bun scripts/setup-openssh.ts

# Live gate: SSH and WSL execution-world providers and the full app against a REAL sshd and a REAL WSL distro (fails, never skips, without them)
remote-workspaces-live:
    bun scripts/remote-workspaces-live.ts

# Live CEP authority loop: real sea-forge-server + DomainForge CLI + CEP validators. Fails, never skips.
# Needs SEA_FORGE_SERVER_BIN (built in sea-rs: cargo build -p sea-forge-server), `domainforge` on PATH, CEP_REPO,
# the pinned RealityTrace binary (`just setup-realitytrace`, or SXR_BIN) and cargo (its verifier runs `cargo test`).
sea-forge-live:
    #!/usr/bin/env bash
    set -euo pipefail
    fail() { echo "sea-forge-live: $1" >&2; exit 1; }
    [ -n "${SEA_FORGE_SERVER_BIN:-}" ] && [ -x "$SEA_FORGE_SERVER_BIN" ] || fail "SEA_FORGE_SERVER_BIN must name an executable sea-forge-server"
    [ -n "${CEP_REPO:-}" ] && [ -d "$CEP_REPO" ] || fail "CEP_REPO must name a canonical-evaluation-protocol checkout"
    command -v domainforge >/dev/null || fail "the domainforge CLI must be on PATH"
    command -v uv >/dev/null || fail "uv is required to run the CEP validators"
    command -v cargo >/dev/null || fail "cargo is required: RealityTrace's verifier runs cargo test"
    sxr_bin="${SXR_BIN:-.tmp/realitytrace/bin/realitytrace}"
    [ -x "$sxr_bin" ] || fail "RealityTrace binary not found at $sxr_bin (run just setup-realitytrace, or set SXR_BIN)"
    out=$(bun test packages/runtime-bun/test/sea-forge-live.test.ts packages/runtime-bun/test/sea-forge-authority.test.ts tests/integration/governed-settlement.live.test.ts 2>&1) && status=0 || status=$?
    echo "$out" | tail -8
    [ "$status" -eq 0 ] || fail "tests failed"
    if echo "$out" | grep -Eq '^ *[1-9][0-9]* skip'; then fail "tests were skipped; a skip is not a pass"; fi

# Launch the DeepSeek reconstruction harness (mock model on :4010, workspace, and Cognate Console on :3180)
harness-up *args:
    bun scripts/harness.ts up {{args}}

# Tear down the running DeepSeek reconstruction harness
harness-down *args:
    bun scripts/harness.ts down {{args}}

# Launch the reconstructed Cognate Copilot app (Cognate UI & Runtime on :3190, AG-UI on :3190/agui)
copilot-up *args:
    bun scripts/copilot.ts up {{args}}

# Tear down the running reconstructed Cognate Copilot app
copilot-down *args:
    bun scripts/copilot.ts down {{args}}


