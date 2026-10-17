# Awaitable run eligibility evidence

## Latest final-source gate (2026-10-15)

After all review repairs, the combined concurrency/admission/shutdown and actual Linux namespace
suite passes **38 tests, zero failures, 189 assertions in 8.94 seconds**. The full `just verify`
passes **81/81 gates** with `COGNATE_BWRAP_TESTS=1` and an explicit reviewed upstream0.12.0
attestation file. Typecheck and diff checks pass; requested Luna source review reports no remaining
scoped blocker. Latest pushed-head CI/packaging and complete linked publication remain release gates.
The historical checkpoints below retain their original scope and failures.

The runtime execution admission policy accepts synchronous or asynchronous resource-key lookups. An optional per-run signal is passed to the trusted callback and aborted by cancellation or runtime shutdown. Lookups during recovery are bounded by execution capacity. Resolution completes before an execution slot is acquired; a policy rejection goes through the durable native outbox retry path and no agent effects run. A lookup still pending during cancellation cannot start agent work after it resolves. Cancellation and shutdown release the waiting execution path even if a callback ignores its signal; late rejection is observed.

On 2026-10-15, `bun test packages/runtime-bun/test/async-admission.test.ts` passed all 5 tests, including invalid `undefined`/`null` lookup results remaining pending with a durable error and no effects. The combined runtime concurrency and async-admission run passed 15 tests; its PostgreSQL case could not connect because pg0 was stopped (`ECONNREFUSED 127.0.0.1:5432`), so that run is not counted as a full pass. Before this final contract-validation test was added, `just verify` passed 81/81 checks on 2026-10-15; the initial run was blocked by a corrupt cached Buf executable, fixed by reinstalling the frozen dependencies with a fresh temporary Bun cache. `bun test packages/events/test/outbox-dispatcher.test.ts packages/continuations/test` passed 54 tests. `bun run typecheck` passed after the final change. CI's PostgreSQL-backed suite now includes `async-admission.test.ts` beside `concurrency.test.ts` in `.github/workflows/verify.yml`.

The final combined runtime/admission run, with PostgreSQL explicitly available, passes **16 tests,
zero failures and 100 assertions** after the invalid-result guard. The earlier connection refusal is
an environment failure, not a passing skip. The full 81-gate run preceded that final one-line guard;
the current guard has targeted coverage and typecheck, and exact-head CI remains required.

The failed-lookup run remains `running` in `RunView` because `run.started` folds to that status until a terminal event; eligibility is outside the agent executor, so the policy failure is recorded on the retryable outbox item and does not append `run.failed`. This limitation is intentional for this contract slice. The mechanism remains process-local and does not provide distributed run ownership or OS isolation.

## Review and lifecycle follow-up

PR #44's original `bf5031c` head passed exact-head verify and clean-room packaging. CodeRabbit then
identified a real capacity defect: cancellation released a lookup permit while an uncooperative
callback remained active. The new PostgreSQL regression failed before the repair (two callbacks
entered at capacity one) and passed after the permit was retained until actual settlement. Late
rejection is observed and releases capacity; cancellation still stops the waiting execution path.
The repaired async suite passes six tests with 35 assertions and concurrency passes eleven with 71.

A separate PostgreSQL shutdown regression failed before active execution received the shutdown
signal. With native signal propagation it passes nine assertions: the cooperative provider aborts,
the same durable run resumes, a committed checkpoint is not repeated, and an open continuation
remains waiting and can resume after restart. This does not prove exactly-once remote provider
execution. Signal-ignoring handlers can still delay shutdown. Independent review identified an
additional acknowledged-resume recovery race: a waiting run was stranded after its resume outbox
was delivered during shutdown. Its PostgreSQL regression failed at restart before the repair and
passes after recovery also re-enters RESUMED waits. The combined admission/concurrency/shutdown
suite passes **19 tests, zero failures, 121 assertions**. Final `just verify` passes **81/81 gates**
after both repairs and the pre-agent shutdown guard. Typecheck and diff checks pass. Exact-head CI,
clean-room packaging, review reconciliation and operator authorization remain release gates.

The operator approved PR #44 and its linked release workflow on 2026-10-15. Before merge, a newly
discovered provenance error was corrected: Ubuntu's 0.11.1-1ubuntu0.3 package reverted the cited
CVE fix. The test harness now requires a reviewed attestation file instead of auto-attesting the
installed binary. Official upstream 0.12.0 was built in an isolated task directory; its actual OS
suite passes ten tests/29 assertions, and full `just verify` passes 81/81 with the OS gate enabled.
The corrected head must pass CI/packaging before the authorized merge and linked publication.

PR #44 follow-up review found that startup recovery re-entered active runs directly; an eligibility
failure was swallowed by the recovery tracker and could strand a run until another restart. Recovery
now writes a runtime-epoch `run.execute` outbox intent and uses the existing bounded dispatcher
backoff. It reuses any pending intent for that run, preserving its `availableAt`; previously
delivered/poisoned work receives a new intent identity. PostgreSQL regressions cover a recovered
running run whose first eligibility lookup fails then succeeds, preservation of a seeded pending
backoff, and a `RESUMED` continuation recovered after shutdown with a transient lookup failure.
On 2026-10-15, the combined async-admission, concurrency, and shutdown-recovery PostgreSQL suites
passed 21 tests / 141 assertions; the bubblewrap unit suite passed 5 tests (7 OS-gated tests skipped),
`bun run typecheck` passed, and scoped `git diff --check` passed. The overlap regression now uses a
real allowed runtime root and verifies the precise rejection before any launch.

Final source review also identified poisoned-recovery bookkeeping that could remain resident when
no new recovery was pending; pruning now runs for outstanding tracked intents as well. Canonical
namespace launcher/Bun executables inside the writable workspace are rejected before launch. The
workspace-launcher regression executes its marker before the fix and is rejected afterward.
Combined PostgreSQL/runtime/OS verification passes **33 tests, zero failures, 173 assertions in
8.39 seconds**. Full `just verify` passes **81/81 gates** with the patched OS fixture enabled after
all source repairs. The operator's merge/release approval remains recorded; exact-head CI and
review reconciliation still precede publication.

The next PR44 review found two additional runtime issues. First, cancellation during execution-slot
admission could not reach the run controller because it was removed after resource lookup. The new
regression failed before the fix (`AbortSignal.aborted` stayed false), then passed after the
controller remained registered through slot acquisition. It also verifies that a late slot grant is
released: the cancelled run performs no effect and the next run completes. Second, a tracked
recovery intent caused `listOutbox` to scan the whole pending run-execution topic every 10 ms even
when there were no new candidates. Its instrumented SQLite regression measured 12 extra scans over
120 ms before the fix and at most one afterward. Reconciliation now runs only when a new recovery
candidate is pending.

On 2026-10-15, the focused async-admission/concurrency suite passed **21 tests and 133 assertions**,
including real PostgreSQL cases; `bun run typecheck` and `git diff --check` passed. The full
`bun run verify` run passed the substrate check **81/81** and **951 tests, 31 skipped, 0 failed**
(5,861 assertions across 982 tests). Explicitly gated bubblewrap OS and live external-service tests
were skipped in that full run; the separately recorded patched-bubblewrap OS verification above
remains the evidence for the containment path. PostgreSQL was left running, and no commit or
publication was performed.

Formatter review then found a narrow handoff race: slot admission removed its controller immediately
before `executeOnce` awaited the initial run-stream read. The new deterministic regression captures
a pre-cancel snapshot, blocks the executor on that read, cancels the durable run, and then releases
the stale snapshot. With registration after the read the agent entered once; after moving controller
registration and shutdown wiring before the first await, the agent enters zero times. Terminal and
read-error paths now share the outer controller/listener cleanup. A separate forced slot-grant/close
race verifies the slot is released when shutdown wins just after grant. Recovery intent bookkeeping
now removes its process-local mapping in `finally` after delivery success or failure; the durable
outbox still owns retry and poison status, and future recovery candidates can rediscover pending
intents without idle scans.

On 2026-10-15, async-admission, concurrency, and PostgreSQL shutdown/recovery tests passed **26
tests / 157 assertions**. The stale-snapshot test was RED with one agent entry and GREEN with zero;
the slot-grant close test also passes. Typecheck and `git diff --check` pass. The parent will rerun
full SDK verification with the patched bubblewrap OS fixture enabled after final review; these
focused results do not replace that gate.

Review of startup backlogs found that the existing 100-run reconciliation batch could still trigger
a full pending-topic scan every 10 ms while more than 100 startup candidates remained. Recovery
reconciliation is now throttled with a monotonic 250 ms deadline set before the store query, while
each pass continues to enqueue up to 100 candidates. This bounds scan frequency to four per second
and nominal enqueue progress to 400 candidates per second; failed or slow queries cannot hot-loop.
The regression seeds 250 running records, observes at most one extra scan over 120 ms, then verifies
all 250 runs complete and all 250 recovery intents are delivered after more than 500 ms. It is RED
with zero throttle (two extra scans within 120 ms) and GREEN at 250 ms. The complete focused
admission/concurrency/shutdown-recovery run now passes **26 tests / 157 assertions**. This does not
bound the store's `listOutbox` materialization itself; query-level pagination/partitioning and the
broader A4 retrieval limitation remain open.
