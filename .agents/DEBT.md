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
**Exit criterion:** Upstream typed diagnostics replace message matching, or pinned-version golden tests cover every classified message shape and version upgrades fail on drift.

## DEBT-003 — DomainForge kinds without a V0 Graph accessor
**Status:** Accepted V0 scope limit (open for a later binding)
**Requirement(s):** CG-SEM-001
**Observed:** ConceptKind has 9 kinds; the Graph binding exposes collections for Entity, Resource, Flow, Instance, Role, Relation only. Policy is add/evaluate JSON only; Metric, Dimension, Unit, Mapping, Projection, External have no Graph accessor.
**Consequence:** The adapter's mapping table marks these unmapped in V0; they never become capabilities.
**Recommended action:** Keep the explicit unmapped rows. Extend the adapter only when an application requirement needs one of these kinds and a pinned binding exposes a read accessor; prove the new mapping with a golden fixture.
**Exit criterion:** A later binding exposes them and the mapping table plus golden fixtures are extended.

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
**Status:** Open (AK-008 blocked)
**Requirement(s):** AK-008, CG-CAP-001
**Observed:** `@ruvector/sona` 0.1.8 exposes trajectory/LoRA learning (`applyMicroLora`, `findPatterns`), no rank/score/select API; its README `TrajectoryBuilder` API does not match the shipped binding.
**Consequence:** No profile claims SONA-backed `adaptive_ranking`. Adaptive ranking is a Cognate-owned outcome-based ranker behind the capabilities selector contract, contained by deterministic eligibility.
**Exit criterion:** A SONA release (or another adaptive library) passes a candidate-bounded ranking fixture.

## DEBT-009 — RealityTrace CLI cannot carry Cognate correlation ids
**Status:** Open (AK-006 blocked; CG-RT-002 implemented with a narrower CLI proof)
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

## DEBT-016 — Cognate packages are not published to a registry
**Status:** Open
**Requirement(s):** CG-CLI-001
**Observed:** All `@cognate/*` packages are private workspace packages with internal `workspace:*` dependencies; `bunx cognate create` from npm (README Quick Start) cannot work. `cognate create --source <checkout>` packs the packages (`bun pm pack`) into the generated app and pins them with `overrides`.
**Consequence:** The Quick Start requires a local checkout. Versions are `0.0.0`; no release, changelog, or provenance process exists.
**Exit criterion:** A release process publishes versioned packages (with provenance) and `bunx cognate create my-app` works from a clean machine.

## DEBT-017 — Bun 1.4.0 `toMatchObject` mutates the received object
**Status:** Open (worked around in tests)
**Requirement(s):** CG-CLI-001 (observed); any test that reads an object after matching it
**Observed:** `expect(actual).toMatchObject({ x: expect.any(Number) })` passes and then leaves `actual.x` as `{}` (also with `expect.stringMatching`). Reproduced in isolation on Bun 1.4.0 (`.agents/evidence/2026-09-25-releases.md`).
**Consequence:** A later assertion on the same object fails spuriously (or, in the worst case, compares mutated values). Tests must match a `structuredClone` of the value when using asymmetric matchers and reading the value afterwards. A single-line heuristic scan of all tests and kits (2026-09-25) found no other read-after-match; multi-line matches were not scanned.
**Exit criterion:** A Bun release without the defect is pinned and the isolated repro passes, or all such matches are audited to use clones.
