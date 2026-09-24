# AGENTS.md — @cognate/continuations

- Every transition is exactly one `store.commit` (record CAS + event + idempotency + outbox). Never split these.
- On `RecordConflictError`/`ConcurrencyError`, re-read and re-check status; do not blindly retry the same write.
- Keep public types in `src/types.ts`; extra internal fields on stored records (e.g. `lastTransition`, `tenant`) are fine but must not leak into returned records.
