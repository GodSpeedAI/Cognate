# Debt and gap register

Every known gap, shortcut, or blocked requirement has an entry here. A ledger requirement with `status: blocked` must cite one of these IDs (`scripts/check-substrate.ts` enforces it). Close an entry only with a cited commit and passing gate; do not delete it — mark it **Closed**.

Format: `## DEBT-NNN — title`, then **Status**, **Requirement(s)**, **Observed**, **Consequence**, **Exit criterion**.

## DEBT-001 — DomainForge Flow ids are random per parse
**Status:** Open (mitigation required in adapter)
**Requirement(s):** AK-003, CG-SEM-001, CG-SEM-002
**Observed:** `@godspeedai/domainforge` 0.16.0 assigns a fresh v4-shaped UUID to each Flow on every `Graph.parse`; Entity/Resource ids are stable (`compatibility/phase0/domainforge/domainforge.test.ts`, "observed: Flow identity is NOT stable").
**Consequence:** A native Flow id cannot be a `SemanticRef` identity. The adapter must derive Flow identity from (resource, from, to) plus source digest.
**Exit criterion:** CG-SEM-002 proves derived Flow identity is stable across parses, or upstream publishes stable Flow ids and AK-003 is re-run.

## DEBT-002 — DomainForge errors share one code
**Status:** Open
**Requirement(s):** AK-003, CG-SEM-001
**Observed:** Missing-reference and syntax errors both throw `Error` with `code: "GenericFailure"`; only `.message` differs. `hasEntity`/`getEntity` throw on non-UUID input.
**Consequence:** The adapter classifies failures by message text, which is fragile across DomainForge releases.
**Exit criterion:** Upstream typed diagnostics, or a pinned-version golden test of every message the adapter classifies (part of CG-SEM-002).

## DEBT-003 — DomainForge kinds without a V0 Graph accessor
**Status:** Open (by design for V0)
**Requirement(s):** CG-SEM-001
**Observed:** ConceptKind has 9 kinds; the Graph binding exposes collections for Entity, Resource, Flow, Instance, Role, Relation only. Policy is add/evaluate JSON only; Metric, Dimension, Unit, Mapping, Projection, External have no Graph accessor.
**Consequence:** The adapter's mapping table marks these unmapped in V0; they never become capabilities.
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
**Status:** Open (RVF adapter blocked per ADR-0006 until mitigated)
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
**Status:** Open (AK-006 blocked; CG-RT-002 blocked)
**Requirement(s):** AK-006, CG-RT-002, CG-RT-003
**Observed:** sxr @ f7fb1c3 (built out-of-tree): the full enrollment → question → threshold → run → plan → ingest → evidence → settlement workflow runs, and `sxr ingest` returns a receipt; but `ingest` accepts only `--run/--verifier/--stdin-format/--spool/--async-mode`. The CEP schema has open `extensions` / `representations[].inline_content` fields, yet no CLI surface submits a raw envelope, so correlation ids cannot be attached to a live record. Duplicate ingest is keyed on run+verifier, and the duplicate response reports a fresh, never-committed `observation_id`; only `already_committed` plus an unchanged `ledger_position` reveal the dedup.
**Consequence:** Spec §20 correlated delivery cannot be claimed. Cognate's observation port, outbox delivery, and receipt persistence can be built and tested against the real CLI, but correlation lives only in Cognate's own mapping (keyed by `ledger_position`), not inside SXR records.
**Exit criterion:** SXR exposes a documented envelope/extension submission path and AK-006 proves a correlated record round-trips.

## DEBT-010 — RealityTrace gate depends on a locally built binary
**Status:** Open
**Requirement(s):** AK-006, CG-RT-002
**Observed:** The fixture spawns `SXR_BIN` (default `.tmp/sxr-target/release/sxr`, built from the local sxr checkout in ~7 min). No published binary or pinned release artifact exists.
**Consequence:** The gate fails on a machine without that build; it does not skip.
**Exit criterion:** A pinned, downloadable SXR release artifact, fetched by a setup recipe.
