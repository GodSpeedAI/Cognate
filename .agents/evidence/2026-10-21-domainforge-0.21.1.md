# DomainForge 0.21.1 pin: observed

Environment: Bun 1.4.0 (`bun --version` = 1.4.0), linux-x64. Branch `fix/debt-burndown-2026-10-21`.

| Check | Result |
|---|---|
| Adapter pin `packages/domainforge/package.json` | `@godspeedai/domainforge` 0.21.1 (already pinned and installed before this change; no bump needed here). |
| `BINDING` (`packages/domainforge/src/types.ts`) | `@godspeedai/domainforge@0.21.1`. Not stale; no source change. |
| `bun test packages/domainforge` (step 1, before test added) | 23 pass, 1 skip, 0 fail (4 files). |
| New test: installed binding version equals `BINDING` | Added to `packages/domainforge/test/diagnostics.test.ts`; `test/diagnostics.test.ts` 7/7 pass. |
| `bun test packages/domainforge` (after test added) | 24 pass, 1 skip, 0 fail (25 tests, 4 files). |
| `compatibility/phase0/domainforge` pin | 0.19.0 → 0.21.1 (`package.json`, `bun.lock`: 2 lines each). `bun install` added 0.21.1 (`sha512-d0nggo…Kjg==`). |
| `compatibility/phase0/domainforge` ×3 (step 3) | 9 pass, 0 fail on each of 3 runs. |
| `just check` (`scripts/check-substrate.ts`) | Passed: 81 requirements (81 implemented, 0 blocked, 0 candidate). |

## Commands

- `cd packages/domainforge && bun test`
- `cd compatibility/phase0/domainforge && bun install && bun test domainforge.test.ts` (×3)
- `just check`

## Golden and rendered values

No golden or rendered value changed in this step. Fixture files under `compatibility/phase0/domainforge` and `packages/domainforge` source are unchanged. The adapter already ran on 0.21.1 before this record. The phase0 fixture was 0.19.0 before this bump, and its 9 tests pass on 0.21.1 with no fixture edits, so no golden regeneration was needed.

## Substrate check change

`scripts/check-substrate.ts` now requires every `debt:` reference in `requirements/ledger.yaml`, at any status, to name a `## DEBT-NNN` heading in `.agents/DEBT.md`. The existing `blocked` rule is kept. The check currently passes.

## DEBT-002 conclusion

DEBT-002 stays **Open**. I checked `node_modules/@godspeedai/domainforge/index.d.ts` (0.21.1, 701 lines) for typed error or diagnostic codes:

- The only diagnostic-named export is `const enum DiagnosticSeverity { Error, Warning, Info, Hint }`. It is a severity level, not an error code.
- `Severity` and `SemanticValidationStatus` are likewise severity or status enums.
- No typed error class or error-code enum is exported, and no declaration types the thrown parse error.
- `GenericFailure` does not appear in `index.js`; it lives in the native binary.

So upstream still gives no typed code for missing-reference and syntax failures. The adapter keeps message classification, and the diagnostics goldens (7 tests) still pin every classified message shape.
