# Current status

**Status revision:** 51

**Stage:** Unified v0.2.0 GitHub Release minted and marked Latest; nine missing component tags created at becdb1e and pushed; release-please 0.3.0 divergence on main discovered and recorded for operator decision

**Summary:** Under explicit operator intent the two 0.2.0 transition artifacts from revision 50 are minted: the unified public GitHub Release v0.2.0 now exists on the already-bootstrapped git tag (created with the cognate changelog entry plus a note explaining the retroactive mint, marked Latest so it displaces the legacy per-package releases), and the nine internal component tags for the packages registered in PR #34 were created as annotated tags at becdb1e - the commit where their manifests first carry 0.2.0 - using the workflow's exact tag message and pushed; all 44 cognate-*-v0.2.0 component tags now resolve on the remote and every pre-existing tag was retained untouched. Minting surfaced a new, previously unrecorded divergence on main that is NOT resolved here: release-please PR #35 (4c942f2, merged 2026-10-12T01:21Z) auto-bumped 44 of the 45 manifest entries to 0.3.0 while leaving the root packages/cognate at 0.2.0, so the cognate_release_created gate stayed false, the tag-components and publish jobs were skipped, and no 0.3.0 tag, GitHub release or npm publication exists - git on main now claims 0.3.0 for 44 packages while npm and the minted v0.2.0 release say 0.2.0. That divergence awaits an operator decision.

**Verified:** - Unified release minted under operator intent: GitHub Release v0.2.0 created on the pre-existing remote tag (target a4517d0, unchanged), title version-only per the workflow's normalize convention, marked Latest (gh release list shows v0.2.0 first), body carries the cognate 0.2.0 changelog entry plus a retroactive-mint note pointing at docs/releases.md and docs/release-unregistered-packages.md: https://github.com/GodSpeedAI/Cognate/releases/tag/v0.2.0
- Nine internal component tags created as annotated tags at becdb1e (where packages/agent-discovery, hook-interoperability, provider-anthropic-compatible, provider-auth, provider-openai-oauth, provider-openai-responses, provider-typesafe, provider-wire and store-postgres first carry 0.2.0 in their manifests) with the workflow's exact message 'Cognate SDK package <tag>', then pushed; cognate-cognate-v0.2.0 is intentionally absent because plan-sdk-release.mjs excludes the root package from component tags (the root owns the unified release)
- Remote tag state verified: 44 cognate-*-v0.2.0 component tags resolve on origin (35 pre-existing retained untouched, 9 new), matching the 44 tags plan-sdk-release.mjs emits for version 0.2.0
- Revision 50's release-side artifacts are thereby closed: the 0.2.0 story is now complete on tag, release object, npm registry (all 45 packages at 0.2.0) and component tags
- PR #34 merged as becdb1e (2026-10-12T00:38Z); post-merge CI on main green across verify, package and release workflows, including the subsequent release-please PR #35 merge run
- npm registry re-verified this session: @godspeedai/cognate-agent-discovery, -hook-interoperability, -provider-anthropic-compatible, -provider-auth, -provider-openai-oauth, -provider-openai-responses, -provider-typesafe, -provider-wire, -store-postgres all resolve to 0.2.0 and are independently installable, completing the bootstrap completion test in docs/release-unregistered-packages.md; published 2026-10-11T23:56Z satisfies the runtime's @godspeedai/cognate-store-postgres@^0.2.0 dependency constraint
- Repository variable NPM_TRUSTED_PUBLISHING_READY=true confirmed via the GitHub API, so the release.yml publish matrix (OIDC, environment release, no long-lived tokens) is armed for the next release-please-created release
- External consumer loop closed: Cognate-Workbench PR #1 merged 2026-10-12T00:34Z with verify checks SUCCESS, the re-run docs/release-unregistered-packages.md requires
- Release architecture re-confirmed on merged main: 45 packages registered, one public GitHub Release owned by packages/cognate, 44 components skip-github-release, all 45 in linked-versions (scripts/check-unified-release-config.mjs per the #34 evidence file)
- just verify: 81/81 gates pass; just typecheck clean; 45 READMEs pass
- all 9 packages independently verified on public npm registry at version 0.2.0
- clean-room installation of published @godspeedai/cognate@0.2.0, @godspeedai/cognate-cli@0.2.0, store-postgres, and all 8 provider/interop modules outside the monorepo passes smoke test
- node scripts/check-unified-release-config.mjs: 45 packages registered, 1 public GitHub release owner, all in linked-versions
- node scripts/plan-sdk-release.mjs: all 45 package manifests and manifest entries match SDK 0.2.0
- provider suites: 70/70 tests pass; model provider/registry tests: 6/6 pass; PostgreSQL suites: 77/77 pass

**Limits:** - NEW divergence awaiting operator decision: release-please PR #35 (4c942f2, merged 2026-10-12T01:21Z) bumped 44 of 45 .release-please-manifest.json entries to 0.3.0 while leaving packages/cognate at 0.2.0, so the post-merge run's cognate_release_created gate was false and tag-components plus publish were skipped; no cognate-*-v0.3.0 tag, no v0.3.0 GitHub release and no 0.3.0 npm publication exists (npm latest remains 0.2.0) - main's git metadata now claims 0.3.0 for 44 packages while every published artifact says 0.2.0, and the next release-please run inherits this state
- The cause of the 0.3.0 bump is release-please's linked-versions behavior on the #34 sync commits, and the root exclusion that kept packages/cognate at 0.2.0 is unexplained in the config review done this session; both need a deliberate fix (publish 0.3.0 properly, or normalize the manifest back to 0.2.0) rather than another automated pass
- The npmjs.com Trusted Publisher configuration for the nine new package names remains repo-claimed only until the next real publish exercises it
- Standing operator decisions unchanged: ledger freeze (OPEN_QUESTIONS 3, including whether DEBT-014 client/bidi streaming must be proven first) and the remaining OPEN_QUESTIONS items
- npmjs.com Trusted Publisher configuration for the nine new package names is claimed by the repository variable but the npmjs-side setup is not independently verifiable from this environment; it is exercised only at the next publish
- Standing operator decisions unchanged: ledger freeze (OPEN_QUESTIONS 3, including whether DEBT-014 client/bidi streaming must be proven first) and the remaining OPEN_QUESTIONS items
- NPM trusted publishing OIDC configuration on npmjs.com for newly added package names must be completed by the repository owner before release.yml can publish subsequent versions automatically
- SIWC is Level-2 evidence only: no live ChatGPT sign-in
- Effective hook state remains configuration evidence; runtime-observed activation explicitly unresolved
- MCP inspection is static evidence only; servers are never dialed, so reachability/auth is unverified

**Next:** Operator decision on the release-please 0.3.0 divergence: either publish 0.3.0 deliberately (verify why packages/cognate was excluded from the linked-versions bump first, so the cognate_release_created gate fires and npm actually receives the artifacts), or normalize .release-please-manifest.json back to 0.2.0 to match every published artifact. Until then do not merge another release-please PR. Also still open: ledger freeze per OPEN_QUESTIONS 3.

**Evidence:** - https://github.com/GodSpeedAI/Cognate/releases/tag/v0.2.0 (unified public release, Latest, retroactive-mint note in body)
- 44 cognate-*-v0.2.0 component tags on origin; the nine minted this session are annotated tags at becdb1e (git show cognate-store-postgres-v0.2.0 for the message)
- GitHub API observation of 4c942f2 (.release-please-manifest.json: 44 entries at 0.3.0, packages/cognate at 0.2.0) and PR #35 body (release-please component bumps to 0.3.0); no v0.3.0 release object (API 404); npm latest 0.2.0 for all queried packages
- .github/workflows/release.yml (tag-components and publish both gated on cognate_release_created, publish additionally on NPM_TRUSTED_PUBLISHING_READY)
- becdb1e (PR #34 merge) and a4517d0 (PR #35 release-please merge); GitHub Actions runs 38188804417 and 38191599497 green on main after both merges
- npm registry queries this session for the nine newly registered packages (all 0.2.0; publish timestamps 2026-10-11T23:56Z)
- .agents/evidence/2026-10-11-sdk-package-registration-and-release.md (45-package registration, clean-room install, always-auth remediation, unified-release validation)
- docs/release-unregistered-packages.md (bootstrap completion test and trusted-publisher instructions, now satisfied)
- GodSpeedAI/Cognate-Workbench PR #1 (merged, verify SUCCESS)
- .github/workflows/release.yml (tag-components and publish jobs gated on cognate_release_created and NPM_TRUSTED_PUBLISHING_READY)
- .agents/evidence/2026-10-11-sdk-package-registration-and-release.md
- .agents/evidence/2026-10-11-provider-protocol-siwc.md

**Spec:** .agents/specs/software-design-spec-cognate.-frameworkmd

**Ledger:** requirements/ledger.yaml

*This file is the human view of the latest snapshot only; the authoritative stream is
[.agents/CURRENT_STATUS.yaml](CURRENT_STATUS.yaml) (revision 51 is its last
line). Material uncertainty lives in [.agents/OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).*
