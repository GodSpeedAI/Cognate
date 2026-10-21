# Current status

**Status revision:** 70

**Summary:** SDK manifest is at 0.6.1. Branch `fix/debt-burndown-2026-10-21` (uncommitted) burns down the debt register: the runtime loop is event-driven, `cognate create` works from npm without a checkout, and 11 debt entries close. `just verify` passes 81/81 gates.

Closed this pass: DEBT-004 (by ADR-0003 decision), 012, 015, 016, 018, 020, 023, 029, 030, 031 and 032.
The runtime wakes on commit notifications with timers for retry backoff; the interval (default
250 ms) is a safety net. A load benchmark is recorded in `docs/runtime-concurrency.md`.
`cognate create` pins dependencies to the CLI version and ships the starter template in the CLI
tarball (packed-tarball smoke passed outside the repo). RVF `FsyncFailed` retry moved into
`cognitive-rvf`. Local and command execution worlds version files by `mtime ns:size:inode`.

Accepted limits: DEBT-005 (Cordis rc gaps, adapter-mitigated), 006 (closed locally, open upstream),
007 (vector search only), 022 (no KVM host; opt-in bubblewrap forks) and 027 (inconclusive; overrides
kept). Still open: 002 (DomainForge 0.21.1 still has one error code), 017 (Bun `toMatchObject`, still
on 1.4.3), 024 (narrowed; deferred items recorded in the cybernetic-navigation spec), 025 (native
WebMCP), 026 (WSL health, containment, SSH seconds-only versions) and 028 (SIWC live sign-in, an
operator task).

Verified: `just verify` 81/81; runtime-bun 175 pass; `async-admission` 60/60 consecutive runs;
deepseek-harness app suite 870/872 with the one failure fixed and re-run green; Journey A 2/2.
Ledger freeze remains an operator decision. Nothing is committed or published.
