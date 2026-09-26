# Task: finish closing Cognate DEBT-003 (in-progress work across two repos)

You have no prior context. Work is partly done and uncommitted. Read this fully, then continue. Do not restart.

## Background

Cognate's DomainForge adapter (`~/projects/cognate/packages/domainforge`) could only read six DomainForge kinds because the `@godspeedai/domainforge` TypeScript binding exposed only Entity, Resource, Flow, Role, Relation and Instance. DEBT-003 fixes that at the source. It is a fix to an incomplete binding, not a new feature.

The original full brief is `~/projects/cognate/.agents/prompts/fix-debt-003-domainforge-accessors.md`. Read it. It is the spec; this file is the handoff.

Repositories:
- DomainForge: `~/projects/domainforge` (core 0.17.0), on branch `fix/debt-003-domainforge-accessors`.
- Cognate: `~/projects/cognate`, on `main`.

Read each repo's `AGENTS.md` and `CLAUDE.md` first (also `packages/domainforge/AGENTS.md` in Cognate). The operator has explicitly overridden the scoped rule in `packages/domainforge/AGENTS.md` that forbids editing that package's tests, fixtures and dependency pin, for this task only.

## Standing constraints

- Never fetch, pull, reset, clean, rebase, merge or publish without the operator's say-so. Do not commit or push unless the operator asks. Do not expose credentials. No machine-specific paths in committed files.
- Policy is a referenced constraint only (spec §19, ADR-0002). It must never become a capability, permission or evaluator.
- Verify claims yourself: run the commands and read the output. Do not trust earlier reports.

## State so far (uncommitted; verify with `git status`, `git diff`)

DomainForge (16 files): Graph-owned insertion-ordered records for declared units and dimensions (`domainforge-core/src/graph/mod.rs`, `parser/ast.rs`, `lib.rs`, `primitives/concept_change.rs`). New accessors in the TypeScript, Python and WASM bindings for policies, metrics, mappings, projections, patterns, concept changes, entity instances, declared units and declared dimensions. Wrapper classes are named `DeclaredUnit` and `DeclaredDimension` to avoid colliding with existing `Unit` and `Dimension` classes. Mapping rules and projection overrides are exposed as JSON strings, and unit base factor as a string, to preserve information. Tests are in `typescript-tests/graph.test.ts` and `tests/test_graph.py`. READMEs, `index.d.ts`, `index.js` and `domainforge.pyi` were updated. A prior agent reported the focused TypeScript test at 12/12 and Python/WASM feature builds compiling. None of the Python behaviour tests, WASM tests or `just all-tests` has a verified pass.

Cognate: `packages/domainforge/src/index.ts` and `types.ts` map the new kinds (Policy, Metric, Dimension, Unit, Mapping, Projection, Pattern, ConceptChange, EntityInstance) as read-only objects. `UNSUPPORTED_KINDS` holds only External, because SEA has no grammar or Graph declaration for it. `bindCapabilities` now rejects Policy ids. `docs/semantics.md`, `test/adapter.test.ts`, and fixtures `test/fixtures/all-kinds.sea` and `all-kinds.projection.json` are updated. Against the currently pinned 0.17 package, `just gates` fails 7 gates (CG-SEM-001, CG-SEM-002, CG-RT-003, CG-CLI-001, CG-E2E-001, CG-EXM-001, CG-FAIL-001), mostly because `graph.allPolicies is not a function`. This is expected until the pin is bumped. Do not commit Cognate changes to `main` before the new binding is installable, or `main` will be broken.

Untracked and unrelated to the DomainForge fix but part of this work: `.agents/skills/building-with-cognate/` (an agent skill) and the two prompt files.

## Steps

### 1. DomainForge: verify

In `~/projects/domainforge`, run `just all-tests` (Rust, Python, TypeScript). Run it with output redirected to a file, as it compiles for several minutes. Fix any failure. Also confirm: Python module imports and the new accessors work; WASM builds; two parses of the same source give identical output (declaration order, no HashMap iteration); `git diff --check` is clean. Record exact commands and results.

### 2. Stop and hand to the operator: release

Stop here and tell the operator. They will commit, push, merge the DomainForge branch, and merge the release-please PR that publishes `@godspeedai/domainforge`. Ask for the new version number. Do not do this yourself.

### 3. Cognate, after the operator gives the new version

1. Bump the `@godspeedai/domainforge` pin and `BINDING` in `packages/domainforge/src/types.ts`. Install, and confirm `graph.allPolicies` exists.
2. Fix wording that still says "0.16.0" or the wrong version.
3. Run `just verify` and `just gates`. All must pass, with counts. Trace any remaining failure to its cause; do not edit gates to make them pass.
4. Confirm the architecture test forbidding implicit capabilities still passes, and that the golden fixture serializes byte-identically across two loads.
5. Close DEBT-003 in `.agents/DEBT.md`, keeping the entry and adding closing evidence and the exit-criterion wording. State that External remains unmapped because it is not a SEA declaration.
6. Update the CG-SEM-001 rows in `requirements/ledger.yaml`. Add an evidence record under `.agents/evidence/`. Append a status snapshot to `.agents/CURRENT_STATUS.yaml` and update `CURRENT_STATUS.md`, following `.agents/AGENTS.md`.
7. Update `.agents/skills/building-with-cognate/references/idm-to-cognate.md` (the "only six kinds" statement and its Gaps entry) and the step 3 sentence in `.agents/skills/building-with-cognate/SKILL.md` that says policies, metrics and other kinds do not reach the projection.
8. Re-run `just verify` and `just gates` after the doc edits.

### 4. Report

Changed files, exact commands with results and counts, any kind left unmapped and why. Leave everything uncommitted for the operator unless they ask you to commit.
