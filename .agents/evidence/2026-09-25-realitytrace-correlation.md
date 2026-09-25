# RealityTrace structured correlation (AK-006, CG-RT-002) — 2026-09-25

**Upstream change:** RealityTrace PR #2 (merged by the operator) added `ingest --extensions
<json-object>` and fixed the envelope builder so `extensions` is an object, per the CEP schema.
Released as `realitytrace-v0.3.0` (commit dfadf6a). The crates.io upload of `realitytrace` hit
the new-crate rate limit (429) at the time of writing; Cognate does not depend on it, because
`just setup-realitytrace` builds from the git tag.

**Cognate change:**
- `justfile` pins `realitytrace-v0.3.0`; vendored CEP schema verified byte-identical at v0.3.0.
- `@cognate/realitytrace` `record()` sends `--extensions {"cognate": {...correlation fields}}`;
  new `readCorrelation(targetRef)` reads `extensions.cognate` from the committed record via
  `ledger export` (null when no record sits at that position).

**Contract first:** the new adapter test failed before the adapter change (1 of 6 failing:
`readCorrelation` absent).

**Proofs:**
- AK-006 (`compatibility/phase0/realitytrace`, 11 pass): `--help` documents `--extensions`;
  live round-trip: ingest with extensions → `ledger export` shows them on the single committed
  `observation.recorded` record, schema-valid; a duplicate delivery carrying *different*
  extensions reports `already_committed` at the same ledger position and the first value stays;
  non-objects, invalid JSON and the reserved `domainforge` key are rejected without committing.
- CG-RT-002 (`packages/realitytrace`, 16 pass): the adapter's committed record carries the
  correlation ids; a duplicate resolves to the same record and ids; an unknown position reads null.
