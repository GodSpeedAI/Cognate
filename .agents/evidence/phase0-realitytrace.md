# Phase 0 RealityTrace (SXR) compatibility fixture — evidence

Date: 2026-09-24
Environment: Bun 1.4.0, Linux (WSL2), rustc/cargo 1.98.0, repo
`/home/sprime01/projects/cognate`, fixture at
`compatibility/phase0/realitytrace/`.

## Source checkout (read-only; never modified)

- `/home/sprime01/projects/sxr` at commit
  `f7fb1c307e1f7ceb15468986330e5ca8c9248d19`
  (`git -C /home/sprime01/projects/sxr rev-parse HEAD`).
- `/home/sprime01/projects/cep` and `/home/sprime01/projects/sxr-exec006-recovery`
  were listed as available checkouts; the CEP schema actually enforced by the
  running binary lives inside the sxr checkout itself
  (`sxr/schemas/cep-semantic-envelope.schema.json`), which is what this
  fixture validates against. The separate `cep` repo's own reference
  implementation/spec was not additionally exercised — out of scope once the
  sxr-embedded schema was confirmed to be the schema sxr actually enforces.

## Build

```
CARGO_TARGET_DIR=/home/sprime01/projects/cognate/.tmp/sxr-target \
  cargo build --release -p sxr-cli --manifest-path /home/sprime01/projects/sxr/Cargo.toml
```

- Result: **succeeded**. `Finished \`release\` profile [optimized] target(s) in 6m 59s`.
- Output binary: `.tmp/sxr-target/release/sxr` (10,128,552 bytes, verified
  executable; `.tmp/` is gitignored).
- `sxr --version` → `sxr 0.1.0`.
- The sxr working tree (`git -C /home/sprime01/projects/sxr status --porcelain`)
  was not touched by the build (`CARGO_TARGET_DIR` redirected all build
  output out-of-tree); pre-existing local changes in that checkout
  (`.jolli/...` bookkeeping files) predate this fixture and were left alone.

## Test run

```
bun test compatibility/phase0/realitytrace/realitytrace.test.ts
```

Ran 3 consecutive times: **9 pass / 0 fail / 91 `expect()` calls each run**,
no flakiness observed (~550-700ms per run). No test was skipped; every test
calls `requireBinary()` first and would fail with a descriptive message if
the binary were absent, per the fixture contract.

## Per-behaviour results

| Behaviour | Result | Notes |
| --- | --- | --- |
| (1) Prerequisites workflow completes in a temp repo | PASS | `repo enroll` → `question declare` → `threshold declare` → `run begin` → `plan create`, exactly per `docs/tutorials/quickstart.md`; all real ULIDs, all `durability: "committed"`. |
| (2a) `sxr ingest` accepts an arbitrary verifier stream and returns a receipt for `observation.recorded` | PASS | `durability: "committed"`, real `ledger_position`, real `observation_id`. |
| (2b) `sxr ingest` has no flag for caller-supplied correlation data | PASS (observed) | `sxr ingest --help` lists only `--run`, `--verifier`, `--stdin-format`, `--spool`, `--async-mode`. |
| (2c) A hand-built `observation.recorded` envelope with Cognate correlation ids in `extensions`/`representations[].inline_content` is schema-valid | PASS | Checked against the live schema file at `sxr/schemas/cep-semantic-envelope.schema.json`, not a copy. Schema-level proof only — no live command round-trips a caller-supplied envelope (characterized as a gap, see ADR-0007). |
| (3) A record with an unknown root property is rejected (closed schema) | PASS (characterized) | `additionalProperties: false` confirmed at schema root and inside `observations[]` items; a custom minimal recursive checker (not a full JSON-Schema engine) flags exactly the injected unknown key. The CLI itself has no raw-envelope submission surface to round-trip this through, so this is a schema-file-level characterization, stated as such in the test and API_NOTES. |
| (4) Duplicate delivery of the same observation is detected/reconciled | PASS | Re-`ingest`ing the same `(run, verifier)` returns `already_committed: true` and the **same** `ledger_position` as the first call — a real ledger no-op, not a simulated one. |
| (4b) Surprise: duplicate call's `observation_id` differs from the originally committed one | PASS (observed) | `build_ingest_envelope` mints a fresh ULID every call, before the idempotency check; only `already_committed` + unchanged `ledger_position` reveal the duplicate. Recorded as a caller-facing footgun in API_NOTES/ADR-0007. |
| (5) Receipt does not imply evidence/settlement; those are separate commands | PASS | `ingest` receipt has none of `direction`/`relevance`/`reliability`/`settlement_id`/`settlement_status`; `evidence create --derive` and `settlement register` are separate, later, real commands, both executed live with real exit codes. |
| (5b) Surprise: `evidence create --derive`'s real output has no top-level `direction` field | PASS (observed) | Contradicts `docs/reference/cli.md`'s documented `{ evidence_id, direction }` shape; the actual field lives inside `derivations[].inputs.direction` (verified via a live, out-of-band manual run, then encoded into the test). |

## Manual, out-of-band verification transcripts (not part of the committed test, used to establish ground truth before writing assertions)

- `sxr evidence create --run <id> --observation <id> --derive --json` against
  an observation produced by `sxr verify run` (real `exit_code: 0`) returned
  `derivations[].find(d => d.field === "confidence_impact").inputs.direction
  === "supports"`, with no top-level `direction` key — confirms the doc
  drift is not an artifact of the `ingest`-without-exit-code path used in
  the committed test.
- `sxr settlement register ... --json` against the toy fixture (evidence
  derived from an `ingest`-based observation with `exit_code: null`,
  therefore `direction: "unknown"`) returned exit `0` with
  `settlement_status: "unsettled"` and
  `missing_evidence: ["no qualifying supporting evidence"]` — settlement is
  computed by SXR's own rule, not copied from the observation/evidence
  receipts.
- `sxr verify run` executes a real `cargo test` (via the `cargo-test`
  verifier profile, `argv: ["cargo","test","--offline","--message-format","json"]`)
  against the toy repo and parses its human-readable summary line
  (`test result: ok. 1 passed; ...`) via
  `sxr_verify::cargo_json::parse_test_result_line` — no nightly toolchain or
  `-Z unstable-options` needed despite the "cargo-json" naming.

## Deviations from the spec's aspirational shape

§20 describes an adapter that emits Framework correlation identifiers "in
documented extension/reference fields." Phase 0 confirms the CEP schema has
such fields (`extensions`, `representations[].inline_content`) but the
pinned sxr CLI's only observation-submission command, `sxr ingest`, does not
expose any way to populate them from the command line. This is recorded as
a real, load-bearing finding, not glossed over — see
`docs/decisions/ADR-0007-observations-realitytrace.md` for the resulting
decision (target `sxr ingest`, persist correlation mapping in Cognate's own
store, keyed by `ledger_position`/`already_committed`, not by
`observation_id` equality).

## Limits of this fixture

- `sxr snapshot create` (which invokes the DomainForge compiler via
  `SXR_DOMAINFORGE_BIN`) was not exercised; the quickstart-documented
  `--snapshot snapshot:genesis` literal was used instead, matching the
  documented tutorial path and keeping this fixture free of a DomainForge
  build dependency.
- The sxr daemon (`sxr daemon`) and `--async-mode`/`--spool` durability
  paths were read (`sxr-cli/src/commands.rs`, `docs/how-to/operate-daemon.md`)
  but not executed live; only the direct-commit path was proven. `--spool`
  is documented to exit `75` (never `0`) and to reproduce the same
  envelope on drain — not independently verified here.
- Only one toy Cargo repo (a single passing test) was used; failing-test
  and crashing-verifier observation shapes were not exercised live.
- The separate `/home/sprime01/projects/cep` and
  `/home/sprime01/projects/sxr-exec006-recovery` checkouts were inventoried
  but not separately built/run; the schema enforced by the actual sxr binary
  (embedded in the sxr checkout) was treated as authoritative for this
  fixture, per the task's framing of sxr as the adapter target.

## Open questions

- Whether a future sxr CLI release adds a way to attach caller-supplied
  extension/reference data to `sxr ingest`.
- Whether `question declare`/`threshold declare`'s verbatim `--file`
  passthrough into `inline_content` is a stable, documented contract or an
  implementation incidental (not resolved from the docs; treated as
  observed-only, not relied upon).
