# AGENTS.md — @godspeedai/cognate-realitytrace

- Never modify the read-only SXR checkout; the binary is pinned (DEBT-010).
- `sxr ingest` mints its own `observation_id`; never trust it over
  `already_committed` + `ledger_position` for dedup (see ADR-0007).
- Receipts are not evidence or settlement; do not add that vocabulary here.
