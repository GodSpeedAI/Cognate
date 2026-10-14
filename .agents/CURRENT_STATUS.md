# Current status — revision 54

Native dispatch debt improvements are verified on `feature/durable-dispatch-debt`, based on `f68330e`. This isolated worktree preserves the sibling checkout's operator changes. No new SDK release has been published.

Optional owner/generation-fenced outbox APIs now cover memory, SQLite and PostgreSQL. Legacy adapters remain compatible and serial; enrolled rows cannot be claimed or settled through legacy APIs. Native dispatch shares bounded capacity across overlapping drains, renews claims and aborts delivery on lost renewal. Seventy-three events/memory/SQLite tests and twenty-nine PostgreSQL conformance tests pass.

Runtime execution retains capacity one by default. Higher capacity requires an explicit trusted resource eligibility function; conflicting keys serialize, independent runs overlap, and run-local ordering remains deterministic. Capacities one/two/four/eight, actual PostgreSQL, cancellation and continuation replay pass. The runtime/service/continuation gate passes 96 tests and 371 assertions.

Workbench testing exposed a PostgreSQL pool deadlock in serialized duplicate commit replay. Receipt event loading now uses its transaction executor. The saturated-pool regression fails before the fix and passes three repeated runs after it. The full PostgreSQL adapter suite passes 42 tests and 192 assertions.

All 81 existing `just verify` gates passed after dispatch/concurrency changes, with required compatibility and RealityTrace fixtures installed. New scoped tests supplement that ledger; final verification is required after subsequent changes.

Delivery fencing does not fence run writes across processes, make external effects physically exactly once, or solve store-clock skew. Multiprocess runtime ownership, ambiguous effects, production identity and containment integration remain open. Workbench stays on published 0.2.0 until supported release consumption passes. Read-only registry checks observed runtime-bun/events/store-postgres 0.3.0; this is not proof that every package is published or that these new contracts are available.

A separate opt-in Linux execution-world provider is under adversarial review. It adds no production-ready claim and is not a Workbench dependency. See the task plan and linked contract/evidence documents for scope and release prerequisites.
