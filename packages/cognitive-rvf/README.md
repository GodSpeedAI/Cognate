# @cognate/cognitive-rvf

RVF-backed `CognitiveIndex` (spec §18; DEBT-006 mitigations, all verified against `@ruvector/rvf` 0.3.4).

## DEBT-006 mitigations

- **No integrity on `open()`**: a Cognate-recorded `sha256` digest over the `.rvf` bytes plus
  the entries sidecar is verified in `importSnapshot` *before* any file is opened; truncated or
  tampered snapshots are rejected without ever calling `RvfDatabase.open()`.
- **`MetadataNotSupported`**: no entry is ever ingested with a `metadata` field. All provenance
  (tenant, scope, metadata, embeddings, source refs) lives in an adapter-owned `<path>.entries.json`
  sidecar, which is the only source of truth for `get`/`similar` disclosure.
- **String ids live in RVF's own sidecar**: `NodeBackend` writes `<path>.idmap.json`. Every
  filesystem copy this adapter makes (snapshot, verified import) copies that file alongside the
  `.rvf` bytes; RVF's own `branch()`/`derive()` calls already handle it internally.
- **`exportBytes`/`openBytes` unsupported**: snapshot and import operate on file paths only.

## Attached vs. detached

`importSnapshot` classifies a verified snapshot as **attached** only when the manifest's lineage
matches the target store, its checkpoint position is at or before the store's head, and the
`rvf_snapshots` collection in that store already holds a record with the same integrity digest.
Any other verified snapshot opens **detached**, with a reason string naming which check(s) failed
(foreign lineage, a checkpoint beyond the head, or simply never having been recorded there).
Anything that fails verification (bad JSON, missing files, integrity mismatch, over a limit, a
disallowed tenant) is **rejected** and nothing is opened.

## What remains unproven

- Branching a branch (nested lineage) is untested; RVF's `branch()` requires its immediate
  parent file to stay present at its original path, so snapshotting a branch (vs. a root store)
  is unverified here.
- Kernel/eBPF segments are never read or written by this adapter; whether one could be smuggled
  through a hand-crafted `.rvf` file outside this API is out of scope and untested.
- Concurrent multi-process writers to the same `.rvf` path are untested.
