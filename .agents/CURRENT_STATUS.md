# Current status

**Status revision:** 29

**Stage:** Cybernetic navigation proof on the DeepSeek harness: world identity/lineage, Case, affordance field, mediation + Sentinel, semantic Surfaces, Cognitive Frame, bounded search, method review, shared attention (WebMCP) — proven by journeys; CubeSandbox absent

**Summary:** The harness now holds a Case around a human's desired difference: content-addressed worlds (worldHash != repoSha) with event-sourced lineage, frozen criterion with observer coverage, candidate worlds forked into disposable execution worlds, Sentinel-preserved approval over a lower-trust mod, RiskPreflight Surface on a durable continuation that survives restart, LiveVerify, human-only settlement, bounded search rounds, candidate-only method recommendations, and shared attention (FocusContext, ui_* tools, WebMCP adapter). Remote-workspaces migration was finished first (operator choice) to restore a green baseline.

**Verified:**
- harness tsc exit 0; bun test (harness) 86 pass/0 fail incl. 7 new journeys + 2 unit suites + 3 browser journeys (aimock, real Chromium, live RealityTrace SXR 0.3.0)
- bun test packages/execution 26/0
- just verify exit 0 (78/78); just gates 78/78 on serial re-run (first run 77/78: CG-PRF-002 transient flake, standalone exit 0)

**Limits:**
- CubeSandbox not installed or exercised: no /dev/kvm, no sudo (DEBT-022); forks are local directory copies
- New cognitive capabilities are not bound to .sea anchors (DEBT-023)
- Spec gaps listed in DEBT-024 (Case creation UI, criterion.revise, parallel search, recovery to prior world, payment estimates, plan deviation, further method controls)
- WebMCP verified against a polyfilled registry only; approval card renders before its continuation exists (DEBT-025)
- Remote-workspaces T3-T6 (SSH/WSL providers) are NOT done; only the T2 local provider and routing needed for a green baseline were completed
- Committed as two commits on cognate/harness: the remote-workspaces migration (execution worlds as providers), then this proof

**Next:** Push review; then DEBT-022 on a KVM host and DEBT-023 once the .sea tree is clean; remote-workspaces T3-T6 (SSH/WSL) remain

**Evidence:**
- .agents/evidence/2026-10-03-cybernetic-navigation-proof.md
- .agents/specs/cybernetic-navigation-proof.md
- .agents/plans/cybernetic-navigation-proof.md
