# Current status

**Status revision:** 63

**Summary:** Published SDK 0.4.0 remains the Workbench dependency. PR44's admission-capacity finding and two native shutdown/recovery defects are repaired with PostgreSQL regressions and 81/81 full gates; latest-head CI and release authorization remain required.

SDK 0.4.0 is published completely: all 45 npm names and gitHeads match release commit 467a5f.
Workbench's published upgrade and native capacity characterization pass all 1,104 tests and keep
the application's default serialized execution.

This separate branch permits trusted asynchronous resource lookup before native execution admission.
Lookup concurrency is bounded using the native slot primitive. Pending lookup registers the same
per-run controller used for cancellation; cancellation and shutdown release the wait even if the
callback ignores its signal, while the callback retains its lookup permit until actual settlement.
Late rejection is observed. Invalid results fail closed with durable
retry errors. The callback cannot grant authority and must remain side-effect free.

Final admission/concurrency/shutdown with real PostgreSQL: **19 pass, zero fail, 121 assertions**.
Outbox/continuations previously passed **54 tests, 242 assertions**. Typecheck and full **81/81**
verification gates pass after the repairs. PR44's previous head passed CI/packaging; the new head
must pass again. Independent source review identified and then verified the resumed-wait repair.

Shutdown aborts cooperative provider work without cancelling durable objectives; committed steps
and open waits survive restart. Recovery also handles an acknowledged RESUMED continuation before
its run resume event was recorded. Each regression failed before its corresponding repair.

This extension is unpublished and is not a Workbench dependency. Failed eligibility is recorded
on the native retryable outbox; RunView remains running until a real terminal event. Application
policy owns canonical resource identity and must block unknown metadata.

Signal-ignoring callbacks can exhaust lookup capacity; signal-ignoring execution handlers can delay
shutdown. Interrupted external calls may have occurred and can repeat without a recorded outcome;
native commitments and explicit reconciliation remain necessary. No physical exactly-once claim.

Outbox fencing is not distributed run-write fencing. Caller-clock leases, old SQL writers,
worker ownership and ambiguous physical effects retain documented limitations. Linux child
containment is not a complete production security boundary. Aggregate quotas, production identity,
tenant isolation and independent security review remain open. Sibling user changes are preserved.
