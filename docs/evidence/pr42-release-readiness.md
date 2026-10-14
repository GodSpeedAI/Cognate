# PR #42 review and release gates

## Review corrections

The 2026-10-14 CodeRabbit reviews identified three actionable issues:

- Run and continuation dispatchers each admitted the configured capacity before sharing the
  execution gate. New mixed-topic regressions observed two outstanding leases at capacity one
  and four at capacity two. Both dispatchers now share a pre-claim admission budget; rotating
  topic priority prevents empty-topic starvation. Both regressions pass and verify delivery
  completion, execution bounds and one claim per logical delivery.
- A transient worker failure could reject `drain()` while siblings remained active.
  `Promise.allSettled` now waits for all workers before propagating the error. Memory and SQLite
  regressions reproduce the earlier failure and pass with the fix.
- The Linux filesystem test treated a missing file as empty content. It now asserts the file
  exists; the actual OS suite passes ten tests and 29 assertions.

`just typecheck` passes. The events, continuations and runtime suites, including real PostgreSQL,
pass **225 tests, zero failures and 772 assertions**. Seventeen optional CEP tests were skipped;
this command does not establish their external integration. Source review by a separate agent
found no permit leak or deadlock in the reviewed paths; this is not GitHub human approval.

## Read-only release audit

Before these review corrections, PR head `7d9b80f13b079a2fb5139f4bfbe525710146819e` had successful
`pack + clean-room install` (2026-10-14 20:25:33 UTC) and `verify (ubuntu)` (20:26:30 UTC) checks.
The new source must pass both checks again at its exact pushed head.

`node scripts/check-unified-release-config.mjs` and `node scripts/plan-sdk-release.mjs` confirm
45 aligned registered packages, one public SDK release and 44 component tags. Read-only npm
queries for all 45 names returned latest version 0.3.0. The nine historical publication gaps are
resolved. GitHub release run `38300385888` reports success for every publish job, and the
non-secret readiness variable `NPM_TRUSTED_PUBLISHING_READY` is true. These are observations of
the existing release, not a promise about future npm trust settings or network availability.

The operator explicitly removed the independent GitHub reviewer requirement. No reviewer-access
change or additional approval is required. The remaining conditions are verified actionable review
fixes, green latest-head CI and clean-room packaging, linked release readiness, documented limits,
and final operator authorization before merge or publication. No merge, release trigger, npm
publication or new dependency consumption was performed.

Observed check receipts at that previous head:

- [Packaging job](https://github.com/GodSpeedAI/Cognate/actions/runs/38631841402/job/116085156480).
- [Verification job](https://github.com/GodSpeedAI/Cognate/actions/runs/38631841908/job/116085158341).
- [Completed 0.3.0 release workflow](https://github.com/GodSpeedAI/Cognate/actions/runs/38300385888)
  and [public release](https://github.com/GodSpeedAI/Cognate/releases/tag/v0.3.0).

## Remaining limitations

The linked npm matrix is not transactional: a future per-package failure may leave a partial
publication. Existing recovery publishes only missing names at the exact approved version,
without overwriting versions or moving tags. Revalidate all names, publisher configuration,
release versions and consumer installation before authorizing the next release. Do not infer
future atomic publication from a green GitHub release or a true repository variable.

Outbox fencing is not distributed run-write fencing. Caller-clock leases, mixed old SQL writers,
process ownership, version admission and ambiguous external effects retain their documented limits.
The opt-in Linux execution world contains selected child processes; it is not a complete production
security boundary. Aggregate quotas, production identity/tenant integration and independent security
review remain outstanding. Workbench continues to consume published Cognate 0.2.0.
