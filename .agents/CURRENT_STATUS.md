# Current status

**Status revision:** 34

**Stage:** CEP/world_ref migration Stage 6 debt closed: governed timeout_secs enforcement, harness governance wiring, flaky CG-PRF-002 fixed

**Summary:** Closed the Stage 6 debt. (1) timeoutSecsEnforcer is real: the Invoker arms its own deadline from the applied timeout_secs constraint, aborts the provider's signal and fails the call with deadline_exceeded; the enforcer refuses actions, where no deadline can be applied, and values outside 1..3600 whole seconds. (2) governanceFromEnv wires governance into the harness profile as an explicit opt-in (COGNATE_GOVERNANCE, COGNATE_SEA_FORGE_SOCKET, COGNATE_WORLD_REF); a wrong or partial environment throws instead of weakening. (3) just sea-forge-live runs the live loop against a real sea-forge-server and fails, never skips, when its prerequisites are missing. (4) CG-PRF-002 flake fixed: React's scheduler fired after happy-dom was unregistered ('window is not defined'); the test now unmounts and drains before unregistering. Per-subject policy and the world-registry cache landed in sea-rs.

**Verified:**
- bun test packages/runtime-bun profiles/harness: 96 pass, 0 fail (8 skipped without live prerequisites); with SEA_FORGE_SERVER_BIN and CEP_REPO: just sea-forge-live 14 pass, 0 skipped
- Live through the real server: per-subject rule bounds bob's capability calls to timeout_secs 1; a slow provider was aborted with deadline_exceeded in under 4s; alice's capability calls stay gated; actions under a timeout constraint are refused
- CG-PRF-002: failed 5 of 18 parallel runs before the fix, 0 of 30 after; just verify 78/78 on 19 of 20 serial runs after the fix (the one failure was AK-006, see limits)
- tsc -p tsconfig.json exit 0

**Limits:**
- One serial just verify run failed AK-006 (RealityTrace characterization, runs a real sxr binary against temp homes) and did not reproduce in 23 further serial runs; cause unknown, likely contention with concurrent processes. Not investigated further.
- Full-suite failure count varies by environment (77, 78, then 68 stable across two runs); failing tests are AG-UI interop, E2E, J-* journeys and archived validation/reconstructions copies, none in code changed here
- Only timeout_secs has an enforcer; other SEA-Forge boundary dimensions (workspace, artifacts_root, env_keys, sandbox_class, max_manager_iterations) are refused until enforcers exist
- Escalation is still refused; durable continuation is Stage 7

**Next:** Stage 7: escalation and durable continuation (escalate -> approval -> revalidated resume)

**Evidence:**
- .agents/evidence/2026-10-05-stage6-debt-closure.md
