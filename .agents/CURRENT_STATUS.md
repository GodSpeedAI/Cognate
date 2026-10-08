# Current status

**Status revision:** 39

**Stage:** 0.1.0 release preparation: SDK scope moved to @godspeedai for publication under the godspeedai npm org

**Summary:** Operator decision: the SDK publishes under the @godspeedai npm org (which already publishes @godspeedai/domainforge via GitHub Actions trusted publishing), not @cognate (an unrelated-to-publish npm user owns that scope). 385 functional files renamed @cognate/* to @godspeedai/* (package names, imports, workflows, templates, user-facing docs); lockfile regenerated. Historical records (spec, evidence, plans, status history) keep the old scope by design; a spec revision proposal is a follow-up. Publication steps are otherwise unchanged: 0.1.0 already tagged/released in-repo; npm publish + trusted-publisher configuration happen from the godspeedai-authorized session.

**Verified:**
- bun run check passes with revision 39 and matching human view
- Rename audit: git grep @cognate/ outside bun.lock hits only .agents history, the spec, and one captured log
- Scope rename applied to 385 files: 35 package name fields, all imports in packages/profiles/tests/examples/validation reconstructions/templates, package.yml PROBE_PACKAGE, user-facing markdown

**Limits:**
- npm publication still pending: requires a session authorized for the godspeedai org (sprime01 membership or org login)
- Per-package npm trusted publishers still unconfigurable before first publish; release.yml publish job remains gated on NPM_TRUSTED_PUBLISHING_READY
- The design spec still names the @cognate scope (frozen ruler): a contract-revision note is a required follow-up
- verify on main after PR #11 failed on status-view drift (missing --- separator before revision 38); fixed in this revision's branch and re-verified before merge

**Next:** Verify the renamed workspace end to end, merge the scope change, publish @godspeedai/* 0.1.0 from the authorized npm session, configure trusted publishers (repo GodSpeedAI/Cognate, workflow release.yml, environment release), set NPM_TRUSTED_PUBLISHING_READY=true, then repeat the registry clean-room against published versions

**Evidence:**
- .agents/evidence/2026-10-08-release-0.1.0-prep.md
