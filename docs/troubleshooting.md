# Troubleshooting

Diagnose by symptom. Each table gives the likely cause and the recovery; the *Source* column points
at the code that produces the behavior.

For open, evidence-backed gaps, [`.agents/DEBT.md`](../.agents/DEBT.md) is the register. This page
links to it; it does not restate it.

## First moves

```bash
just status          # the latest status snapshot
just gates           # every gate with PASS/FAIL and status drift
just gate <ID>       # one requirement's proof
bun run typecheck
bun test ./tests/integration   # cross-cutting behavior
```

If a gate that should pass fails, run it directly — the gate command is in the ledger, and its
`proof_paths` tell you which files are supposed to establish the behavior.

## Startup and the CLI

| Symptom | Cause | Recovery | Source |
|---|---|---|---|
| `cognate: usage: cognate create …` | no or unknown subcommand | the usage line lists both commands | `packages/cli/src/bin.ts:55` |
| `cognate create: --source is required` | CLI older than 0.8.0, before registry mode (DEBT-016, closed) | upgrade to 0.8.0 or later, or pass a Cognate checkout | `packages/cli/src/bin.ts:33` |
| `cognate create: cannot find source package "X" under --source` | `--source` is not a full checkout | point at the repository root | `packages/cli/src/index.ts:71` |
| `bun pm pack failed in <dir>` | the package manifest is unreadable | run `bun pm pack` manually in that directory | `packages/cli/src/index.ts:85` |
| `unsupported: sona (…)` | a known-unsupported `--with` name | informational; SONA stays rejected (ADR-0005) | `packages/cli/src/index.ts:30` |
| `cognate dev: no cognate.config.ts in <dir>` | run outside a generated app | `cd` into the app | `packages/cli/src/index.ts:194` |
| `failed to parse domain/<file>` | invalid `.sea` | the typed `SemanticError` is in the message | `packages/cli/src/index.ts:205` |
| `failed to bundle the UI` | a browser-side import failed | the `Bun.build` logs are printed | `packages/cli/src/index.ts:256` |
| `runtime-bun: idle() timed out after Nms` | work is still queued: an outbox item, a running execution, or a lagging projection | check `listOutbox` and the projection checkpoints; `kick()` is called each poll | `packages/runtime-bun/src/runtime.ts:179` |
| an app never becomes `ACTIVE` | a component's dependencies are unmet or `activate` hangs | its capabilities are simply unavailable; the app still starts | `packages/runtime-bun/src/invoker.ts:52` |
| `unreconciled()` is non-empty | poisoned observation deliveries | operator replay via `requeueOutbox` | `packages/realitytrace/src/index.ts:124` |

## The kernel

| Symptom | Cause | Recovery | Source |
|---|---|---|---|
| a component stays `WAITING` with no `fiberId` | an unmet `requires` | provide the capability, or mount in a scope that can see the provider | `packages/kernel-cordis/src/fiber.ts:124` |
| `ActivationTimeoutError` | `activate` never settled | raise `activationTimeoutMs` (default 30 000), or fix `activate` | `packages/kernel-cordis/src/fiber.ts:166` |
| `PermanentActivationError` | `activate` threw it | fix the component, then `handle.reset()` | `packages/kernel-api/src/errors.ts:11` |
| `CleanupError` | a disposer threw during teardown | fix the disposer; disposal already happened and is idempotent | `packages/kernel-api/src/errors.ts:3` |
| `UndeclaredCapabilityError` | `provide()` for something not in `provides` | declare it | `packages/kernel-api/src/errors.ts:16` |
| `ScopeClosedError` | mounting into a closed scope | mount into a live ancestor | `packages/kernel-cordis/src/kernel.ts:26` |
| a resolution returns `unavailable` after working before | the provider was withdrawn | the lease's `isActive()` check is doing its job; re-resolve | `packages/kernel-cordis/src/lease.ts` |
| a dependent stopped working when a provider was disposed | dependency closure | expected; restore a compatible provider to reactivate | `packages/kernel-cordis/src/fiber.ts` |

## Capabilities and authorization

| Symptom | Cause | Recovery | Source |
|---|---|---|---|
| `unavailable: no eligible provider for X` | not mounted, unreachable scope, or a version/attribute mismatch | compare `provides` with the requirement; `isCompatible` is exact | `packages/kernel-api/src/compat.ts:12` |
| `permission_denied: no policy grants this invocation` | `denyAll` (the default) | configure `policy`; this is eligibility passed and authorization refused | `packages/kernel-api/src/policy.ts:4` |
| `permission_denied: no rule matched` | `rulePolicy` with no matching rule | add a rule; the first match decides | `packages/kernel-api/src/policy.ts:14` |
| a `Policy` allows across tenants | it ignores `context.tenant` | the kernel is single-tenant by contract; the tenant reaches the policy per call | `packages/runtime-bun/src/invoker.ts:61` |
| a `ContinuationService` used directly skips authorization | it is constructed with its own policy | the runtime passes an always-allow policy because `service.ts` already authorized; standalone use must supply a real one | `packages/runtime-bun/src/runtime.ts:31` |
| a new provider is never selected | not `isCompatible`, or a version pin below the requirement | inspect the `capability.selected` event: it records every `(provider, rule)` result | `packages/capabilities/src/selector.ts:22` |
| ranking ignores new outcomes | the feedback projection has not caught up | feedback affects ranking only after it is committed and projected (CG-COG-006) | `packages/capabilities/src/selector.ts:185` |
| `failed_precondition` on a capability call | the invocation failed with kind `failed` | the handler threw; the message is in the mapped error | `packages/runtime-bun/src/service.ts:200` |

## Runs and replay

| Symptom | Cause | Recovery | Source |
|---|---|---|---|
| `already_exists: idempotency key … used for a different request` | key reuse with a different fingerprint | use a new key | `packages/runtime-bun/src/service.ts:99` |
| `not_found` for a run that exists | it belongs to another tenant | cross-tenant reads are `not_found` by design, never `permission_denied` | `packages/runtime-bun/src/service.ts:22` |
| the run repeats work after a restart | a step that had not been recorded before the crash | steps are at-least-once; put external effects in `CommitmentService` | `packages/runtime-bun/README.md` |
| a run takes a different path on replay | `emit`/`invoke`/`artifact` numbering shifted because control flow depends on something not obtained through `ctx` | move the nondeterminism behind `ctx.step` or `ctx.invoke` | `packages/runtime-bun/src/executor.ts:105` |
| a replay diverges | nondeterminism outside `ctx` (a clock, a random value) | same fix | `packages/runtime-api/src/types.ts:28` |
| `emit: event type run.X is reserved for the runtime` | an agent emitted a `run.*` type | pick another type | `packages/runtime-bun/src/executor.ts:107` |
| `run.wait.closed` then `ContinuationClosedError` | the wait was cancelled or expired | handle the error in the agent if that is not a failure | `packages/runtime-bun/src/executor.ts:178` |
| `ConcurrencyError` surfaces from `cancelRun` | contention on the run stream | the service retries up to 5 times; beyond that, re-issue | `packages/runtime-bun/src/service.ts:139` |
| a run is stuck `running` after a hard kill | it was queued for recovery at startup | automatic; the recovery scan re-queues it | `packages/runtime-bun/src/runtime.ts:124` |
| `run.recall` results hold content erasure did not remove | DEBT-014 | keep personal content out of what you recall into | `packages/runtime-bun/README.md` |

## Continuations and commitments

| Symptom | Cause | Recovery | Source |
|---|---|---|---|
| the run stays `waiting` and nothing happens | the record is `BLOCKED`: no handler claims its version | deploy a handler whose `supports` accepts the stored version | `packages/continuations/src/continuations.ts:339` |
| resume returns `already_terminal` | already cancelled/expired | final; the agent's wait will close | `packages/runtime-bun/src/service.ts:169` |
| resume returns `duplicate` | the same idempotency key with the same request | safe to retry; the recorded result is returned | `packages/continuations/src/continuations.ts:123` |
| `failed_precondition` naming a version | `expectedVersion` mismatch | re-read the record and decide again | `packages/runtime-bun/src/service.ts:180` |
| expiry is late | the loop polls (`tickMs`, default 10 ms) and scans on each tick | DEBT-015; do not depend on exact timing | `packages/runtime-bun/src/runtime.ts:79` |
| a commitment is stuck `UNKNOWN_RECONCILIATION_REQUIRED` | dispatch timed out, which is not proof of failure | `reconcile` via the target's `status`, or `resolveManually` | `packages/continuations/src/commitments.ts:195` |
| `CommitmentRejectedError` | an invalid transition requested | fix the intent; nothing was dispatched | `packages/continuations/src/types.ts:99` |

## Shared state

| Symptom | Cause | Recovery | Source |
|---|---|---|---|
| `invalid_argument` from `updateState` | the patch does not apply to the current state | re-read the state, then re-patch; `StatePatchError` names the path | `packages/runtime-bun/src/service.ts:261` |
| `failed_precondition: state is at version N` | `expectedVersion` mismatch | `expectedVersion` counts **caller writes only**; re-read and retry | `packages/runtime-bun/src/service.ts:253` |
| `failed_precondition: run … is terminal` | the run finished | state is read-only once terminal | `packages/runtime-bun/src/service.ts:250` |
| `unavailable: too much contention` | five contended attempts | retry; a UI should back off | `packages/runtime-bun/src/service.ts:300` |
| a later `state.changed` is ignored in the UI | an earlier agent patch did not apply | by design: a bad patch is skipped so it cannot hide later updates; fix the emitter | `packages/runtime-api/src/state.ts:139` |
| agent writes collide with UI writes | would happen if both used the run stream; they do not | callers write `run-state-<id>` by design | `packages/runtime-bun/src/fold.ts:11` |
| `ctx.state` returns a stale value on replay | intentional | the value read at that step is recorded so replay is deterministic | `packages/runtime-bun/src/executor.ts:227` |

## Cognition and RVF

| Symptom | Cause | Recovery | Source |
|---|---|---|---|
| recall returns `{ status: "degraded" }` | no cognition configured, or the index/embedder failed | non-fatal; `CognitionUnavailableError` only when `required: true` | `packages/cognitive-api/src/recall.ts` |
| a recalled item is missing | a denied or missing source dropped in the pipeline | expected; check the `SourceResolver`'s tenant check | `packages/runtime-bun/src/cognition.ts:53` |
| the index is empty after a restart | the index is not `persistent` | the runtime clears and rebuilds it at startup so the checkpoint cannot over-claim | `packages/runtime-bun/src/runtime.ts:113` |
| RVF `open` serves stale or partial data | DEBT-006: 0.3.4 does not verify on open | the adapter's sha256 manifest rejects it before opening; never open an `.rvf` file outside the adapter | `packages/cognitive-rvf/src/index.ts` |
| `MetadataNotSupported` on ingest | DEBT-006 | the adapter never ingests metadata; it lives in the `.entries.json` sidecar | `packages/cognitive-rvf/src/index.ts` |
| an RVF import is `detached` | foreign lineage, a checkpoint beyond the store head, or never recorded there | read the `reason`; detached snapshots never affect authorization or selection | `packages/cognitive-rvf/src/index.ts` |
| an RVF import is `rejected` | bad JSON, missing files, a digest mismatch, over a resource limit, or a disallowed tenant | nothing is opened; fix the cause | `packages/cognitive-rvf/src/index.ts` |
| `FsyncFailed` under concurrent I/O | DEBT-018 (upstream) | the E2E app retries; do the same, or serialize | `tests/e2e/app.ts` |
| RuVector returned another tenant's id | it cannot happen: the adapter over-fetches and filters locally | DEBT-007 notes RuVector's own `filter` does not filter | `packages/cognitive-ruvector/src/index.ts` |

## Wire and protocols

| Symptom | Cause | Recovery | Source |
|---|---|---|---|
| Connect client/bidi streaming rejected | DEBT-004: no proven HTTP/2 path | stay on unary and server-streaming; do not advertise the others | `packages/protocol-connect/src/index.ts` |
| `unauthenticated` from a protocol call | the authenticator returned `undefined` | identity comes from headers, never the body | `packages/protocol-connect/src/index.ts:343` |
| a deep payload is rejected | `maxJsonDepth` | the bound is deliberate; flatten the payload | `packages/protocol-connect/src/index.ts:26` |
| AG-UI reports `waiting_unsupported` | the run waits on a continuation AG-UI cannot express | resolve it from the native UI | `packages/ag-ui/src/index.ts` |
| AG-UI reconnect resyncs instead of resuming | the cursor is unknown or expired | expected; a full snapshot is sent, then newer events | `packages/ag-ui/src/index.ts` |
| "no Cognate run is known for thread" | pre-`d634cbf` in-process mapping; fixed | the mapping is now durable via `agui-thread:<id>` + `listRuns` | `packages/ag-ui/src/index.ts#threadCorrelationId` |
| an MCP tool returns `isError` | a `ServiceError` from the authorized path | read `<code>: <message>`; never a partial success | `packages/mcp/src/index.ts` |
| A2A returns `TASK_STATE_INPUT_REQUIRED` on the first send | the agent opened a continuation | send the follow-up with the same `taskId`; the task id is the run id | `packages/a2a/src/index.ts` |
| generated protobuf differs from committed | hand-edited or a stale generator | regenerate; `packages/proto/test/codegen.test.ts` requires byte-identical output | `packages/proto/scripts/generate.ts` |

## Store, projections, and erasure

| Symptom | Cause | Recovery | Source |
|---|---|---|---|
| `ConcurrencyError` | a stale `expectedVersion` | re-read and re-decide; the executor and service retry automatically | `packages/events/src/errors.ts` |
| `RecordConflictError` | a record CAS failed | re-read, re-check, retry — do not blindly retry the same write | `packages/continuations/AGENTS.md` |
| `IdempotencyMismatchError` | key reuse with a different request | a new key | `packages/events/src/errors.ts` |
| `EnvelopeValidationError` | a missing §10 field, non-JSON payload, or > 1 MiB | `MAX_PAYLOAD_BYTES` is 1 048 576; JSON depth ≤ 64 | `packages/events/src/validate.ts:3` |
| `events are append-only (spec §9.2)` from SQLite | a direct `UPDATE`/`DELETE` | there is none; correct an event by appending another | `packages/store-sqlite/src/schema.ts` migration 2 |
| a projection stopped advancing | `apply` threw | `getProjection(name).error` names the position and message; then `rebuild()` or `retry()` | `packages/projections/src/runner.ts:155` |
| `rebuild_required` | the checkpoint's `version` differs from the projection's | call `rebuild()` — expected after a `version` bump | `packages/projections/src/runner.ts:55` |
| `readProjection` returns `[]` | an empty tenant partition, or a different tenant | public projections key `<tenant>/<key>`; the prefix is stripped | `packages/runtime-bun/src/service.ts:221` |
| content survives `runtime.erase` | DEBT-014: continuation records, idempotency snapshots, and `run.recall` results | keep personal content out of continuation payloads until it closes | `packages/runtime-bun/src/executor.ts:223` |
| an artifact reads as `not_found` but exists | denied, or tombstoned | deliberately indistinguishable (spec §32); check the actor and tenant | `packages/runtime-bun/src/service.ts:212` |
| an artifact reads as `unavailable` | the record exists but the bytes are gone | data loss; the `lost` state is reported distinctly | `packages/artifacts/src/index.ts:148` |
| a second writer process corrupts expectations | DEBT-011 | one writer per database; this is not a supported configuration | `packages/store-sqlite/AGENTS.md` |

## Environment and tooling

| Symptom | Cause | Recovery | Source |
|---|---|---|---|
| a test mutates the object it matched | DEBT-017: Bun 1.4.0 `toMatchObject` mutates its argument | `structuredClone` before matching | `.agents/DEBT.md` |
| Playwright's server never becomes ready | DEBT-012: the TCP probe hangs on this host | fixtures use a `globalSetup` that waits on stdout | `tests/e2e/global-setup.ts` |
| `Bun` is undefined inside a Playwright spec | workers run under Node | run servers as separate Bun processes | `tests/e2e/playwright.config.ts` |
| a second `just gates` exits 3 | the exclusive lock is held | run gates sequentially; a lock held by a dead process is taken over automatically | `scripts/gate.ts:51` |
| a RealityTrace gate cannot find the binary | the pinned CLI is not installed | `just setup-realitytrace`, or set `SXR_BIN` | `justfile` |
| Astryx warns about runtime style injection | the source theme is used | import `@astryxdesign/theme-neutral/built` and its CSS | `packages/ui-astryx/src/styles.ts` |
| the ledger check fails on a spec digest | the spec changed without re-digesting the ledger | every requirement's `source.digest` must match the spec file | `scripts/check-substrate.ts:62` |
| the ledger check fails on `CURRENT_STATUS` | the YAML snapshot and the Markdown view disagree, or a revision did not increase | update both in the same change | `scripts/check-substrate.ts:49` |
| a docs gate fails on a page that does not exist | a page listed here is missing | add the file, or update the list in this page | `tests/architecture/docs.test.ts` |

## Escalation

1. `just gates` — is it one requirement or the workspace?
2. If one, read its `gate.run` and its `evidence` file; the evidence says what was actually observed.
3. If the workspace, `just check` then `bun run typecheck` then `bun test`.
4. If it looks like a real defect, record it in `.agents/DEBT.md` with the evidence, and add the
   missing proof path so the gate fails honestly rather than passing quietly.

## Related

- [subsystems/](subsystems/) — the owning page per symptom area.
- [reference/verification.md](reference/verification.md) — the ledger and evidence model.
- [how-to/verify-a-change.md](how-to/verify-a-change.md) — the loop.
- [../.agents/DEBT.md](../.agents/DEBT.md) — the debt register.
