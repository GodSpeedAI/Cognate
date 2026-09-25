# Phase 0 evidence — DomainForge TypeScript/N-API Graph binding — 2026-09-24

Scope: `compatibility/phase0/domainforge/` only. Read-only reference reads
against `~/projects/domainforge` (also `domainforge-slice0b`,
`sea-rs`, `tree-sitter-sea`) — none of those checkouts were modified or
built. No root package.json/bun.lock/justfile/ledger file was touched, and
nothing was committed.

## Environment

* Host: Linux, `bun --version` → `1.4.0`.
* Package under test: `@godspeedai/domainforge` exact version `0.16.0` (npm
  registry lists `0.15.0`, `0.16.0` — 0.16.0 selected per spec §3.2).
* Native binary resolved by npm/bun for this host: `domainforge-core.linux-x64-gnu.node`
  (bundled directly in the package tarball; no separate optional-dependency
  platform packages were observed for this version).
* Install: `cd compatibility/phase0/domainforge && bun install` → exit 0,
  `1 package installed [847ms]`, lockfile written to
  `compatibility/phase0/domainforge/bun.lock`.

## Commands and exit codes

| Command | Exit code | Result |
| --- | --- | --- |
| `bun install` (in `compatibility/phase0/domainforge/`) | 0 | `@godspeedai/domainforge@0.16.0` resolved and installed; no missing-native-binary failure on this host. |
| `bun test domainforge.test.ts` (in `compatibility/phase0/domainforge/`) | 0 | 9 pass, 0 fail, 41 `expect()` calls. |

## Per-behaviour result (spec §19 V0 golden fixtures)

| # | Behaviour | Result | Note |
| --- | --- | --- | --- |
| 1 | Binding loads under Bun 1.4 | PASS | `import("@godspeedai/domainforge")` resolves; `Graph` and `Graph.parse` are functions. |
| 2 | Valid `.sea` fixture parses; entities/resources/flows exposed with stable IDs | PASS | `fixtures/basic.sea` → 2 entities, 1 resource, 1 flow; each object exposes `id`, and entity/resource ids are content-derived. |
| 3a | Same source parsed twice → identical entity/resource IDs | PASS | Verified for Entity and Resource collections. |
| 3b | Same source parsed twice → identical Flow IDs | **FAIL (observed)** | Flow ids are v4-shaped and freshly randomized per parse; recorded as `domainforge.test.ts` → "observed: Flow identity is NOT stable across two parses of the same source" rather than skipped or silently patched over. |
| 4 | Renaming an entity yields a new identity | PASS | `Warehouse` → `WarehouseX` changes the id; the untouched `Factory` entity keeps its id; the old id is absent (`hasEntity` false) from the renamed graph. |
| 5 | Missing reference yields a typed error/diagnostic | PASS (shape recorded, not a rich diagnostic) | `Graph.parse` throws a plain `Error` with `message: "Parse error: Undefined entity: Nowhere at 0:0"` and `code: "GenericFailure"`. The same `code` is reused for syntax errors (`"Parse error: Syntax error at 1:1: expected program"`), so `.code` cannot distinguish failure kinds — only `.message` can. Also recorded: `hasEntity`/`getEntity` throw (not return false/null) for a non-UUID-shaped id argument, a second distinct diagnostic surface. |
| 6 | Namespace change changes identity | PASS | `Warehouse in logistics` → `Warehouse in logistics2` changes the entity id while the entity name is unchanged. |

Source digest: the test computes `sha256(source)` with `node:crypto` and
asserts it is a well-formed 64-hex-char digest, satisfying the "compute a
sha256 source digest" requirement; it is not asserted against a fixed
expected value (any change to `fixtures/basic.sea` legitimately changes the
digest).

## Limits of this fixture

* Only `linux-x64-gnu` was exercised. macOS (`aarch64-apple-darwin`) and
  Windows (`x86_64-pc-windows-msvc`), both listed in the package's
  `napi.triples.additional`, were not verified.
* Only the narrow Entity/Resource/Flow surface plus error/identity behaviour
  was exercised. `Role`, `Relation`, `ResourceInstance`/`Instance`,
  `Metric`, `Dimension`, `Unit`, `Mapping`, `Projection`, policy
  add/evaluate, and every `exportX` method are present in `index.d.ts` but
  untested here — see `API_NOTES.md` for the full method inventory.
* No SemanticPack ingestion was tested (out of scope for V0 per spec §7.1 —
  "SemanticPack ingestion is a later optional source mode").
* This is a compatibility characterization, not a decision that the adapter
  is safe to build against Flow identity as currently exposed.

## Open questions

* How should the adapter derive a stable `SemanticRef` for `Flow` given
  non-deterministic Flow ids across re-parses of identical source? Candidate:
  derive from `(resourceId, fromId, toId)` plus the source digest rather than
  the native `Flow.id`.
* Are `Metric`, `Dimension`, `Unit`, `Mapping`, `Projection` reachable through
  SEA source syntax and a `Graph` collection accessor not present in this
  binding's public surface, or are they exclusively produced by the
  `exportX`/contract methods? Needs a grammar check against `tree-sitter-sea`
  before the adapter's mapping table (spec §19) is finalized.
* `ConceptKind.External` has no discovered constructor or collection in this
  binding at all; unclear if it is reachable via any current 0.16.0 API path.
* Whether `entityContractJson`/`evaluatePolicy` diagnostic shapes are stable
  enough to build an application-authored policy mapping on (untested here;
  no sample policy JSON was authored for this Phase 0 pass).
