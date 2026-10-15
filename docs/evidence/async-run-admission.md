# Awaitable run eligibility evidence

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
