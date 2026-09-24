# Current substrate commands. Product build/dev arrive with the runtime packages.

# Inspect available commands and prerequisites
setup:
    @bun --version
    @just --version
    @python3 --version

# Show the latest complete agent status without reading its history
status:
    @tail -n 1 .agents/CURRENT_STATUS.yaml

# Check workbench routing, ledger identities, and proof bindings
check:
    bun run check

# Run the current substrate and Phase 0 Bun fixtures
test:
    bun run test

# Check the current substrate (not full product acceptance)
verify: check test

# Prove Bun SQLite transaction, optimistic append, rollback, and reopen behavior
gate-ak-001:
    bun test compatibility/phase0/sqlite.test.ts

# Remaining candidate gates fail until real fixtures are authored
gate-ak-002:
    bun scripts/unmet-gate.ts AK-002

gate-ak-003:
    bun scripts/unmet-gate.ts AK-003

gate-ak-004:
    bun scripts/unmet-gate.ts AK-004

gate-ak-005:
    bun scripts/unmet-gate.ts AK-005

gate-ak-006:
    bun scripts/unmet-gate.ts AK-006

gate-ak-007:
    bun scripts/unmet-gate.ts AK-007
