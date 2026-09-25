# RealityTrace (SXR) CLI + CEP schema — Phase 0 API notes

Characterized first against a local RealityTrace checkout at commit
`f7fb1c307e1f7ceb15468986330e5ca8c9248d19` (binary `sxr`), then re-run on
2026-09-25 against the released `realitytrace` 0.2.0 CLI (tag
`realitytrace-v0.2.0`, commit 6966fa4), installed with
`just setup-realitytrace` (`cargo install --git … --tag realitytrace-v0.2.0 --locked`).
v0.2.0 renames the binary `sxr` → `realitytrace`; the commands, flags, JSON
shapes, and idempotency behaviour below are unchanged. See
`.agents/evidence/phase0-realitytrace.md` for transcripts.

## Prerequisite command order (docs/tutorials/quickstart.md; executed live)

```
sxr repo enroll <path> --json                                            → repo_id, checkout_id
sxr question declare --repo <id> --file <q.json> --json                  → question_id
sxr threshold declare --repo <id> --question <qid> --file <t.json> --json → threshold_id
sxr run begin --repo <id> --snapshot <snap> --question <qid> --threshold <tid> --json → run_id
sxr plan create --run <id> --verifier <v> --target <target> --json       → plan_id
sxr ingest --run <id> --verifier <v> --stdin-format <fmt> [--spool] [--async-mode] --json < bytes
```

- `--snapshot` accepts the literal `snapshot:genesis` without calling `sxr
  snapshot create` (which needs `SXR_DOMAINFORGE_BIN`, not built here).
- `question declare`/`threshold declare --file` copy the **entire** input
  file verbatim into `representations[].inline_content` of their record, in
  addition to reading a few named fields out of it (observed, not
  documented as a stable contract).

## The adapter entry point: `sxr ingest`

Reads a verifier byte stream from **stdin**, commits an
`observation.recorded` record (`sxr-cli/src/commands.rs::ingest`,
`build_ingest_envelope`). This is the only CLI surface turning
externally-produced bytes into an observation.

**Key finding**: `sxr ingest` exposes no flag for caller-supplied
correlation data. Its only flags (verified via `--help` and
`main.rs::IngestCmd`) are `--run`, `--verifier`, `--stdin-format`,
`--spool`, `--async-mode`. The whole envelope — `observation_id` (fresh
ULID), `subject_refs`, `provenance_refs` (`plan:<plan_id>`), and
`representations[].inline_content` (`exit_code`, `crashed`, `stderr_ref`,
`parsed`) — is built server-side. No argument attaches a Framework event
id, run id, or correlation id.

The CEP schema **does** provide schema-valid open extension points
(verified against `schemas/cep-semantic-envelope.schema.json`):
- `extensions` (CEP-0008 §39, top-level object, unconstrained) — sanctioned
  home for domain-specific data.
- `representations[].inline_content` (CEP-0008 §14.2/§22, schema `{}`) —
  any JSON value.

Both proven schema-valid in `realitytrace.test.ts` via a hand-built
envelope shaped like `sxr ingest`'s real output plus a `cognate: {...}`
payload. **No live command round-trips this** — `ingest` never reads a raw
envelope from the caller, so this is a schema-level proof, not end-to-end.
Bridging the gap needs either an sxr CLI change, or Cognate falling back to
the `question.declared`/`threshold.declared` `inline_content` passthrough,
or keeping correlation entirely in Cognate's own store.

## CEP Semantic Envelope schema (canonical full profile)

`schemas/cep-semantic-envelope.schema.json`, JSON Schema 2020-12.

Required root fields (12): `envelope_id`, `cep_version`, `envelope_version`,
`envelope_kind`, `created_at`, `created_by`, `scope`, `boundary_record`,
`completeness_status`, `provenance_refs`, `omission_status`, `lineage_refs`.
Plus `anyOf`: `validation_status` or `conformance_status`, AND ≥1 non-empty
entity section (`observations`, `representations`, `states`, ...).

**Closed at every level**: `additionalProperties: false` at schema root and
inside each record item (`observations[]`, `representations[]`, ...).
Unknown keys anywhere closed fail validation — verified with a minimal
custom recursive checker (not a generic JSON-Schema engine) directly
against the schema file.

`observations[]` item (closed): required `observation_id`; optional
`observed_entity_ref`, `observer_ref`, `perspective_ref`, `method`,
`timestamp` (RFC 3339), `representation_ref`, `scope`, `confidence`,
`limitations`.

`representations[]` item (closed at its top level; `inline_content` inside
is open): required `representation_id`, `representation_kind`,
`representation_type`; optional `content_ref`/`content_hash`/
`semantic_hash` (hash patterns), `inline_content` (`{}`), `content_availability`,
`size_bytes`, `media_type`, `preserved_*`, `omission_record`,
`uncertainty_record`, `provenance_record`, `confidence`, `validation_status`.

## Record kind: `observation.recorded` (docs/reference/record-kinds.md)

| Field | Value |
| --- | --- |
| CEP envelope_kind | `execution_trace` |
| Required subject-ref prefixes | `observation:`, `run:`, `target:` |
| Allowed predecessors | committed `plan.created`; plus `run.started` |
| Authority class | `runtime-authoritative observation` |

## Receipt shape (sxr-output-v1.json + observed `ingest` output)

`sxr ingest --json`: `run_id`, `verifier`, `bytes_received`, `durability`
(`"committed"|"queued_for_commit"|"spooled"|"failed"`), `daemon` (bool),
`observation_id`, `idempotency_key`, `already_committed` (bool), `parsed`
(`{test_count,passed,failed,ignored}`|`null`), `ledger_position`
(`{ledger_id, append_ordinal}`). **No evidence/settlement vocabulary** in
this receipt — confirmed live.

Evidence and settlement are separate, later, explicit commands:
`sxr evidence create --run <id> --observation <id> --derive --json`,
`sxr run finish --run <id> --json`,
`sxr settlement register --run <id> --question <id> --threshold <id> --transformation <ref> --json`.

**Observed doc drift**: `docs/reference/cli.md` documents `evidence
create`'s output as `{ evidence_id, direction }`. The real binary's
response has **no top-level `direction`** — only `evidence_id`,
`durability`, `ledger_position`, `derivations[]`. Direction is recoverable
only from `derivations.find(d => d.field === "confidence_impact")
.inputs.direction` (observed: `"supports"`, or `"unknown"` when the source
observation's `exit_code` is `null`).

`sxr settlement register --json` (observed, undocumented in cli.md):
`{debt_id, durability, ledger_position, missing_evidence: string[],
settlement_id, settlement_status: "settled"|"unsettled",
state_update_recommendation, unresolved_contradictions}`. With `"unknown"`
-direction evidence: exit `0`, `settlement_status: "unsettled"`,
`missing_evidence: ["no qualifying supporting evidence"]` — settlement is
SXR's own computation, not copied from earlier receipts.

## Idempotency / duplicate delivery (verified live)

Key is `sha256(run_id + "+" + verifier + "+ingest+1")` — keyed on
`(run_id, verifier)`, **not** any caller-supplied observation id.

- First `ingest` for `(run, verifier)`: `already_committed: false`, new
  `ledger_position`.
- Second `ingest`, same `(run, verifier)` (any stdin bytes): same
  `idempotency_key`; ledger append is a no-op
  (`AppendOutcome::AlreadyCommitted`); `already_committed: true`, **same**
  `ledger_position` as the first call.
- **Surprise**: `build_ingest_envelope` mints a fresh ULID for
  `observation_id` on *every* call, before the idempotency check. The
  duplicate call's JSON reports a freshly-minted, never-committed
  `observation_id`. Callers MUST check `already_committed`, not compare
  `observation_id` values, to detect duplicates.
- `--spool` (opt-in, exit `75`, never `0`) pre-mints and stores the
  observation id so `spool drain` reproduces the same envelope — this path
  does carry the id through, unlike direct re-ingest.

## Exit codes (docs/reference/exit-codes.md)

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 2 | Usage/diagnostic error |
| 3 | Precondition failed |
| 4 | CEP-0008 validation failed |
| 5 | Cryptographic ledger integrity failure |
| 6 | Verifier process failure |
| 75 | Spooled (never success) |

## Verified examples

All commands above were executed by `realitytrace.test.ts` (3 consecutive
green runs) against the pinned-commit binary, in a fresh temp
`XDG_DATA_HOME`/`XDG_STATE_HOME` and toy git repo. Exact transcripts and
exit codes: `.agents/evidence/phase0-realitytrace.md`.

## Open questions

- Whether a future sxr release adds an `--extension`/raw-envelope flag to
  `ingest`, closing the gap between "CEP allows correlation extensions" and
  "the CLI has no way to attach them," is unresolved.
- Whether the `question`/`threshold` `inline_content` passthrough is a
  supported contract or an implementation incidental was not resolved from
  the docs; treated here as observed fact only, not a stable API.
