# Task: close Cognate DEBT-003, making every DomainForge concept kind readable from the TypeScript binding

## Goal

The Cognate project in this workspace has a semantic adapter that can't see most of the kinds DomainForge declares. The TypeScript binding exposes only Entity, Resource, Flow, Role, Relation and Instance. Close the gap at its source, in DomainForge, then use the new accessors in Cognate. This is a fix to an incomplete binding, not a new feature. The binding should expose what the language already declares.

Repositories:

- DomainForge: `~/projects/domainforge`, core version 0.17.0.
- Cognate: `~/projects/cognate`.

Read each repository's `AGENTS.md` and `CLAUDE.md` first and follow them. They take precedence over this prompt where they are stricter.

## Established facts (verify, don't assume)

- `.agents/DEBT.md` DEBT-003 in Cognate describes the debt, and its exit criterion is: "A later binding exposes them and the mapping table plus golden fixtures are extended".
- The Rust core `Graph` (`domainforge-core/src/graph/mod.rs`) already has these accessors:
  - `all_policies`
  - `all_metrics`
  - `all_mappings`
  - `all_projections`
  - `all_patterns`
  - `all_concept_changes`
  - `all_entity_instances`
- The TypeScript binding (`domainforge-core/src/typescript/graph.rs`) exposes only these:
  - `all_entities`
  - `all_resources`
  - `all_flows`
  - `all_instances`
  - `all_roles`
  - `all_relations`
  - `add_policy` and `evaluate_policy`, which take JSON strings
  - export functions
- The Python binding (`domainforge-core/src/python/graph.rs`) has the same shape. Check the WASM binding too.
- Units and dimensions live in the unit registry (`domainforge-core/src/units/mod.rs`, `units()`), not in `Graph`. Find out how a parsed file's declared units and dimensions are reached from a `Graph`.
- For `External`, find out whether the grammar, AST or `Graph` represents it at all. If it doesn't exist in the language, the debt row is wrong. Say so rather than inventing it.
- In Cognate, `packages/domainforge/src/index.ts` holds `UNSUPPORTED_KINDS` and `mappingTable`. Their reason strings still say "0.16.0" although the pin is 0.17.0. `docs/semantics.md` documents the table.

## Part A: DomainForge

1. Expose read accessors on `Graph` in the TypeScript binding for every declared kind the core can enumerate:
   - policies
   - metrics
   - mappings
   - projections
   - units and dimensions, as declared in the parsed source
   - External, only if it exists

   Return typed binding objects, following the existing `Entity` and `Flow` wrappers. Return JSON only if that is the binding's established pattern for that kind. Each object needs at least:
   - id
   - name
   - namespace
   - the kind's defining fields: a policy's expression, modality and kind; a metric's expression and unit; a mapping's or projection's target and source; a unit's dimension and base factor
2. Give the Python and WASM bindings the same accessors, as `AGENTS.md` requires.
3. Make ordering deterministic: declaration order, via `IndexMap`, and never `HashMap` iteration order. Two parses of the same source must give identical output.
4. Add binding tests in each language's existing test locations, parsing a fixture that declares every kind. Update `index.d.ts` and the binding READMEs if the project keeps them by hand.
5. Run the narrow tests, then `just all-tests`. Record the exact commands and their results.
6. Release through the repository's existing release-please workflow, as a semver minor, so that `@godspeedai/domainforge` publishes a version Cognate can pin. **Stop and ask the operator before merging a release PR or publishing.** Work on a branch and leave only `main` afterwards.

## Part B: Cognate (after the new binding version is installable)

1. Update the `@godspeedai/domainforge` pin, and update `BINDING` in `packages/domainforge/src/types.ts`.
2. In `packages/domainforge/src/index.ts`, map each new kind to a read-only `SemanticObject`, with provenance naming the accessor. Keep the table explicit and complete.
3. **Policy must stay a referenced constraint (spec §19, ADR-0002).** Expose it as a read-only object. Never turn it into a capability, a permission or an evaluator. `bindCapabilities` stays explicit, and the architecture test that forbids implicit capabilities must still pass.
4. Remove the kinds you mapped from `UNSUPPORTED_KINDS`. Keep a row for anything that is still genuinely unrepresentable, with a correct reason and version.
5. Add golden fixtures: one `.sea` file declaring every kind, plus its serialized projection. Prove that serialization is byte-identical across two loads.
6. Update `docs/semantics.md` and the relevant rows in `requirements/ledger.yaml` (CG-SEM-001). Close DEBT-003 in `.agents/DEBT.md`, keeping the entry with its closing evidence. Add an evidence record under `.agents/evidence/`. Append a status snapshot to `.agents/CURRENT_STATUS.yaml` and update `CURRENT_STATUS.md`, following `.agents/AGENTS.md`.
7. Update `.agents/skills/building-with-cognate/references/idm-to-cognate.md`: the "only six kinds" statement and its Gaps entry. Also update the step 3 sentence in `SKILL.md` that says policies and metrics don't reach the projection.
8. Run `just verify` and `just gates`, and report pass/fail with counts.

## Done when

- The DomainForge binding tests pass in all three languages.
- The new binding version is published, or the operator deferred publishing, in which case report it as blocked.
- Cognate's `just verify` and `just gates` pass.
- The golden fixture covers every kind, and DEBT-003 is closed with evidence.
- No policy became a capability.
- Nothing is committed or pushed without operator intent.

Report the changed files, the exact commands and their results, and any kind you left unmapped, with the reason.
