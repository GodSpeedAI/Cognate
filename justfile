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

# Regression baseline: substrate check, typecheck, gate-runner tests, and every gate claimed implemented
verify: check typecheck
    bun test ./tests/proof-routing.test.ts
    bun scripts/gate.ts --implemented

# Run one requirement's proof gate, e.g. `just gate CG-KRN-001`; unmet gates fail
gate id:
    bun scripts/gate.ts {{id}}

# Report every ledger gate (PASS/FAIL) and status drift; exits non-zero while any gate is unmet
gates:
    bun scripts/gate.ts --all

# Install the pinned RealityTrace CLI release (v0.3.0, adds ingest --extensions) used by AK-006 and CG-RT-002 (no local checkout needed)
setup-realitytrace:
    cargo install --git https://github.com/GodSpeedAI/RealityTrace --tag realitytrace-v0.3.0 realitytrace --locked --root .tmp/realitytrace

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


