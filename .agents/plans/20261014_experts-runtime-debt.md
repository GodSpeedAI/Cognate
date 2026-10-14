# Native dispatch and execution debt tranche

Authority: operator Experts & Teams debt-closure mission, shared with Cognate-Workbench. Preserve
the sibling checkout's working changes; this branch starts at `f68330e` in an isolated worktree.

1. Extend optional native outbox leases with owner/generation renewal and conditional settlement;
   preserve legacy adapter compatibility and prohibit mixed-protocol stale settlement. Test all
   built-in stores and dispatcher heartbeat/capacity before integrating runtime concurrency.
2. Add explicit bounded run admission above the default one, trusted resource eligibility, run-local
   ordering and continuation integration. Prove capacities 1/2/4/8 and PostgreSQL, cancellation,
   resource conflict and replay regressions. Publish through the existing linked-version workflow.
3. Add an opt-in Linux execution-world provider behind existing ports, with real OS tests, no weak
   fallback, and explicit absence of authentication, aggregate quotas and production certification.
4. Separately design run-write fencing, store-time ownership and commitment ambiguity recovery.
   Outbox fencing does not close that requirement. Do not expose distributed runtime mode before
   two-process crash and stale-writer gates pass.

Observed gates: events/memory/SQLite 73 passing; PostgreSQL outbox conformance 29 passing;
runtime/service/continuations 96 passing; Linux provider ten passing; upstream `just verify` 81/81
before the containment slice. Re-run complete verification before committing the final tree.

Workbench stays on its published 0.2.0 dependencies until these additive contracts are released and
the application integration passes. Local source checkout success is not a dependency release.
