# Current status

**Status revision:** 69

**Summary:** SDK 0.5.0 publication is verified at all 45 packages. PR #47 adds a fail-closed public registry receipt gate; its source and nine regressions pass all native gates. Exact-head CI passed, and this readable status update will receive fresh checks before final merge authorization.

The operator-approved PR #44 and linked SDK 0.5.0 release are merged. All 45 public npm versions and
gitHeads match release **dd13c842**. Initial visibility lag contradicted green publish jobs; the
targeted retry skipped publication once the missing version became visible. Its cause is not
established. A fresh all-package consumer proves native asynchronous admission and PostgreSQL
overlap. Workbench consumes only supported 0.5.0 packages.

[PR #47](https://github.com/GodSpeedAI/Cognate/pull/47) verifies every public package after publishing.
Requests reject redirects and omit credentials. Five workers, a 30-minute deadline, a 10-second
request timeout and a 256 KiB body cap bound work. Release-created runs fail when publishing
readiness is disabled or the publish matrix failed or was skipped. Only complete receipts upload.

The **nine publication regressions / 32 assertions** run in the standard `just verify` recipe.
Typecheck, documentation, proof routing and **81/81 implemented gates** pass against actual
PostgreSQL. The initial truncated Bun-types installation was repaired using unchanged frozen
dependencies. PR source head **0679f8f** passed exact-head CI; this status correction needs fresh
checks. CodeRabbit's minor readability finding is addressed in the current snapshot while prior
append-only records remain intact.

Final merge authorization is reserved. Publication remains non-atomic. Outbox fencing is not
distributed run-write ownership; Linux children are not production authentication, host isolation
or aggregate resource containment. The Workbench debt mission remains incomplete.
