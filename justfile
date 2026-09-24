# Cognate workspace commands. `just verify` is the regression baseline; `just gates` reports every ledger gate honestly.

# Inspect available commands and prerequisites
setup:
    @bun --version
    @just --version

# Show the latest complete agent status without reading its history
status:
    @tail -n 1 .agents/CURRENT_STATUS.yaml

# Check workbench routing, ledger identities, statuses, and debt bindings
check:
    bun run check

# Run workspace tests (packages, properties, integration, architecture)
test:
    bun run test

# Regression baseline: substrate check plus workspace tests
verify: check test

# Run one requirement's proof gate, e.g. `just gate CG-KRN-001`; unmet gates fail
gate id:
    bun scripts/gate.ts {{id}}

# Report every ledger gate (PASS/FAIL) and status drift; exits non-zero while any gate is unmet
gates:
    bun scripts/gate.ts --all

# Backward-compatible alias for the SQLite Phase 0 fixture
gate-ak-001:
    bun scripts/gate.ts AK-001
