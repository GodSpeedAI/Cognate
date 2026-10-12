# Current status

**Status revision:** 49

**Stage:** Synchronize nine published SDK package versions, validate unified release architecture, fix CI always-auth warning (PR #34)

**Summary:** Synchronized all nine newly registered Cognate SDK packages (agent-discovery, hook-interoperability, provider-anthropic-compatible, provider-auth, provider-openai-oauth, provider-openai-responses, provider-typesafe, provider-wire, store-postgres) to published version 0.2.0 in their respective package.json manifests and .release-please-manifest.json. Validated that all nine exist on npm at 0.2.0 and install cleanly in an unlinked clean-room environment outside the monorepo along with cognate and cognate-cli. Passed clean-room capability, continuation, event persistence, and CLI usage smoke tests. Verified the unified release architecture (one public GitHub release vX.Y.Z, internal component tags, 45 linked packages) via check-unified-release-config.mjs and plan-sdk-release.mjs. Resolved the CI always-auth deprecation warning by removing redundant registry-url in package.yml and deleting obsolete always-auth config in release.yml while preserving secure npm OIDC trusted publishing.

**Verified:**
- just verify: 81/81 gates pass; just typecheck clean; 45 READMEs pass
- all 9 packages independently verified on public npm registry at version 0.2.0
- clean-room installation of published @godspeedai/cognate@0.2.0, @godspeedai/cognate-cli@0.2.0, store-postgres, and all 8 provider/interop modules outside the monorepo passes smoke test
- node scripts/check-unified-release-config.mjs: 45 packages registered, 1 public GitHub release owner, all in linked-versions
- node scripts/plan-sdk-release.mjs: all 45 package manifests and manifest entries match SDK 0.2.0
- provider suites: 70/70 tests pass; model provider/registry tests: 6/6 pass; PostgreSQL suites: 77/77 pass

**Limits:**
- NPM trusted publishing OIDC configuration on npmjs.com for newly added package names must be completed by the repository owner before release.yml can publish subsequent versions automatically
- SIWC is Level-2 evidence only: no live ChatGPT sign-in
- Effective hook state remains configuration evidence; runtime-observed activation explicitly unresolved
- MCP inspection is static evidence only; servers are never dialed, so reachability/auth is unverified

**Next:** Push changes to PR #34 branch fix/register-new-sdk-packages, verify GitHub Actions CI completes green, update PR description, and merge PR #34 into main.

**Evidence:**
- .agents/evidence/2026-10-11-sdk-package-registration-and-release.md
- .agents/evidence/2026-10-11-provider-protocol-siwc.md
