# SDK publication receipt evidence

## Observed release

On 2026-10-15, release `0.5.0` at `dd13c8422220ecbac61a92bdd90829218844bc2e` passed a separate public-registry audit for all 45 linked SDK packages. Each visible package reported version `0.5.0` and the release commit as `gitHead`. A fresh consumer install of the linked release also passed.

The initial release workflow had shown 45/45 successful jobs while only 44/45 packages were visible on npm; `@godspeedai/cognate-provider-anthropic-compatible@0.5.0` was still missing roughly 20 minutes later. The cause of the mismatch is unproven. The authorized recovery retried only that missing package. The existing `npm view name@version` guard skipped already published package versions, avoiding a second publish attempt for them. The later all-45 audit and consumer install are separate observations from the original green workflow result.

## Receipt gate contract

For a release-created run, `verify-publication` requires trusted npm publishing to be enabled and the publish matrix result to be `success`. It checks out the release commit and writes a receipt artifact only after every package passes. The verifier derives the linked package set and version from the release configuration, requests each exact public npm version, and requires exact package name, version, and `gitHead` equality with the release commit.

The verifier uses the fixed HTTPS registry URL `https://registry.npmjs.org`, sends no npm token or authentication header, and does not load npm credentials. It runs at most five requests concurrently, times each request out within 10 seconds, caps each metadata response at 256 KiB, and retries transient `404`, `408`, `429`, server, and network failures until the 30-minute deadline. Malformed metadata and name, version, or commit mismatches fail immediately. The workflow allows 35 minutes for the gate and requires the receipt artifact to exist.

This receipt proves public metadata visibility and commit association. It does not independently verify tarball contents or reproduce the package build. Requests use the fixed HTTPS registry URL with Fetch redirects rejected and credentials omitted; responses cannot be accepted from a redirected origin.

## Validation

On the receipt-gate source worktree, the deterministic publication suite passed **9 tests and 32 assertions**. The full `just verify` passed, including typecheck, README checks, and **81/81 implemented gates** against the local PostgreSQL fixture. The publication tests use a mock registry; the all-45 `0.5.0` observation above came from the separate release audit and fresh consumer install, not from those mocks.
