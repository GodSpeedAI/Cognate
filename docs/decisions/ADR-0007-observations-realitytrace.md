# ADR-0007: Observation adapter target — RealityTrace (SXR) CLI + CEP schema

## Status

Accepted (Phase 0 characterization complete). The adapter itself is
**not yet implemented**; this ADR fixes the target surface and records the
constraints discovered while characterizing it, per
software-design-spec-cognate.-frameworkmd §20 and §37 Phase 0.

## Context

§20 requires the first RealityTrace adapter to target "RealityTrace's
documented CLI workflow and CEP record schema, with a pinned compatible
version," and forbids assuming a generic SXR SDK or arbitrary-event
ingestion API. §37 Phase 0 requires a fixture proving "the chosen CLI
serialization, artifact media type, correlation mapping, and idempotency
behavior" before any adapter can be claimed working; if the fixture fails,
the integration remains an optional, blocked adapter.

A read-only checkout of the SXR Rust CLI/ledger (`~/projects/sxr`,
commit `f7fb1c307e1f7ceb15468986330e5ca8c9248d19`) and its CEP-0008 Semantic
Envelope schema were built and exercised out-of-tree (see
`compatibility/phase0/realitytrace/` and
`.agents/evidence/phase0-realitytrace.md`).

## Decision

1. **Target the `sxr ingest` command** as the adapter's submission path.
   It is the only documented CLI entry point that turns externally-supplied
   bytes into an `observation.recorded` ledger record
   (`sxr repo enroll` → `sxr question declare` → `sxr threshold declare` →
   `sxr run begin` → `sxr plan create` → `sxr ingest`, verified live).

2. **Pin to the built commit** above until a newer sxr release is
   separately characterized. No generic SDK or socket protocol is assumed;
   the daemon's Unix-socket wire format exists only to queue the exact
   envelope the CLI itself would have built (`sxr-cli/src/daemon.rs`,
   `submit_to_daemon`) — it is not a separate integration surface.

3. **Do not claim correlation-id carriage as a working feature yet.**
   Phase 0 found that `sxr ingest` exposes no flag (`--run`, `--verifier`,
   `--stdin-format`, `--spool`, `--async-mode` only) for attaching a
   Framework event id, run id, or correlation id to the envelope it builds.
   The CEP schema legitimately supports this — `extensions` (CEP-0008 §39,
   unconstrained object) and `representations[].inline_content` (CEP-0008
   §14.2, unconstrained `{}`) are both schema-valid, closed-schema-safe
   extension points, proven in `realitytrace.test.ts` by validating a
   hand-built envelope against the shipped schema file — but **no live
   command bridges caller data into either field today**. Per §20 ("Framework
   correlation identifiers may use documented extension/reference fields;
   unknown root or observation properties MUST NOT be inserted into closed
   schemas"), the adapter therefore has a real, schema-legal home to put
   correlation data once the CLI gains a way to pass it through, but cannot
   attach it via the current `sxr ingest` command.

4. **Persist the Framework event ID ↔ SXR observation ID/receipt/ledger
   position mapping in Cognate's own store**, not by relying on `sxr ingest`
   round-tripping a caller-chosen id. Two reasons, both verified:
   - `sxr ingest` mints its own `observation_id` (ULID) server-side; there
     is no way to request a specific value for a direct-commit call.
   - Idempotency is keyed on `(run_id, verifier)`
     (`sha256(run_id + "+" + verifier + "+ingest+1")`), **not** on any
     caller-supplied identifier. A duplicate `ingest` call for the same
     `(run, verifier)` returns `already_committed: true` and the
     **original** `ledger_position`, but its JSON response still reports a
     **freshly-minted, never-committed** `observation_id`. Cognate's
     reconciliation logic MUST key off `already_committed` +
     `ledger_position`, never off comparing `observation_id` values across
     calls.

5. **Treat evidence and settlement as strictly separate, later, optional
   operations**, never inferred from an ingest receipt. Verified: the
   receipt JSON carries no `direction`/`relevance`/`reliability`/
   `settlement_*` fields; `sxr evidence create --derive` and
   `sxr settlement register` are separate commands requiring the declared
   question/threshold, consistent with §20's "SXR remains the authority for
   its evidence and settlement records."

6. **Status per §37 Phase 5 success criterion**: the fixture proves
   prerequisites, an accepted receipt, and duplicate-retry behavior (points
   1, 2, and 4 of the success criterion). It does **not** yet prove the
   "DomainForge → SemanticRef → runtime execution → event → queued
   RealityTrace observation" correlation chain end-to-end, because that
   requires the Cognate runtime side (events, outbox, adapter code), which
   does not exist yet. This ADR unblocks building that adapter against a
   characterized target; it does not itself constitute the adapter.

## Consequences

- The Phase 1+ RealityTrace adapter implementation should treat
  `--extension`/raw-envelope submission as **not available** in the pinned
  sxr version, and must not silently drop correlation ids — it should
  either (a) request an sxr CLI enhancement upstream, or (b) fall back to
  carrying correlation data through `question.declared`/
  `threshold.declared`'s verbatim `inline_content` passthrough (observed,
  not documented as stable) if per-question correlation is sufficient, or
  (c) keep correlation entirely inside Cognate's own outbox/receipt store
  keyed by `ledger_position`, treating SXR as an opaque acknowledger. This
  ADR does not choose between (a)-(c); that is an implementation-phase
  decision informed by this characterization.
- Normal-mode delivery (§20) queues from a committed outbox and reconciles
  by `ledger_position`/`already_committed`, never by `observation_id`
  equality, per finding 4 above.
- If SXR is unreachable or the build fails, the adapter is optional and
  blocked, not a hard dependency — Framework event persistence is
  unaffected, matching §31.6.

## References

- software-design-spec-cognate.-frameworkmd §3.3, §20, §31.6, §37 (Phase 0,
  Phase 5)
- `compatibility/phase0/realitytrace/realitytrace.test.ts`
- `compatibility/phase0/realitytrace/API_NOTES.md`
- `.agents/evidence/phase0-realitytrace.md`
- RealityTrace repository (https://github.com/GodSpeedAI/RealityTrace) @
  `f7fb1c307e1f7ceb15468986330e5ca8c9248d19`

## Addendum (2026-09-25): structured correlation via `--extensions`

RealityTrace 0.3.0 (tag `realitytrace-v0.3.0`) added `ingest --extensions`,
the documented submission path this ADR found missing, and `ledger export`
already served as the read path. The adapter now takes option (a): Cognate's
correlation ids go in the committed record's CEP `extensions.cognate`, and
`readCorrelation(targetRef)` reads them back. Reconciliation still uses
`ledger_position`/`already_committed`, never `observation_id`. AK-006 is
implemented and DEBT-009 is closed.
