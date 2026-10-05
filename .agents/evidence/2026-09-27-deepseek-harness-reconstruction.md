# DeepSeek Harness reconstruction (branch `cognate/harness`)

Reference `deepseek-ai/deepseek-harness` @ `477b4f420553e8a52c2fbccc464d7561b239c443` (dsh 0.1.7-rc.2), rebuilt on Cognate under `validation/reconstructions/deepseek-harness/`. Full results: [parity report](../../validation/reconstructions/deepseek-harness/parity-report.md); route: [plan](../plans/deepseek-harness-reconstruction.md).

Observed 2026-09-27:
- `just verify`: 78/78 gates; `bun run test`: 524 pass, 0 fail.
- `bun test validation/reconstructions/deepseek-harness/tests/architecture`: 62 pass (purity, provenance, rebuild-from-events, DomainForge/RealityTrace unchanged).
- Reconstruction app tests 21/21; fixtures 20/20; Playwright journeys A–H 11/11 on Cognate and 11/11 on the reference (2 reference flakes pass on retry).
- Clean reference-removal run: install, typecheck, app tests, and Cognate-only Playwright smoke all PASS (`tests/architecture/reference-removed.log`).
- Independent critic: rounds 1–5 rejected with findings, all fixed; round 6 APPROVE (full visual/behavioral scope), round 7 finding fixed and verified.

Framework changes the test surfaced: D1 emit-inside-step replay drift (fixed), D2 provider stream abort mapping (fixed), G1 invocation progress channel (new general capability, the architectural gap found), F3 structured invocation failures (fixed), F2 open as DEBT-020.
