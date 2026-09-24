# cognitive-rvf

- Never ingest `metadata` into RVF; keep provenance in `<path>.entries.json`.
- Any manual file copy of a `.rvf` must copy `<path>.idmap.json` alongside it.
- `importSnapshot` verifies integrity before ever opening a file; never throws, always resolves.
- `branch()` uses RVF's `.branch()` (verified COW read-through), not `.derive()`.
- See README.md for the full DEBT-006 mitigation list.
