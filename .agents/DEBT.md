# Debt and gap register

Every known gap, shortcut, or blocked requirement has an entry here. A ledger requirement with `status: blocked` must cite one of these IDs (`scripts/check-substrate.ts` enforces it). Close an entry only with a cited commit and passing gate; do not delete it — mark it **Closed**.

Format: `## DEBT-NNN — title`, then **Status**, **Requirement(s)**, **Observed**, **Consequence**, **Exit criterion**.

## DEBT-001 — DomainForge Flow ids are random per parse
**Status:** Closed (2026-09-24) — adapter mitigation in `19615f4`; CG-SEM-002 passed again on 2026-09-25 (7 tests). The pinned upstream binding still assigns random native Flow ids.
**Original status:** Open
**Requirement(s):** AK-003, CG-SEM-001, CG-SEM-002
**Observed:** `@godspeedai/domainforge` 0.16.0 assigns a fresh v4-shaped UUID to each Flow on every `Graph.parse`; Entity/Resource ids are stable (`compatibility/phase0/domainforge/domainforge.test.ts`, "observed: Flow identity is NOT stable").
**Consequence:** A native Flow id cannot be a `SemanticRef` identity. The adapter derives Flow identity from (resource, from, to) and pins the ref to a source digest; the identity test proves stability across parses (`.agents/evidence/m6-semantics-evidence.md`).
**Exit criterion:** CG-SEM-002 proves derived Flow identity is stable across parses, or upstream publishes stable Flow ids and AK-003 is re-run.

## DEBT-002 — DomainForge errors share one code
**Status:** Open
**Requirement(s):** AK-003, CG-SEM-001
**Observed:** Missing-reference and syntax errors both throw `Error` with `code: "GenericFailure"`; only `.message` differs. `hasEntity`/`getEntity` throw on non-UUID input.
**Consequence:** The adapter returns typed results, but classifies upstream failures by message regexes. CG-SEM-002 tests one missing-reference and one syntax case; it does not pin every message shape used by the classifier. A DomainForge update could silently turn a known failure into `unknown` or misclassify it.
**Recommended action:** Keep the binding pinned. Add golden fixtures for each classified upstream diagnostic and an unknown-message fallback; re-run them before any version bump. Prefer upstream typed diagnostics when available.
**Progress (2026-09-25):** `packages/domainforge/test/diagnostics.test.ts` pins every classified message shape (undefined entity/resource, syntax, duplicate declaration → `ambiguous_identity`, empty source, unknown fallback) and passed on 0.16.0 and 0.17.0 before the pin moved (`.agents/evidence/2026-09-25-releases.md`). Upstream still reports one `GenericFailure` code, so the entry stays open.
**Progress (2026-10-01):** The pin moved to 0.18.2; the diagnostics goldens passed unmodified (same messages, same single code). The error object's `line`/`column` are the N-API call-site position in the JS caller, not a SEA source location, so they carry no diagnostic signal. The upgrade did change one rendered value: Policy expressions now read `forall f in flows: …` rather than `ForAll(f in flows: …)` (golden regenerated). Entry stays open (`.agents/evidence/2026-10-01-domainforge-0.18.2.md`).
**Exit criterion:** Upstream typed diagnostics replace message matching, or pinned-version golden tests cover every classified message shape and version upgrades fail on drift.

## DEBT-003 — DomainForge kinds without a V0 Graph accessor
**Status:** Closed 2026-09-26 — a later binding exposes them and the mapping table plus golden fixtures are extended.
**Requirement(s):** CG-SEM-001
**Observed:** ConceptKind has 9 kinds; the Graph binding exposes collections for Entity, Resource, Flow, Instance, Role, Relation only. Policy is add/evaluate JSON only; Metric, Dimension, Unit, Mapping, Projection, External have no Graph accessor.
**Consequence:** The adapter's mapping table marks these unmapped in V0; they never become capabilities.
**Recommended action:** Keep the explicit unmapped rows. Extend the adapter only when an application requirement needs one of these kinds and a pinned binding exposes a read accessor; prove the new mapping with a golden fixture.
**Exit criterion:** A later binding exposes them and the mapping table plus golden fixtures are extended.
**Closing evidence:** `@godspeedai/domainforge` 0.18.1 exposes `allPolicies`, `allMetrics`, `allMappings`, `allProjections`, `allDimensions`, `allUnits`, `allPatterns`, `allConceptChanges`, `allEntityInstances` (verified present as functions post-install). Pin + `BINDING` moved to 0.18.1 with no adapter logic change; `just verify` and `just gates` pass 78/78, including the byte-identical golden projection (`all-kinds.projection.json`, 17 objects) across two loads and the architecture test forbidding implicit capabilities. Policy stays a read-only referenced constraint (`bindCapabilities` rejects Policy ids). `External` remains unmapped: SEA has no grammar, AST, or Graph declaration for it (only a semantic-pack enum variant), so there is nothing to map. Evidence record: `.agents/evidence/2026-09-26-debt-003-close.md`.

## DEBT-004 — Connect client and bidirectional streaming unsupported on Bun
**Status:** Open
**Requirement(s):** AK-004, CG-WIR-002
**Observed:** `@connectrpc/connect-web` 2.2.0 fetch transport rejects streaming request bodies over HTTP/1.1 ("The fetch API does not support streaming request bodies"); no HTTP/2 path was demonstrated.
**Consequence:** The release mode matrix supports unary and server streaming only. Runtime services must not require client or bidi streaming.
**Exit criterion:** An h2c/HTTP/2 spike with a duplex-capable transport passes a client-streaming and bidi fixture.

## DEBT-005 — Cordis 4.0.0-rc.10 gaps owned by the adapter
**Status:** Open (mitigated in kernel-cordis)
**Requirement(s):** AK-002, CG-KRN-001..006
**Observed:** Cordis logs disposer errors individually instead of aggregating; disposes top-level effects concurrently (`Promise.all`), so async disposers are not strictly reverse-sequential; does not cancel an in-flight async `apply`; `ctx.provide` is not auto-owned by the calling fiber. The package is a prerelease with an unstable API.
**Consequence:** Aggregation, sequential reverse disposal, cancellation signals, and provide ownership are adapter code, proven by the kernel conformance kit, not by Cordis.
**Exit criterion:** Re-run AK-002 and the kernel conformance kit on every Cordis version bump; close when a stable Cordis release provides these behaviours natively.

## DEBT-006 — RVF 0.3.4 import integrity, metadata, and byte export gaps
**Status:** Mitigated in `cognitive-rvf` (ADR-0006 addendum; CG-RVF-001 passes); open against upstream
**Requirement(s):** AK-007, CG-RVF-001
**Observed:** `@ruvector/rvf` 0.3.4 under Bun: default `open()` accepts a 50%-truncated file or a flipped byte (including the magic header) and serves partial or stale data; metadata ingestion throws `MetadataNotSupported` (upstream #704); `exportBytes()`/`openBytes()` throw `BackendNotFound` on the native backend; string ids live in a sidecar JSON file outside the `.rvf`. Bun support is labelled experimental upstream.
**Consequence:** Spec §18.3 import integrity cannot come from RVF itself. Any RVF adapter must verify a Cognate-recorded digest before opening and keep metadata and lineage outside the RVF file; otherwise RVF stays unsupported in the release capability matrix.
**Exit criterion:** CG-RVF-001 proves digest-verified import (tampered files rejected), sidecar metadata fidelity, and branch isolation; or upstream adds verified open and metadata.

## DEBT-007 — RuVector core supports vector search only
**Status:** Open
**Requirement(s):** AK-005, CG-COG-002, CG-COG-003
**Observed:** `@ruvector/core` 0.1.32 under Bun: query-time `filter` accepts an undocumented grammar and silently ignores a plausible expression; metadata round-trips only as a JSON string; omitting `storagePath` persists to `./ruvector.db` in the working directory (no in-memory mode, contrary to its README); vectors must be `Float32Array`; graph/temporal/causal retrieval needs separate untested packages (`@ruvector/graph-node`).
**Consequence:** The RuVector adapter advertises `vector_search` only; tenant/scope filtering happens in Cognate (per-tenant index or post-filter before disclosure), never in RuVector; the adapter must always pass an explicit storage path.
**Exit criterion:** A fixture proves a working metadata filter or graph package, and the adapter's capability flags are extended with tests.

## DEBT-008 — SONA is not an adaptive ranker
**Status:** Closed (2026-09-25) — operator chose a Cognate-owned UCB1 ranker instead of an external library; AK-008 revised to characterize it and its gate (`packages/capabilities/test/adaptive-ranker.test.ts`) passes. SONA stays rejected (ADR-0005 addendum).
**Original status:** Open (AK-008 blocked)
**Requirement(s):** AK-008, CG-CAP-001
**Observed:** `@ruvector/sona` 0.1.8 exposes trajectory/LoRA learning (`applyMicroLora`, `findPatterns`), no rank/score/select API; its README `TrajectoryBuilder` API does not match the shipped binding.
**Consequence:** No profile claims SONA-backed `adaptive_ranking`. Adaptive ranking is a Cognate-owned outcome-based ranker behind the capabilities selector contract, contained by deterministic eligibility.
**Exit criterion:** A SONA release (or another adaptive library) passes a candidate-bounded ranking fixture.

## DEBT-009 — RealityTrace CLI cannot carry Cognate correlation ids
**Status:** Closed (2026-09-25) — RealityTrace 0.3.0 adds `ingest --extensions`; the adapter sends Cognate's ids as CEP `extensions.cognate` and reads them back via `ledger export`. AK-006 proves the live round-trip and duplicate delivery at the same ledger position.
**Original status:** Open (AK-006 blocked; CG-RT-002 implemented with a narrower CLI proof)
**Requirement(s):** AK-006, CG-RT-002, CG-RT-003
**Observed:** sxr @ f7fb1c3 (built out-of-tree) completes the enrollment → question → threshold → run → plan → ingest → evidence → settlement workflow. `sxr ingest` accepts observation bytes on stdin and retains Cognate's correlation fields as uninterpreted verifier output, but exposes no documented input for the CEP `extensions` / `representations[].inline_content` fields. CG-RT-002's real CLI test passed in the M6 evidence; it proves delivery and duplicate reconciliation, not a structured correlation round-trip. Ingest deduplicates by run+verifier. A duplicate response has a fresh, never-committed `observation_id`; `already_committed` and unchanged `ledger_position` identify the duplicate.
**Consequence:** The spec §20 promise of correlation in documented SXR extension/reference fields remains unproven. Cognate keeps event → observation → receipt correlation in its own store, using the committed ledger position for target reconciliation; it must not infer identity from SXR's duplicate `observation_id`.
**Recommended action:** Add or request a documented SXR ingest surface for caller-supplied CEP extension/reference fields and a read path for the committed record. Test a live write/read round-trip of event, observation, and correlation ids, including duplicate delivery at the same ledger position. Keep Cognate's local mapping until that test passes.
**Exit criterion:** SXR exposes the documented submission and read paths, and AK-006 proves structured correlation survives a live round-trip and duplicate delivery.

## DEBT-010 — RealityTrace gate depends on a locally built binary
**Status:** Closed (2026-09-25) — `just setup-realitytrace` installs the released CLI pinned to tag `realitytrace-v0.2.0` (commit 6966fa4) from the public repository; AK-006 and CG-RT-002 default to it and passed 3×; the fixture no longer reads a local checkout (vendored schema with provenance). Evidence: `.agents/evidence/2026-09-25-releases.md`.
**Original status:** Open
**Requirement(s):** AK-006, CG-RT-002
**Observed:** The fixture spawned `SXR_BIN` (default `.tmp/sxr-target/release/sxr`, built from a local checkout) and read the CEP schema from a machine-specific checkout path. RealityTrace v0.2.0 is released on GitHub (no binary assets) but its crates are **not** on crates.io (`cargo install realitytrace --version 0.2.0` fails).
**Consequence:** Clean workers now need Rust/cargo and network access to GitHub to install the pinned tag (~minutes of compilation). Installation from crates.io or a prebuilt asset would be faster; neither exists yet.
**Exit criterion:** Met. A follow-up improvement (not blocking): switch the recipe to the crates.io release or a checksummed binary asset once published.
**Follow-up done (2026-10-01):** `realitytrace` 0.3.0 is published on crates.io; `just setup-realitytrace` now runs `cargo install realitytrace --version 0.3.0 --locked --root .tmp/realitytrace` (no GitHub tag or network access beyond the registry). AK-006 and CG-RT-002 pass against that binary (`.agents/evidence/2026-10-01-realitytrace-crates-io.md`).

## DEBT-011 — SQLite store assumes a single writer process
**Status:** Open
**Requirement(s):** CG-EVT-004, CG-EVT-006
**Observed:** `store-sqlite` serializes commits in-process (synchronous bun:sqlite + `BEGIN IMMEDIATE`); a second process writing the same file waits up to `busy_timeout=5000` then fails with `SQLITE_BUSY`. Crash atomicity was proven with one writer (`tests/integration/crash.test.ts`); multi-process concurrent writers were not tested. Backups must include `-wal`/`-shm` or use the backup API.
**Consequence:** One runtime process owns a database file. Other processes (CLI, second-process clients) must go through the runtime service, not open the file for writing.
**Exit criterion:** A multi-process writer test proves correct serialization and typed busy failures, or the runtime enforces single ownership with a lock file and a test.

## DEBT-012 — Playwright `webServer` readiness probe hangs on this WSL2 host
**Status:** Open (worked around)
**Requirement(s):** AK-010, CG-E2E-001
**Observed:** Playwright 1.63.0's `webServer` option hung indefinitely: its TCP readiness probe never received ECONNREFUSED for an unbound port on this WSL2 host (a raw client reproduced the hang). The fixture uses a `globalSetup` that spawns `bun run` and waits on stdout instead. Playwright workers run under Node, so `Bun` globals are unavailable inside specs; servers run as separate Bun processes.
**Consequence:** E2E suites must use the spawn-and-wait setup; unknown whether CI hosts reproduce the hang.
**Exit criterion:** The standard `webServer` option works on the CI host, or the workaround is documented as the supported pattern with a CI run.

## DEBT-013 — MCP proven only over the in-memory transport
**Status:** Closed (2026-09-24) — `packages/mcp/test/mcp.test.ts` drives the adapter over stdio from a separate process; see `.agents/evidence/m8-wire-client.md`.
**Original status:** Open
**Requirement(s):** AK-011, CG-MCP-001
**Observed:** `@modelcontextprotocol/sdk` 1.30.1 server + client work under Bun over the linked in-memory transport. stdio and Streamable HTTP transports were not exercised. Invalid tool input returns `{isError: true}` (JSON-RPC -32602) rather than rejecting.
**Consequence:** The MCP adapter may claim in-memory interoperability only until a stdio or HTTP fixture passes.
**Exit criterion:** A fixture drives the adapter over stdio or Streamable HTTP from a separate process.

## DEBT-014 — Erasure does not yet reach every derived copy
**Status:** Open
**Requirement(s):** CG-SEC-001
**Observed (runtime-bun implementer, 2026-09-24):** `runtime.erase` scrubs event payloads (store `erasePayload`, `secure_delete`, WAL truncate), derived run views (folded from events), and cognitive entries (indexer handles `erasure.recorded`). Copies that remain: continuation record `payload`/`resolution.input` (mutable records, collection `continuations`), idempotency result snapshots, and `run.recall` step results recorded into *later* runs' events (recorded for replay determinism, §11).
**Consequence:** Personal data written into a continuation payload or recalled into another run survives erasure of its source event. Applications must keep personal content out of continuation payloads until this is closed.
**Exit criterion:** Erasure cascades to continuation records and recall-derived step results (tombstoned in place, recorded as redacted gaps on replay), with a test extending `tests/integration/erasure.test.ts`.

## DEBT-015 — Runtime background loop polls and executes runs serially
**Status:** Open
**Requirement(s):** CG-WIR-002, CG-PRF-003
**Observed:** `runtime-bun` drives run execution, resume delivery, the `run.execute` outbox, and continuation expiry from one loop ticking every 10 ms (default `tickMs`), including a scan of open continuations for expiry; runs execute one after another within a tick; one process per database (DEBT-011).
**Consequence:** Latency floor of one tick; throughput bounded by serial execution; idle CPU wake-ups. Acceptable for local/dev profiles, not measured for load.
**Exit criterion:** Event-driven wake-ups (commit listeners, timers for next expiry) with bounded concurrent execution, plus a load test recording throughput and latency.

## DEBT-016 — `cognate create` still needs a source checkout; provenance unavailable
**Status:** Open (publication half complete 2026-10-09; remaining gap narrowed to registry-only app generation)
**Requirement(s):** CG-CLI-001
**Observed:** The SDK originally consisted of private workspace packages with internal `workspace:*` dependencies; `bunx cognate create` from npm (README Quick Start) could not work. `cognate create --source <checkout>` packs the packages (`bun pm pack`) into the generated app and pins them with `overrides`.
2026-10-08: all 35 packages gained public npm metadata (Apache-2.0, `files`, `engines`, `repository`, `publishConfig`), Release Please runs in manifest mode (`release.yml`, `linked-versions` lockstep) and cut 0.1.0; `scripts/prepare-npm-package.mjs` resolves `workspace:*` at publish time and the tarballs pass a clean-room install + consumer smoke (`.agents/evidence/2026-10-08-release-0.1.0-prep.md`). The `@cognate` scope proved unusable (held by an unrelated npm user), so the SDK moved to `@godspeedai/cognate-*` per [ADR-0012](../docs/decisions/ADR-0012-cognate-package-naming.md).
2026-10-09: 0.1.0 of all 36 identities published and verified; 0.1.1 released through the fully automated Release Please → npm OIDC pipeline (no tokens; `NPM_TRUSTED_PUBLISHING_READY=true`); the 33 superseded `@godspeedai/<module>` packages are deprecated with migration messages. `bun x @godspeedai/cognate-cli@0.1.1 create my-app --profile copilot --source <checkout>` works from a clean consumer context: the published CLI vendors 26 `cognate-*` tarballs and the generated app installs and passes its own test. Still requiring a checkout: `create` has no registry-only mode, and npm provenance attestations are impossible from this private repository (accepted in ADR-0012).
**Consequence:** The Quick Start still requires a Cognate checkout on disk for `create --source`. Everything else the exit criterion asked for exists: versioned packages, a release process, and an installable CLI.
**Exit criterion:** `cognate create my-app` generates a working app resolving `@godspeedai/cognate-*` dependencies from the npm registry without `--source` (a registry-only mode for `create`), or an ADR records that vendoring remains the supported path; provenance stays accepted-as-N/A for the private repository per ADR-0012.

## DEBT-017 — Bun 1.4.0 `toMatchObject` mutates the received object
**Status:** Open (worked around in tests)
**Requirement(s):** CG-CLI-001 (observed); any test that reads an object after matching it
**Observed:** `expect(actual).toMatchObject({ x: expect.any(Number) })` passes and then leaves `actual.x` as `{}` (also with `expect.stringMatching`). Reproduced in isolation on Bun 1.4.0 (`.agents/evidence/2026-09-25-releases.md`).
**Consequence:** A later assertion on the same object fails spuriously (or, in the worst case, compares mutated values). Tests must match a `structuredClone` of the value when using asymmetric matchers and reading the value afterwards. A single-line heuristic scan of all tests and kits (2026-09-25) found no other read-after-match; multi-line matches were not scanned.
**Exit criterion:** A Bun release without the defect is pinned and the isolated repro passes, or all such matches are audited to use clones.

## DEBT-018 — RVF `create` intermittently fails with `FsyncFailed` under concurrent I/O
**Status:** Open (worked around by retry in the E2E app)
**Requirement(s):** CG-E2E-001, CG-RVF-001
**Observed (E2E implementer, 2026-09-25):** `@ruvector/rvf` 0.3.4 native `RvfDatabase.create` intermittently throws `FsyncFailed` inside the §36 journey app (SQLite, timers, and a Connect proxy active in the same process) although it succeeds in isolation and in `packages/cognitive-rvf` tests. `tests/e2e/app.ts` retries snapshot creation up to 5 times with a fresh working path and short backoff.
**Consequence:** RVF snapshot creation is not reliably first-try under load on this host; a production snapshot path would need the same retry or a root-cause fix. Snapshot failure never touches the active index or event store (§31.4, proven by CG-RVF-001).
**Exit criterion:** Root cause identified (host fsync behaviour on WSL2 vs RVF native backend) and either fixed upstream, or the retry moves into `cognitive-rvf` with a test that injects `FsyncFailed`.

## DEBT-019 — AG-UI thread lookup scans the tenant's event log
**Status:** Closed (2026-09-25) — replaced by `RuntimeService.listRuns`, served from the `runs` record collection (indexed) rather than a scan of the tenant's event log.
**Original status:** Open
**Requirement(s):** CG-AGUI-002, CG-AGUI-003
**Observed (2026-09-25):** The AG-UI endpoint used to keep its thread → run mapping in process memory, so after a server restart any resolve, cancel or reconnect for an existing thread failed with `not_found`. It then derived the mapping from a scan of the durable log: runs started for a thread carry correlation id `agui-thread:<threadId>` (the Harness uses `session:<id>` the same way), and the endpoint took the thread's latest `run.started` by reading the caller's whole tenant event stream: O(events per tenant) per non-message request.
**Resolution:** `RuntimeService.listRuns(caller, { correlationId?, agent? })` (spec §22) reads `store.listRecords("runs", { tenant, correlationId?, agent? })` — the same `runs` record collection `startRun` already writes atomically with `run.started` — instead of scanning events, then orders the matches by each run's own `run.started` store position (spec §10's store-wide commit order): one indexed `readStream(runStream(runId), { limit: 1 })` per matched run reads only its first event, and the results sort by `position`. This is exact and adds no contention on `startRun` (an earlier draft bumped a shared per-tenant sequence counter atomically with every `run.started` commit to assign ordering; that serialized concurrent starts — 200 concurrent `startRun` calls with distinct idempotency keys, same tenant, went from 200/200 succeeding to ~190/200 failing with `too much contention` — so it was removed in favor of reading the position that already exists). `packages/store-sqlite` pushes the `where` equality filters down as `json_extract` expressions and adds partial expression indexes on `records` for `collection = 'runs'` (`tenant`, `correlationId`, `agent`; schema migration 3), with an `INDEXED BY` hint chosen by selectivity priority (`correlationId` > `agent` > `tenant`, not `where` field order) so a thread/session lookup (`{ tenant, correlationId }`) uses the selective correlation index rather than the tenant-wide one — an index search, not a table scan (`packages/store-sqlite/test/runs-index.test.ts`, `EXPLAIN QUERY PLAN` on the exact SQL `listRecords` builds). `packages/ag-ui/src/index.ts`'s `resolveRunId` and `profiles/harness/src/index.ts`'s `session()` both call `listRuns` instead of scanning. Regression tests: `packages/ag-ui/test/reconnect.test.ts` ("thread → run mapping is durable"), `profiles/harness/test/*`, `packages/runtime-api/src/conformance.ts` ("listRuns returns the caller's tenant runs oldest-first...", "50 concurrent startRun calls all succeed and listRuns returns them in start order").
**Evidence:** `.agents/evidence/2026-09-25-shared-state.md`.

## DEBT-020 — `spawnSubagent` needs a completion resolver that only `createHarness` provides
**Status:** Open
**Requirement(s):** none (profile-harness public API)
**Observed (DeepSeek Harness reconstruction, 2026-09-27, finding F2):** `@cognate/profile-harness` exports `spawnSubagent`, which waits on a `run_completion` continuation, but the resolver that settles those continuations lives inside `createHarness`. An app composing `createRuntime` directly had to copy it; the reconstruction later dropped it when delegation followed the reference's fire-and-forget semantics.
**Consequence:** A blocking `spawnSubagent` hangs forever outside `createHarness` unless the app re-implements the resolver.
**Exit criterion:** The resolver is exported (e.g. `watchSubagentCompletions(runtime, caller)`), `createHarness` uses it, and a test proves `spawnSubagent` completes on a hand-composed runtime.

## DEBT-021 — A projection read carries no position, so a live reader can stay stale
**Status:** Open
**Requirement(s):** none (client projection read model)
**Observed (CopilotKit reconstruction, 2026-09-29, found fixing J-C):** `Engine.dispatch` (`packages/client/src/index.ts:503-516`) calls `ProjectionStore.scheduleRefresh()` for every projection store on every dispatched event, so a live `useProjection` reader is refreshed whenever an event arrives. `ProjectionStore.refresh()` then issues `RuntimeService.readProjection`, which returns only `{ key, value }[]` (`packages/runtime-api/src/types.ts:182`) with no folded position. The runtime materializes projections asynchronously in its own runner, so when the event that triggered the refresh reaches the client the corresponding fold is usually not written yet, and the read returns the previous fold. Because another refresh happens only on the *next* event, a stale value sticks indefinitely whenever the triggering event is the last one for that projection. Observed concretely in J-C: a terminal caller `state.changed` (which carries `runId: null`) did reach the client — the `ThreadSharedStateStore` advanced from version 1 to version 2 and re-rendered — and `Engine.dispatch` did refresh `shared-state-canvas`, yet `useProjection` kept returning the agent-only fold, while a direct `readProjection` issued 500 ms later returned the correct merged value.
**Consequence:** `useProjection` is not a reliable live read model: it is eventually consistent with no signal to the reader, and can remain stale permanently rather than merely late. A surface that renders live state from a derived projection instead of the live durable store will show the wrong value. Existing consumers already compensate with flat sleeps — `validation/reconstructions/deepseek-harness/tests/drivers/cognate.ts:254-260` documents waiting out a refresh burst on replay and relying on `ProjectionStore`'s generation guard to discard responses that resolve after a newer request was issued, and notes a store's value can stay `undefined` well past a short fixed wait.
**Exit criterion:** A projection read reports the position it has folded to (the stores already hold this: `StoreApi.getProjection(name)` returns a `ProjectionCheckpoint` with `position`, `packages/store-sqlite/src/index.ts:443` and `packages/store-memory/src/index.ts`, used by the runner for catch-up, but it is not reachable through `RuntimeService`), and `ProjectionStore` re-reads until its value covers the position of the event that triggered the refresh. A test proves a mounted `useProjection` reader converges after a projection-materialising write without a fixed sleep.


## DEBT-022 — CubeSandbox provider absent; candidate forks are local directory copies
**Status:** Open
**Requirement(s):** none (cybernetic-navigation proof, spec W3)
**Observed (2026-10-03):** `/dev/kvm` does not exist in this WSL2 environment and `sudo` needs a password; CubeSandbox's daemon stack (CubeAPI/Master/Cubelet, MySQL, Redis, root install, KVM) cannot be installed here. Candidate worlds are forked by `world.fork` as a copied directory registered as an `@cognate/execution` local world (`metadata.cubeSandbox: "absent"`).
**Consequence:** Fork isolation is filesystem-level only: a candidate process runs as the same OS user on the same host. Lineage, hashes and evidence do not depend on the sandbox, so swapping the provider changes isolation, not truth. No claim of CubeSandbox support is made.
**Exit criterion:** A CubeSandbox (or other KVM/microVM) `ExecutionWorldProvider` passes `executionWorldConformance` on a KVM host and `J-COG-cleanup` runs unchanged against it.

## DEBT-023 — Cognitive capabilities are not bound to `.sea` anchors
**Status:** Open
**Requirement(s):** none (building-with-cognate rule: bind real capabilities explicitly)
**Observed (2026-10-03):** `case.*`, `world.*`, `criterion.freeze`, `verification.run`, `risk.assess`, `experiment.*`, `method.*`, `ui.*` are published without `semanticRef`. The interaction model's `.sea` and handoff files carry another tranche's uncommitted edits (remote workspaces), so extending them here would interleave two tranches in one hunk set.
**Progress (2026-10-04):** the execution-world capabilities (`process.exec` family, `execution.world.connect|disconnect|probe|check`) are now bound to the existing `ExecutionWorld` / `WorldConnection` entities (BINDINGS #24-28). The cognitive-navigation capabilities remain unbound.
**Consequence:** Runs record these invocations without semantic anchors (traceability rule #2 is unmet for them). No grammar change is needed; the model needs Entities (e.g. Case, WorldSnapshot, Criterion) and `bindCapabilities` entries.
**Exit criterion:** The remote-workspaces edits are committed, the model is extended with the existing grammar, `domainforge-output.txt` / `cognate-adapter-output.txt` are regenerated, and BINDINGS.md lists the new bindings.

## DEBT-024 — Proof gaps against the cybernetic-navigation spec
**Status:** Open
**Requirement(s):** none (spec `.agents/specs/cybernetic-navigation-proof.md`)
**Observed (2026-10-03):** Not implemented: a UI path that creates a Case from a human purpose (Cases are opened through the `case.open` capability); `criterion.revise` as a capability/UI (pure `reviseCriterion` exists, so an observer-gap revision cannot be exercised end to end); parallel candidate search and ownership-based subagent concurrency; payment/budget estimates (none are supportable yet, so none are shown); recovery to a prior settled world (materialize/fork from an old `worldHash`); plan-deviation representation; method-recommendation controls other than Accept (Test candidate / Request evidence / Reject would be dead controls); a general model-tool catalog narrowing by `capabilityNeighborhood` (only the `ui_*` tools are Case-gated); the Revise action of the preflight (the existing Reject/Allow once card carries the Surface).
**Consequence:** The proof shows the semantics and the single-candidate and bounded-search journeys; it does not yet show these affordances.
**Exit criterion:** Each item is either implemented with a journey test or dropped from the spec with a recorded decision.

## DEBT-025 — WebMCP verified against a polyfilled registry only; approval card precedes its continuation
**Status:** Open
**Requirement(s):** none (spec U2)
**Observed (2026-10-03):** The WebMCP adapter calls `navigator.modelContext.provideContext`; the browser test installs a polyfill with that shape. Native browser support was not exercised. Separately, the console's approval card renders from `tool.approval.requested`, before `continuation.opened`, so an immediate click can find nothing to resolve (found by `E2E-cognitive-console`; the test waits for the continuation). `useProjection` staleness (DEBT-021) is hedged with a 1.5 s refresh.
**Consequence:** A fast human click on a fresh approval card can be a silent no-op; native WebMCP behaviour is unproven.
**Exit criterion:** The card disables its buttons until the continuation is open; the adapter is run in a browser that ships WebMCP.

## DEBT-026 — Remote execution worlds: residual risks
**Status:** Open
**Requirement(s):** none (`.agents/plans/remote-workspaces.md`)
**Observed (2026-10-04):** (1) `wsl.exe` fails intermittently at the Windows level on this machine: plain `wsl.exe -e true` took 9–20 s, and WSL logs `UtilAcceptVsock:280: accept4 failed 110` / `Wsl/Service/WSAETIMEDOUT` when its Windows↔Linux handshake times out. Rapid per-operation launches made the live gate stall in most runs. The provider now runs files *and* commands over a pool of persistent sessions (steady state launches nothing; a 150 s soak ran 1370 commands with zero stalls) and the dialog/capability retry and report WSL's own message. Final live-gate record: 6 consecutive clean runs after the last change, but earlier iterations of the same gate failed roughly 1 run in 5 from WSL itself (the app-level test now retries the distro list up to 3 times, as the dialog's "Try again" does). (2) The SSH symlink containment check is check-then-use. (3) SSH `version` is `mtime(seconds):size`, so a same-size rewrite within one second is not detected as a change. (4) No `@cert-authority`, keyboard-interactive/2FA, or non-POSIX remote login shell. (5) The WSL provider was only run from inside WSL; a native Windows host running Bun is untested. (6) WSL session start-up (not steady state) still depends on `wsl.exe` launching.
**Consequence:** Starting a WSL world can fail or be slow when WSL's service is unhealthy (reported with `wsl.exe`'s message, never silently local). Rare same-second same-size edits may not trip staleness checks.
**Exit criterion:** A content-hash `version`, a containment check that holds across the operation (or `openat`-style), a native-Windows run of the live gate, and a fresh live-gate record on a healthy host.
