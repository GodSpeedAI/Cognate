# Current status

**Status revision:** 58

**Summary:** Native SDK review checkpoint includes bounded admission, fenced delivery and transaction-local gap-free duplicate replay; tested source is pushed, supported release remains pending.

The final PostgreSQL regression now appends a distinct fact after twenty same-key commits.
It exposed unused reservations: the following fact was position 11 instead of 2. The duplicate
path now restores only its uncommitted reservation while retaining the counter lock; committed
facts and historical positions are unchanged. Full adapter: **42 tests, zero failures,
193 assertions**. The final runtime concurrency and multi-process store-writer regressions pass;
this is not distributed runtime execution.

Parallel admission also rejects injected stores without the complete fenced API before opening
resources. Runtime/service/continuations: **96 tests, zero failures, 373 assertions**. Default
capacity one remains compatible. Built-in store fencing, explicit resource eligibility, native
capacities one/two/four/eight, cancellation and continuation evidence remain in the contracts.

Source is pushed in [Cognate PR #42](https://github.com/GodSpeedAI/Cognate/pull/42) on
`feature/durable-dispatch-debt`. Main source commits are `ab4dd2a`, `920c4c9`, `06a520b`,
`48ad057`, `a0b462a`, `a59a7da` and `7221260`. CI verification and clean-room packaging passed
`a59a7da`; latest-code CI and human review precede the supported linked-version release.
No new release is claimed, and Workbench still pins published 0.2.0.

All 81 existing SDK gates passed before the final narrow fixes; CI includes both changed
PostgreSQL/concurrency suites. The opt-in Linux provider has ten actual OS tests/29 assertions:
host-secret/path refusal, denied otherwise-reachable TCP, nested namespace/Bun behavior,
timeout/abort cleanup, output limits and binary mismatch. It contains child processes only.

Outbox fencing does not provide run-write ownership, authoritative store-time leases, compatible
worker admission or physically exactly-once effects. Old SQL delivery binaries cannot safely
share a fenced outbox. Aggregate resource quotas, production identity/session/tenant integration
and independent security review remain open. Configured workspace contents are an operator grant.

The sibling operator's working status modifications are untouched. Remove only the clean
task-owned worktree after verifying its remote head; source remains in the pushed branch and PR.
Continue through review/publication and then supported consumer tests.
