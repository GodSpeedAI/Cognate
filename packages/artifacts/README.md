# @godspeedai/cognate-artifacts

`ArtifactService` (spec §13.1) gives durable, content-addressed, access-controlled artifacts.

- Bytes are written via `store.putBlob` (content hash `sha256:<hex>`) *before* the record and its
  `artifact.created` event commit in one `store.commit` call, so a record is never visible before
  its bytes exist. Event payloads carry only ids, hashes, and metadata — never content.
- Reads are authorized by tenant plus an optional reader allowlist; results distinguish `ok`,
  `denied`, `not_found`, `tombstoned` (deliberately removed) and `lost` (record exists, blob gone,
  no tombstone — reported as data loss).
- `delete` tombstones the record (record CAS + `artifact.tombstoned` event) then deletes any blob
  no remaining *available* artifact still references, so identical bytes shared across artifacts
  survive deletion of any one referencer.
