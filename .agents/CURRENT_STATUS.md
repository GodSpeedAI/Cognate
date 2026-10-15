# Current status

**Status revision:** 68

**Summary:** SDK0.5.0 is fully published and consumed with all45 public version/gitHead receipts. A separate native CI receipt gate now fails closed on incomplete publication, disabled readiness and metadata mismatch;9regressions/32assertions and all81gates pass. New PR merge is not yet authorized.

The operator-approved PR44 and linked0.5.0 release have merged. All45 public npm versions/gitHeads
match release **dd13c842**. Initial registry visibility lag contradicted green publish jobs;
the targeted retry skipped publication after the missing version became visible. The cause is not
established. A fresh all45-package consumer proves published asynchronous native admission/PG
overlap; Workbench now consumes only supported0.5.0 packages.

This separate CI change verifies every public package name/version/gitHead after publishing.
Requests use the fixed public origin, reject redirects and omit credentials. Five workers,
30-minute visibility deadline,10-second request timeout and256KiB cap bound work. Release-created
runs fail when readiness is disabled or publishing failed/skipped; only complete receipts upload.

The **9 publication regressions/32 assertions** run in standard `just verify`. Final typecheck,
docs, proof-routing and **81/81 implemented gates** pass against actual PostgreSQL. A truncated
Bun type install initially caused typecheck errors; refreshing the unchanged frozen dependencies
fixed it. No runtime/dependency or package-version change was made.

The CI branch is ready for a separate concrete PR and exact-head checks; final merge authorization
is still reserved. Receipt verification does not make publishing atomic. Native outbox fencing
does not establish distributed run ownership. Linux children are not production identity, host
isolation or aggregate containment. The Workbench debt mission remains incomplete.
