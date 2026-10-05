# Stage 5 evidence: GovernedOperation choke point

Observed 2026-10-04 on branch cognate/harness.

- Before: `ActionPolicy.authorize` was called directly at 14 sites (service.ts, executor.ts) and the user kernel `Policy` was called from Invoker.
- After: those sites call `core.governor.govern(...)`; Invoker takes the Governor. `grep` for `actions.authorize(`, `userPolicy` in runtime-bun/src outside governed-operation.ts finds nothing, enforced by a test.
- `bun test packages/runtime-bun`: 70 pass, 0 fail. `bun run typecheck`: clean.
- Baseline comparison: stashing the change gave 938 pass / 77 fail for the whole suite; with the change 948 pass / 77 fail. The failing set is unchanged (AG-UI interop, E2E, J-* journeys).
- `just verify` failed before this stage because the revision-31 snapshot lacked its `---` separator; fixed in revision 32.
