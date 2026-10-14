# Current status

**Status revision:** 56

**Summary:** PR42 preserves tested native dispatch/concurrency, PostgreSQL pool fix and opt-in Linux ports. CI and clean-room packaging pass; no new SDK release or production/multiprocess closure is claimed.

The isolated `feature/durable-dispatch-debt` branch is pushed in
[Cognate PR #42](https://github.com/GodSpeedAI/Cognate/pull/42). Code/evidence commits are
`ab4dd2a`, `920c4c9`, `06a520b` and `48ad057`. GitHub verification and clean-room packaging pass
on `06a520b`; later documentation-only changes pass five tests/26 assertions. No supported new SDK
release has been published, and Workbench remains on published 0.2.0.

Native owner/generation-fenced outbox renewal/settlement covers all built-in stores and prevents
mixed upgraded-API bypass. Old binaries issuing old SQL are not fenced automatically. Default run
capacity one remains compatible; opt-in concurrency requires trusted eligibility/resource keys.
Native capacities one/two/four/eight, resource conflicts, cancellation, continuations and actual
PostgreSQL are tested. Run-local ordering is retained.

Workbench's membership regression exposed a PostgreSQL pool deadlock in transactional duplicate
receipt loading. The fix reuses the transaction executor. A two-connection/twenty-same-key test
fails before the fix and passes three repetitions afterward. Full PostgreSQL adapter: 42 tests/
192 assertions. Runtime/service/continuations: 96/371. Latest full SDK verification: 81/81 gates,
including the pool regression.

The opt-in Linux execution-world ports pass ten actual OS tests/29 assertions on a verified
distro-patched bwrap binary. Tests cover namespace filesystem operations, host-secret and symlink
refusal, denied access to an otherwise reachable host listener, denied nested namespaces, nested
Bun children, timeout/abort cleanup, output limits and binary mismatch. The operator must audit
runtime mounts and workspace contents. Host application code remains trusted; there are no aggregate
CPU/memory/process/disk quotas or production authentication/certification.

Outbox fencing is not distributed run-write ownership, store-time compatibility or physically
exactly-once external actions. Native commitment ambiguity still needs reconciliation. Multiple
runtime owners are not supported. Production identity/session/tenant integration and independent
security review remain open.

The sibling checkout's operator status modifications are untouched. This temporary task worktree
may be removed after its pushed source/status is verified. Resume through the upstream branch,
review/release workflow and plan; no development checkout is a consumer runtime dependency.
