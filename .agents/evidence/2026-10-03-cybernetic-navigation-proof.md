# Evidence — cybernetic navigation proof (harness), 2026-10-03

Scope: `validation/reconstructions/deepseek-harness/cognate` on `cognate/harness`. Spec:
`.agents/specs/cybernetic-navigation-proof.md`. Debt: DEBT-022..025.

## Baseline (before this tranche)
- `just verify` exit 0 (78/78). Harness `tsc` FAILED: uncommitted Remote Workspaces work was half
  applied (tools.ts imports, `@cognate/execution` unlinked, `registry` missing in server.ts).
- T0 finished that migration (operator choice "finish it first"): harness tsc exit 0, 39/39 journeys.

## Commands and results (after)
| Command | Result |
| --- | --- |
| `bun x tsc --noEmit -p validation/reconstructions/deepseek-harness/cognate/tsconfig.json` | exit 0 |
| `cd validation/reconstructions/deepseek-harness/cognate && bun test test` (aimock via `llmock`, real SQLite, real Chromium) | 86 pass / 0 fail / 26 files |
| `bun test packages/execution` | 26 pass / 0 fail |
| `just verify` | exit 0, 78/78 gates |
| `just gates` | first run 77/78 (CG-PRF-002, the documented transient flake); `bun scripts/gate.ts CG-PRF-002` standalone exit 0; serial re-run exit 0, 78/78 |

New tests: `cognitive-semantics` (33), `cognitive-focus` (6), `J-COG-cleanup`, `J-COG-attention`,
`J-COG-search`, `J-COG-liveverify`, `J-COG-realitytrace` (live SXR 0.3.0 at `.tmp/realitytrace`),
`E2E-cognitive-console` (3 browser journeys).

## Not verified / not claimed
- CubeSandbox: absent (no `/dev/kvm`, no passwordless sudo). Forks are local directory copies.
- Native browser WebMCP: the browser test polyfills `navigator.modelContext.provideContext`.
- `.sea` bindings for the new capabilities: not done (DEBT-023).
- A `just gates` first-run failure of CG-PRF-002 occurred once (see above).
- An earlier `just verify` failure (`proof-routing`, exit 3) was caused by my own concurrent
  background gate run holding the gate lock; it passed serially.
