# Current status

**Status revision:** 61

**Summary:** Independent reviewer gate removed by operator. All 81 SDK verification gates pass after AG-UI settled-stream test correction; fresh exact-head CI and packaging precede final merge/release authorization.

The [review and release gate evidence](../docs/evidence/pr42-release-readiness.md) records the
three actionable CodeRabbit corrections, exact regressions and read-only release audit. Run and
continuation topics now share admission before claiming; alternating priority prevents starvation
at capacity one. Actual execution and resource exclusion still use the native execution gate,
including direct recovery. Worker failures wait for sibling settlement before surfacing.

Targeted events, continuations and runtime tests with real PostgreSQL: **225 pass, zero fail,
772 assertions**, with seventeen optional external CEP tests skipped. SDK typecheck passes.
The actual Linux OS suite passes ten tests / 29 assertions. The final isolated full run passes **81/81 gates**, exit zero, in about 49 seconds.
The AG-UI tests now await settled SSE streams rather than HTTP headers; twenty repeated file runs
pass 100 tests / 160 assertions. Failed gate diagnostics are retained rather than discarded.

Read-only audit confirms all 45 linked npm packages have latest 0.3.0, including the nine historical
publication failures. Release run 38300385888 now reports successful publish jobs and the readiness
variable is true. CI and packaging passed previous pushed head 7d9b80f; new source requires fresh
checks. The operator removed the independent GitHub reviewer requirement. The remaining gates require
final authorization: **do not merge or publish**. npm linked publication is not transactional.

Outbox fencing is not distributed run-write fencing. Caller-clock leases, old SQL writers,
process ownership, worker-version admission and ambiguous external effects retain documented
limitations. The opt-in Linux world contains child processes only and is not a complete production
security boundary. Aggregate quotas, production identity/tenant integration and independent review
remain outstanding. Workbench continues using published Cognate 0.2.0.

The sibling operator's working status modifications are untouched. The task-owned worktree remains
available for review fixes; it is never a production dependency. The full Workbench debt mission
remains incomplete.
