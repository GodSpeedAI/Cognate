# realitytrace / src — observation delivery, SXR CLI port, CEP envelopes

## Overview

Four modules. `types.ts` holds the `Observation`, `DeliveryReceipt`, `ObservationPort`, and `ObservationStatus` contracts; `index.ts` builds an observation from a committed event, delivers it at least once from the committed outbox with persisted status, and applies the strict-mode gate; `sxr-cli.ts` implements `ObservationPort` over the external `sxr` command through `Bun.spawn`; `godspeed.ts` builds GodSpeed CEP `execution_trace` and `evidence_packet` envelopes with content-addressed ids. `index.ts` re-exports `./types.ts` and `./godspeed.ts` and additionally exports `createSxrCliPort` `[packages/realitytrace/src/index.ts:export]`.

## Interface

- `Observation` — correlation fields plus `classification` (`reversible_effect` | `durable_fact` | `external_commitment`), optional refs, and an optional CEP `trace` `[packages/realitytrace/src/types.ts:Observation]`
- `DeliveryReceipt` — only `accepted` or `duplicate`, each with `observationId`, `targetRef`, `detail` `[packages/realitytrace/src/types.ts:DeliveryReceipt]`
- `ObservationStatus` — persists `queued` | `accepted` | `duplicate` | `retrying` | `failed` with `attempts` and `lastError` `[packages/realitytrace/src/types.ts:ObservationStatus]`
- `OBSERVATION_TOPIC` — the outbox topic string `observation.deliver` `[packages/realitytrace/src/index.ts:OBSERVATION_TOPIC]`
- `observationIntent(event, extra)` — the observation plus outbox intent for the same decision `[packages/realitytrace/src/index.ts:observationIntent]`
- `ObservationDelivery` — `drain()`, `status(eventId)`, `unreconciled()`, `isRecorded(eventId)` `[packages/realitytrace/src/index.ts:ObservationDelivery]`
- `createSxrCliPort(options)` — `ObservationPort` plus `prepare`, `readCorrelation`, `deriveEvidence`, `readEvidence` `[packages/realitytrace/src/sxr-cli.ts:createSxrCliPort]`
- `executionTraceEnvelope`, `evidencePacketEnvelope`, `governedTraceFor`, `executionTraceId`, `transformationId` `[packages/realitytrace/src/godspeed.ts:executionTraceEnvelope]`

## Invariants

- The observation id is `obs-<eventId>` and the outbox id is `observation:<eventId>`; queue ids are stripped back to the event id for status keys `[packages/realitytrace/src/index.ts:eventIdFromOutboxId]`
- Optional correlation fields are omitted rather than written as `undefined`, and the status write reads the existing record's version first, so each write is a versioned commit into collection `observations` `[packages/realitytrace/src/index.ts:writeStatus]`
- A failed port call records `retrying` until `item.attempts` reaches `backoff.maxAttempts`, then `failed`, and rethrows so the outbox owns the retry `[packages/realitytrace/src/index.ts:ObservationDelivery]`
- `isRecorded` is true only for `accepted` or `duplicate`; queued and retrying are explicitly not enough, and `unreconciled()` lists only `failed` records `[packages/realitytrace/src/index.ts:unreconciled]`
- Every SXR method except `prepare` throws if called before `prepare()` resolves `[packages/realitytrace/src/sxr-cli.ts:record]`
- The SXR target is the fixed constant `concept:runtime_execution`, used for question declaration and every plan `[packages/realitytrace/src/sxr-cli.ts:TARGET]`
- The verifier per observation is `cognate.<observationId>`; a `plan create` failure is tolerated only when stderr matches `already exists` `[packages/realitytrace/src/sxr-cli.ts:record]`
- Ingest sends the CEP `trace` as the content when present, otherwise the observation with `trace` stripped, so a trace is never sent alongside itself `[packages/realitytrace/src/sxr-cli.ts:stripTrace]`
- Cognate correlation travels as `extensions.cognate` and is read back from the committed ledger row matching `ledger_id` and `append_ordinal` `[packages/realitytrace/src/sxr-cli.ts:readCorrelation]`
- `evidencePacketEnvelope` throws on zero evidence rows, defaults a missing direction to `unknown`, and never upgrades direction or reliability `[packages/realitytrace/src/godspeed.ts:evidencePacketEnvelope]`
- `governedTraceFor` returns `undefined` unless metadata carries `authority.operationId`, `decisionEnvelopeId`, and `worldRef`, and stamps `createdAt` from the event time so re-derivation yields identical bytes `[packages/realitytrace/src/godspeed.ts:governedTraceFor]`

## Side Effects

- `prepare()` creates `repoDir` with `mkdirSync`, runs `git init -q` and an empty commit with `-c user.email=realitytrace@cognate.local -c user.name=realitytrace` via `Bun.spawnSync`, then runs `sxr repo enroll <repoDir> --json` `[packages/realitytrace/src/sxr-cli.ts:prepare]`
- Creates a scratch directory with `mkdtempSync(join(tmpdir(), "cognate-sxr-prereq-"))`, writes `question.json` as `{question_form:"is_true", question_type:"declared_semantics", target_entities: TARGET, title}` and `threshold.json` as `{threshold_id:"cognate-threshold", kind:"AllEvidenceSupports", minimum_reliability:"medium"}`, and removes the directory in a `finally` `[packages/realitytrace/src/sxr-cli.ts:prepare]`
- The run is begun with snapshot `snapshot:genesis` over the declared question and threshold `[packages/realitytrace/src/sxr-cli.ts:prepare]`
- `runSxr` spawns `[bin, ...args]` with `cwd`, `env`, piped stdout/stderr, and optionally piped stdin, then JSON-parses stdout and leaves non-JSON stdout as `undefined` `[packages/realitytrace/src/sxr-cli.ts:runSxr]`
- The child environment is `process.env` overlaid with `options.env` `[packages/realitytrace/src/sxr-cli.ts:createSxrCliPort]`
- `readEvidence` and `readCorrelation` run `sxr ledger export --repo <repoId>` and scan the returned rows in memory; non-zero exits are raised as `realitytrace: sxr <description> failed (exit N): <stderr or stdout>` `[packages/realitytrace/src/sxr-cli.ts:requireOk]`
- `godspeed.ts` reads a clock: `createdAt` defaults to `new Date()` and timestamps are truncated to whole seconds; `evidencePacketEnvelope` derives its id suffix from a `sha256` hash of the sorted evidence ids `[packages/realitytrace/src/godspeed.ts:isoSeconds]`
- Delivery status is durably committed into the `observations` collection of the caller's `DurableStore` `[packages/realitytrace/src/index.ts:OBSERVATIONS_COLLECTION]`

## Verification

- Run: `cd packages/realitytrace && bun test`
