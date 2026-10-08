# Current status

**Status revision:** 38

**Stage:** 0.1.0 SDK release preparation: branches reconciled, packages publishable, Release Please automation live

**Summary:** Main integrates cognate/m46-carry (the only unintegrated branch) and is verified. All 35 @cognate/* packages carry public npm metadata and were bumped to 0.1.0 by Release Please (35 tags + GitHub releases). The SDK installs and works in a clean external project from a registry alone. Actual npm publication is blocked only by namespace account access: the npm user 'cognate' owns the scope and the current session (sprime01) cannot publish it.

**Verified:**
- just verify on main dd1a127: 78/78 gates pass, typecheck clean
- bun run test on 0b6bcdd: 742 pass / 0 fail / 24 env-gated skips; just gates 78/78 PASS
- DeepSeek harness reconstruction: 863 pass / 0 fail (clean run), real-Chromium E2E included
- CI verify green on PRs #4,#5,#6,#7,#8,#9,#10 and every main push; release workflow run 37853695104 success: 35 tags + 35 GitHub releases
- Clean room (verdaccio 6.10.5): all 35 0.1.0 tarballs packed+inspected OK, `bun add @cognate/cli@0.1.0` resolves 54 packages with no monorepo access, clean-room-smoke.ts SMOKE PASS (capabilities, derived shared state, 5 durable events across restart, continuation suspend/resume, CLI), strict tsc --noEmit against installed packages passes with @types/bun+@types/node

**Limits:**
- npm publication not performed: @cognate/* scope is owned by the existing npm user 'cognate'; publish as sprime01 returns 404 (masked 403), verified once — scope unclaimed
- npm trusted publishers cannot be configured before first publish; release.yml publish job stays gated on the NPM_TRUSTED_PUBLISHING_READY repository variable
- No npm provenance attestations: unsupported from private repositories (npm docs); none are claimed
- Copilot reconstruction J-E-controlled-rendering 5s waitFor timeout is pre-existing on main (reproduces on 080e7a5); deepseek J-B progress-event flake passes on rerun
- SDK remains Bun-native TS-source distribution: consumers need @types/bun and @types/node; no JS build output in 0.1.0

**Next:** Operator publishes 0.1.0 from an authorized npm session (tarballs ready in .tmp/pack-0.1.0), configures per-package trusted publishers (GodSpeedAI/Cognate, release.yml, environment release), sets NPM_TRUSTED_PUBLISHING_READY=true, then repeats the registry clean-room against the published versions

**Evidence:**
- .agents/evidence/2026-10-08-release-0.1.0-prep.md
