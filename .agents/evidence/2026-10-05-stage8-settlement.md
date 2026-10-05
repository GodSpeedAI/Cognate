# Stage 8 — execution, RealityTrace, evidence, settlement (2026-10-05)

Commit: cognate `cognate/harness` b575ebc. SEA-Forge half: sea-rs `migration/cep-world-ref` 12ccf4a. Full record: sea-rs `.agents/reports/cep-world-migration/stage8-settlement.md`.

## What the run proves
- `SeaForgeAuthority.submitEvidence` and `settle` go through SEA-Forge's socket verbs. Evidence is an append-only ledger fact keyed by envelope id. Settlement criteria are bound into the allow decision by hash, so they cannot be moved afterwards. Only an `allow` operation can settle.
- `packages/realitytrace/src/godspeed.ts` builds CEP `execution_trace` and `evidence_packet` envelopes. An execution trace is not evidence, and evidence is not settlement. RealityTrace's own settlement stays a separate fact from SEA-Forge's.
- `sxr` derives evidence direction from the verifier `exit_code`; only `sxr verify` records one. The evidence request id includes the payload hash, so a tampered packet under the same envelope id cannot poison the id.

## Commands and results
- `bun run typecheck`: clean.
- `just verify`: 78/78 gates on 3 of 3 serial runs.
- `just sea-forge-live`: 22 pass, 0 fail, including the end-to-end governed-settlement test against a real `sxr verify`.
- sea-rs `just test` at that point: 1170 passed, 0 failed.

## Not verified
- AK-006 had one unexplained gate failure that did not reproduce.
- Cognate's full `bun test` suite fails 68 to 78 tests in this environment; the cause is not investigated.
- Only `sxr verify` yields an evidence direction; other evidence sources have none.
