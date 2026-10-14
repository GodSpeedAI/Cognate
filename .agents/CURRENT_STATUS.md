# Current status

**Status revision:** 57

**Summary:** PR42's final admission guard rejects legacy injected stores before allocating parallel runtime resources; native regression passes96tests. Supported release and distributed/production work remain open.

The final review found that unsupported injected stores could be accepted by a parallel runtime
and then fail asynchronously in outbox draining. Startup now rejects a missing/partial fenced
claim/renew/settle API before allocating resources. Default serial compatibility remains unchanged.

Locked install and typecheck pass. Runtime/service/continuations pass **96 tests, zero failures,
373 assertions**, including native PostgreSQL concurrency and two new fail-fast compatibility
assertions. Existing dispatch/store conformance, saturated-pool and actual Linux containment
evidence remains in the linked contract documents. Full SDK verification passed 81/81 gates before
this narrow startup change; CI includes the changed concurrency suite.

The source branch is `feature/durable-dispatch-debt` in
[Cognate PR #42](https://github.com/GodSpeedAI/Cognate/pull/42). Prior commits `ab4dd2a`, `920c4c9`,
`06a520b`, `48ad057` and `a0b462a` are pushed. CI verification/clean-room packaging passed
`a0b462a`; the final guard needs current-head CI and review before the supported release workflow.

No new SDK release is claimed. Workbench remains on published 0.2.0 with no local runtime link.
Outbox fencing still does not establish distributed run-write ownership, store-time leases,
worker-version admission or physically exactly-once external actions. Old delivery binaries must
not share a fenced outbox without a compatibility guard.

The opt-in Linux provider has ten actual OS tests/29 assertions, including denied reachable TCP,
host-secret/path refusal, nested Bun/user-namespace behavior, abort/timeout cleanup, output bounds
and binary mismatch. It contains child processes only; configured workspace contents remain an
operator grant, and aggregate quotas, production identity/session/tenant integration and independent
security review remain open.

The sibling checkout's operator status changes remain untouched. The owned temporary worktree was
reopened solely for this final reviewed guard and will be removed after its exact remote head is
verified. Continue through the pushed branch and supported review/release workflow.
