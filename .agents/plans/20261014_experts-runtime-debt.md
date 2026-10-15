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

Workbench now uses published SDK 0.4.0; its compatibility and application verification passed before
this follow-up. The separate awaitable resource-eligibility slice adds trusted synchronous or
asynchronous resource-key lookup before run-slot admission, bounds lookup concurrency, and aborts
pending lookups on cancellation or shutdown. Its malformed-result, retry, recovery, cancellation,
and capacity behavior is covered in `packages/runtime-bun/test/async-admission.test.ts` and
`docs/evidence/async-run-admission.md`. This slice remains unpublished and is not a Workbench
dependency; integrate it only after its exact-head CI, packaging, and supported release pass. Local
source checkout success is not a dependency release.
