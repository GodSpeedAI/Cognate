# RVF: portable cognition

RVF packages a `CognitiveIndex`'s state into a portable, file-based snapshot: lineage, branching, and (optionally) witness/attestation information (spec §6, §18). It is explicitly optional — spec §37 states RVF "SHALL NOT block a minimal kernel/event runtime" — and a failed snapshot MUST NOT corrupt the active cognitive index or event store (spec §31.4).

## Branching model (spec §18.1)

```text
base cognition
      │
      ├── user branch
      ├── agent experiment
      ├── scenario simulation
      ├── case branch
      └── test branch
```

A branch is a cognitive fork. It MUST NOT change authoritative application history — nothing about a branch is real until it is separately committed through normal framework semantics (events, capabilities; see [concepts.md](concepts.md)).

## Attached vs. detached (spec §18.2, §18.3)

An imported RVF snapshot is classified, never assumed:

- **attached** — the manifest's lineage matches the target store, its checkpoint position is at or before the store's head, and the store's `rvf_snapshots` collection already holds a record with the same integrity digest.
- **detached** — useful for retrieval or analysis but not presumed to represent current authoritative state. Anything else that verifies is opened detached, with a reason naming which check failed (foreign lineage, a checkpoint beyond the head, or never having been recorded there).

Anything that fails verification outright (bad JSON, missing files, an integrity mismatch, over a resource limit, a disallowed tenant) is **rejected** — nothing is opened. Only attached classification can affect authorization or automatic provider selection; detached snapshots never do.

Export records a durable source event checkpoint and the cognitive index generation processed through it; if indexing is behind, export waits, records an explicit partial checkpoint, or fails — it never labels a mixed-time image complete.

## Reference implementation: `@cognate/cognitive-rvf`

[`@cognate/cognitive-rvf`](../packages/cognitive-rvf/README.md) implements this against `@ruvector/rvf@0.3.4` (pinned exact), and is `implemented` for `CG-RVF-001` per [`requirements/ledger.yaml`](../requirements/ledger.yaml) — but only because of adapter-side mitigations layered over real gaps in the upstream package, tracked as [DEBT-006](../.agents/DEBT.md).

### DEBT-006 mitigations

RVF 0.3.4's `open()` has no integrity check (a 50%-truncated file, or a flipped magic-header byte, opens and serves partial/stale data), its metadata ingestion throws `MetadataNotSupported`, `exportBytes()`/`openBytes()` throw `BackendNotFound` on the native backend, and string ids live in a sidecar file outside the `.rvf` bytes. The adapter compensates for each:

- **No integrity on `open()`.** A Cognate-recorded `sha256` digest over the `.rvf` bytes plus the entries sidecar is verified in `importSnapshot` *before* any file is opened; a truncated or tampered snapshot is rejected without ever calling `RvfDatabase.open()`.
- **`MetadataNotSupported`.** No entry is ever ingested with a `metadata` field. All provenance — tenant, scope, metadata, embeddings, source refs — lives in an adapter-owned `<path>.entries.json` sidecar, the only source of truth for `get`/`similar` disclosure.
- **String ids in RVF's own sidecar.** `NodeBackend` writes `<path>.idmap.json`; every filesystem copy this adapter makes (snapshot, verified import) copies that file alongside the `.rvf` bytes.
- **`exportBytes`/`openBytes` unsupported.** Snapshot and import operate on file paths only, never in-memory byte buffers.

### What remains unproven

- Branching a branch (nested lineage) is untested; RVF's `branch()` requires its immediate parent file to stay present at its original path, so snapshotting a branch (versus a root store) is unverified.
- Kernel/eBPF segments are never read or written by this adapter; whether one could be smuggled through a hand-crafted `.rvf` file outside this API is out of scope and untested. Spec §18.3 forbids an embedded compute-capable segment from executing by default — this adapter never executes one, but does not itself audit `.rvf` files opened outside its own path.
- Concurrent multi-process writers to the same `.rvf` path are untested.

## Status

`CG-RVF-001` is `implemented`, with [DEBT-006](../.agents/DEBT.md) tracking the underlying upstream gaps this adapter mitigates rather than closes. Treat RVF as production-usable only within the guarantees above — the mitigations, not the upstream package, are what's proven.

## Related

- [cognition.md](cognition.md) — the `CognitiveIndex` contract RVF snapshots.
- [security.md](security.md) — tenant scope enforcement, which RVF import must also respect.
- [subsystems/capabilities-and-cognition.md](subsystems/capabilities-and-cognition.md) — the adapter, its options, and its failure modes.
- [decisions/ADR-0006-portable-cognition-rvf.md](decisions/ADR-0006-portable-cognition-rvf.md) — the decision and the rejected alternative.
