# Stage 6 debt closure

Observed 2026-10-05, branch cognate/harness.

## CG-PRF-002 flake: root cause and fix
- Reproduced under parallel load: 5 of 18 runs failed with `ReferenceError: window is not defined` from react-dom's scheduler, reported as unhandled errors after all 3 tests passed (exit 1).
- Cause: React schedules follow-up work on a macrotask; `afterAll` unregistered happy-dom before it ran. Test-teardown ordering only; reproduced on the pre-change commit dbc6b27 too.
- Fix (profiles/copilot/test/copilot.test.tsx): `cleanup()` and three macrotask yields before `GlobalRegistrator.unregister()`. No assertion changed. 0 of 30 failed under the same load. The three other files using the same unregister pattern did not fail in 18 runs each, so they were left alone.

## Enforcer, wiring, live gate
- `timeout_secs` enforcement proven live; see status revision 34.
- `just sea-forge-live` exits 1 with a message when SEA_FORGE_SERVER_BIN, CEP_REPO, domainforge or uv is missing, and when any test is skipped.

## Honest residue
- A single AK-006 failure (RealityTrace characterization) during one serial `just verify`; 0 of 23 afterwards, including 15 isolated serial runs. Parallel isolated runs fail ~1 in 3 because they share temp state, so that rate is not evidence. Cause unknown.
- My first sea-rs test summary reported 0 tests because awk hid a compile error (a test built `PolicyRule` literally). Caught by checking the exit code; fixed.
