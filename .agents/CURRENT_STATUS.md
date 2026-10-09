# Current status

**Status revision:** 40

**Stage:** cognate-* package-name migration: renamed, released in-repo, publication pending operator OTP

**Summary:** Every Cognate SDK module is now @godspeedai/cognate-<module> (operator convention decision): 372 files renamed, external pins untouched, the DomainForge adapter keeps its pre-conformant name, and a new re-export-only umbrella @godspeedai/cognate (root + /runtime + /client) ships. Release Please was realigned (components renamed, manifest reset so initial-version bootstraps each new identity at exactly 0.1.0) and 36 cognate-* tags + GitHub releases exist. The superseded @godspeedai/<module> 0.1.0 packages on npm await deprecation; the 36 renamed packages are packed, inspected, and ready to publish — blocked only on the operator's npm OTP.

**Verified:**
- just verify on 6dd2a93: 78/78 gates; full suite 768 tests / 0 fail; frozen install clean
- Whole-name audit: zero old-style references outside historical records (spec, .agents history, logs)
- 36/36 tarballs pack and pass inspect-npm-tarballs.mjs under the new names
- Verdaccio clean-room: bun add @godspeedai/cognate@0.1.0 installs 17 packages and the consumer smoke passes (capabilities, durable events across restart, continuations); @godspeedai/cognate-cli graph smoke passed earlier in the session
- Release Please aligned: 36 tags cognate-*-v0.1.0 + GitHub releases (34 bootstrapped via API from PR #13 notes after the release-please PR-body parser matched only the first component; verification dispatch finds all 36 with no duplicates)
- CI verify + pack/clean-room green on PR #14 and the #13 release PR merge

**Limits:**
- npm publication of the 36 renamed packages pending: requires the operator's OTP (EOTP on every publish from this session)
- Old @godspeedai/<module> packages not yet deprecated (must happen only after the replacements exist on npm; @godspeedai/a2a was never published so it needs no deprecation)
- Trusted publishers not yet configured for the new package identities; publish job stays gated on NPM_TRUSTED_PUBLISHING_READY
- Design spec still describes the old package naming; contract-revision note remains a follow-up

**Next:** Operator publishes .tmp/pack-cognate/*.tgz (npm publish --access public, OTP interactively) or supplies an OTP; then verify each with npm view, deprecate the 33 superseded packages, configure trusted publishers per package (GodSpeedAI/Cognate, release.yml, environment release), set NPM_TRUSTED_PUBLISHING_READY=true, and repeat the clean-room against the real registry

**Evidence:**
- .agents/evidence/2026-10-08-release-0.1.0-prep.md
- docs/package-naming.md
