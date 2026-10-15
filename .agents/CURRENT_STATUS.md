# Current status

**Status revision:** 62

**Summary:** SDK 0.4.0 is completely published and Workbench compatibility passes. A separate awaitable resource-eligibility extension adds bounded metadata lookups and cancellation; current source awaits exact-head CI and a supported release.

SDK 0.4.0 is published completely: all 45 npm names and gitHeads match release commit 467a5f.
Workbench's published upgrade passes all 1,101 tests and keeps its default serialized execution.

This separate branch permits trusted asynchronous resource lookup before native execution admission.
Lookup concurrency is bounded using the native slot primitive. Pending lookup registers the same
per-run controller used for cancellation; cancellation and shutdown release the wait even if the
callback ignores its signal, and late rejection is observed. Invalid results fail closed with durable
retry errors. The callback cannot grant authority and must remain side-effect free.

Final runtime/admission with real PostgreSQL: **16 pass, zero fail, 100 assertions**.
Outbox/continuations: **54 pass, zero fail, 242 assertions**. Typecheck passes. The full 81-gate
verification passed before the final invalid-result guard, whose targeted tests pass; exact-head CI
and packaging remain required. A malformed local cached Buf binary was repaired without dependency
or fixture-lock drift. Independent source review found no blocking finding.

This extension is unpublished and is not a Workbench dependency. Failed eligibility is recorded
on the native retryable outbox; RunView remains running until a real terminal event. Application
policy owns canonical resource identity and must block unknown metadata.

Outbox fencing is not distributed run-write fencing. Caller-clock leases, old SQL writers,
worker ownership and ambiguous physical effects retain documented limitations. Linux child
containment is not a complete production security boundary. Aggregate quotas, production identity,
tenant isolation and independent security review remain open. Sibling user changes are preserved.
