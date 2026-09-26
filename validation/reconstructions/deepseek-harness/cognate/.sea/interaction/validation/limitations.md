# Validation & Limitation Report

## Tooling versions

- DomainForge CLI: `domainforge 0.16.0` (`~/.cargo/bin/domainforge`).
- Cognate's DomainForge adapter (`packages/domainforge`) pins `@godspeedai/domainforge@0.18.1` as
  a direct Rust/native binding (not a CLI subprocess) — this is the version actually used by
  `loadSemanticProjection`, and is the authority for what Cognate itself will see.

## Commands executed (see `domainforge-output.txt` and `cognate-adapter-output.txt` for full output)

1. `domainforge validate --format human interaction-model.sea` → `Validation succeeded: 0
   violations total`.
2. `domainforge validate --format json --show-source interaction-model.sea` → `{"error_count": 0,
   "violations": []}`.
3. `domainforge parse interaction-model.sea --format human` → graph parsed successfully; counts
   below.
4. `domainforge parse interaction-model.sea --ast --format human` → AST parsed successfully, 51
   declarations, namespace `deepseek-harness.interaction`, version `1.0.0`.
5. `domainforge fmt --check interaction-model.sea` → reports a reformat is available; **not
   applied** (see Limitation 1 below).
6. `bun validation/check-cognate-adapter.ts` (imports `loadSemanticProjection` from
   `packages/domainforge/src/index.ts` directly) → 0 errors, 51 `SemanticObject`s, 35
   `SemanticRelation`s, all 10 expected journey ids present under `EntityInstance` fields.

## Object counts (cross-checked two ways)

| Kind | `parse --format json` (`entities`/`resources`/.../`entity_instances`) | `@cognate/domainforge` adapter (`SemanticObject.kind`) |
|---|---|---|
| Entity | 14 | 14 |
| Resource | 11 | 11 |
| Role | 2 | 2 |
| Flow (relation, not object) | 11 | 11 (as `SemanticRelation`-contributing `Flow` objects) |
| Relation | 1 | 1 |
| Policy | 1 | 1 |
| Metric | 1 | 1 |
| EntityInstance (`Instance ... of "CanonicalJourney"`) | 10 | 10 |
| Instance (programmatic `ResourceInstance`, unused here) | 0 | 0 |

Total declarations (AST): 51 = 14+11+11+2+1+10+1+1. Matches exactly.

## Limitation 1 — `domainforge fmt` corrupts `forall` policy syntax (this CLI build)

`domainforge fmt --check`/`--out` on version 0.16.0 rewrites a `Policy ... as: forall f in
flows: (...)` body into `as: ForAll(f in flows: (...))`, a function-call form the *same binary's*
parser then rejects (`Syntax error at N:15: expected EOI, declaration, comparison_op, add_op,
mul_op, or identifier`). Reproduced independently against the repository's own
`packages/domainforge/test/fixtures/all-kinds.sea` fixture (unrelated to this file), confirming
it is a pre-existing CLI defect, not something introduced by this model. **Resolution**: the file
in this directory keeps the original, parser-valid `forall`/`count` syntax and was never passed
through `fmt --out`. `fmt --check` is left non-clean deliberately; `validate` and `parse` (the
authoritative correctness checks per `domainforge-sea/references/cli-commands.md`) both pass
cleanly. Scope: local to this DomainForge CLI build's formatter, not a recurring modeling issue —
does not meet the "credible future grammar candidate" bar in
`deriving-interaction-domain-models`'s output-and-validation.md (it is a formatter bug, not a
grammar or representation gap).

## Limitation 2 — `parse --format human` display gap on this CLI build

`domainforge parse --format human` on 0.16.0 prints `Instances: 0` and omits a `Policies:`/
`Metrics:` count line from its summary, even though the file declares 10 `Instance ... of
"CanonicalJourney"` entries, 1 `Policy`, and 1 `Metric`. `write-in-sea.md` describes a newer build
that reports `Resource instances:`/`Entity instances:` on separate lines; this build predates that
distinction in its human-readable summary. **Not a modeling defect**: `parse --format json`
correctly reports `entity_instances: 10`, `policies: 1`, `metrics: 1`, and the live
`@cognate/domainforge` adapter (the actual consumer) independently confirms the same 10
`EntityInstance` objects, 1 `Policy` object, and 1 `Metric` object with correct `SemanticRef`s.
Cross-checked in the table above.

## Semantic compromises (see also `interaction-model.sea` header comment)

- Canonical journeys have no native `.sea` primitive; represented as `Instance ... of
  "CanonicalJourney"` records with string fields carrying the narrative (steps as an
  arrow-separated sequence, not a structured list — `.sea` instance fields don't support arrays).
- `Flow "quantity 1"` denotes "one occurrence of this transformation," not a real measured
  quantity — documented, not silently asserted as a domain fact.
- Domain-authority rules (approval fail-closed default, read-before-mutation observation policy)
  are documented in prose (catalog + handoff) rather than encoded as executable `.sea` `Policy`
  declarations, because DomainForge `Policy` is a referenced constraint only and is never
  evaluated for authority on either the DomainForge or the Cognate side (`idm-to-cognate.md`
  "Gaps"). The one `Policy` in the file (`every_canonical_flow_recorded`) is a structural sanity
  check over the graph, not a domain authority rule.

## Remaining diagnostics

None outstanding against `validate`/`parse`. The only non-clean tool output is `fmt --check`,
addressed above as a known, reproduced, out-of-scope CLI defect.

## `domainforge-sea` skill usage

Followed `domainforge-sea`'s authoring checklist (metadata first, declarations before references,
policies/metrics after graph elements), its CLI playbook (`validate`, `parse --ast --format json`,
`fmt --check`), and its troubleshooting guidance (namespace-vs-domain distinction for `Instance`,
`forall`/`count` aggregate-comparison rules, quoted-vs-identifier naming). No `.sea` grammar was
invented or modified.
