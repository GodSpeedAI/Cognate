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

PR44 review follow-up retains each eligibility permit until its callback actually settles, even
when cancellation has released the waiting run. Native shutdown now aborts cooperative execution
without cancelling durable objectives. Recovery re-enters acknowledged RESUMED waits whose run
resume event was not persisted. Actual PostgreSQL regressions failed before each repair and pass
afterward: admission/concurrency/shutdown 19 tests, 121 assertions; full verification 81/81 gates.
Signal-ignoring handlers and ambiguous external effects retain their documented limitations.

The next review regressions cover cancellation during execution-slot admission and recovery polling.
The slot test was RED before the fix (`AbortSignal.aborted` remained false while the run waited),
then GREEN after the run controller remained registered until slot acquisition settled; late grants
are released and the cancelled run performs no effects. The instrumented recovery test was RED with
12 unnecessary `listOutbox` scans during 120 ms, then GREEN with at most one after polling was
limited to ticks that have new recovery candidates. Combined async-admission/concurrency testing
passed 21 tests / 133 assertions, including PostgreSQL. Final `bun run verify` passed the substrate
ledger 81/81 and the full suite 951 pass / 31 skipped / 0 fail (5,861 assertions across 982 tests).
The full run skipped explicitly gated bubblewrap OS and live external-service suites; earlier
separate patched-bubblewrap OS evidence remains recorded in the evidence document. Typecheck and
diff checks passed. No status files were changed, and no commit or publication was made.

Final handoff review found a stale-snapshot cancellation window between slot admission and the
executor's initial `readStream`. A deterministic held-read regression was RED with one agent entry
after cancellation and GREEN with zero after controller registration moved before the first await;
terminal/error paths clean up the controller through an outer `finally`. A forced close just after
slot grant confirms the permit is returned. Recovery intent cache entries are now removed after
delivery success or failure; the durable outbox remains authoritative for retry/poison state, and a
later recovery scan can reuse pending intents. Admission/concurrency/shutdown-recovery passed 26
tests / 157 assertions, with typecheck and diff checks green. Parent is rerunning full SDK
verification with patched bubblewrap OS tests enabled after review.

The 100-run startup recovery batches were also too frequent: a backlog above one batch could trigger
a full pending-topic scan every 10 ms. Reconciliation now has a monotonic 250 ms throttle set before
the store query, preserving the 100-candidate batch and capping scan frequency at four per second
(nominal progress 400 candidates/second). A 250-record regression observed at most one extra scan
over 120 ms and confirmed all candidates eventually completed with delivered recovery intents after
more than 500 ms. The test is RED at zero throttle (two extra scans during the 120 ms window) and
GREEN at 250 ms. Each `listOutbox` call still materializes an unbounded result; this does not close
the A4 retrieval/indexing limitation. Parent will rerun final SDK and OS-enabled verification after
review.
