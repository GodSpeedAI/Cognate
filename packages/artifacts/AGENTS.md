# AGENTS.md — @godspeedai/artifacts

- Never put artifact content in an event payload — ids, hashes, and metadata only.
- Always `putBlob` before the record + `artifact.created` commit, and keep both in one `store.commit`.
- `delete` must tombstone (not remove) the record, then garbage-collect only unreferenced blobs.
- Keep `ArtifactService`'s public method signatures in `src/index.ts` stable.
