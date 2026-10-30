# realitytrace

## Overview

`@godspeedai/cognate-realitytrace` (version `0.8.0`) is described as the "Observation port, committed-outbox delivery, receipts, strict gating, and the SXR CLI adapter (spec §20). RealityTrace stays unchanged." and exports one entry, `./src/index.ts` `[packages/realitytrace/package.json:exports]`. It depends on `@godspeedai/cognate-events` (durable store, outbox intent, dispatcher, `Json`) and `@godspeedai/cognate-kernel-api` (`SemanticRef`); the memory and SQLite stores are dev dependencies only `[packages/realitytrace/package.json:dependencies]`. The package adapts an external `sxr` binary through `Bun.spawn` rather than linking or modifying it, and it also builds GodSpeed CEP envelopes so that a completed operation is reported as an `execution_trace` and recorded RealityTrace evidence can be packaged as an `evidence_packet` `[packages/realitytrace/src/godspeed.ts:executionTraceEnvelope]`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — observation types, outbox delivery, the SXR CLI port, and CEP envelope builders
- test/ — three suites: `port.test.ts`, `sxr-cli.test.ts`, `godspeed.test.ts`; no `EGM.md` on disk, so it is not linked

## Global Invariants

- Only `src` ships (`files: ["src"]`), so the suites are not distributed `[packages/realitytrace/package.json:files]`
- The observation port is implementation-independent: delivery goes through the `ObservationPort` interface and failures surface as retryable outbox errors `[packages/realitytrace/src/types.ts:ObservationPort]`
- Delivery status is a projection record, never an event append; `writeStatus` commits with `appends: []` `[packages/realitytrace/src/index.ts:writeStatus]`
- Acceptance is not evidence and not settlement, and no envelope builder upgrades one into the other `[packages/realitytrace/src/godspeed.ts:evidencePacketEnvelope]`
- The external CLI's own `observation_id` is never used for deduplication; `already_committed` plus `ledger_position` decide the receipt status `[packages/realitytrace/src/sxr-cli.ts:record]`

## Global Side Effects

- Spawns the configured `sxr` binary with `Bun.spawn`, capturing stdout, stderr, and the exit code `[packages/realitytrace/src/sxr-cli.ts:runSxr]`
- Runs `git init` and an empty `git commit` in the repository directory during `prepare()` `[packages/realitytrace/src/sxr-cli.ts:prepare]`
- Creates and then removes a temporary directory under `os.tmpdir()` for the question and threshold files `[packages/realitytrace/src/sxr-cli.ts:prepare]`
- Durably commits delivery status records into the `observations` collection of the caller's store `[packages/realitytrace/src/index.ts:OBSERVATIONS_COLLECTION]`

## Verification

- Run: `cd packages/realitytrace && bun test`
