# Evidence: SDK Package Registration, Manifest Synchronization, and Release CI Repair

- Date: 2026-10-11
- Branch: fix/register-new-sdk-packages (PR #34)
- Context: Synchronize the 9 newly published Cognate SDK packages with their npm 0.2.0 release, validate clean-room consumer installation, resolve the CI always-auth deprecation warning, validate the unified single-release architecture, and prepare PR #34 for merge.

## 1. Public npm Registry Verification (Version 0.2.0)

Every package was independently verified via unauthenticated HTTP GET to `https://registry.npmjs.org/<package>/0.2.0`:

- `@godspeedai/cognate-agent-discovery@0.2.0` — OK, tarball present, dependencies: `@godspeedai/cognate-hook-interoperability`
- `@godspeedai/cognate-hook-interoperability@0.2.0` — OK, tarball present, 0 runtime dependencies
- `@godspeedai/cognate-provider-anthropic-compatible@0.2.0` — OK, tarball present, dependencies: `@godspeedai/cognate-capabilities`, `@godspeedai/cognate-provider-auth`, `@godspeedai/cognate-provider-wire`
- `@godspeedai/cognate-provider-auth@0.2.0` — OK, tarball present, 0 runtime dependencies
- `@godspeedai/cognate-provider-openai-oauth@0.2.0` — OK, tarball present, dependencies: `@godspeedai/cognate-capabilities`, `@godspeedai/cognate-provider-auth`, `@godspeedai/cognate-provider-openai-responses`
- `@godspeedai/cognate-provider-openai-responses@0.2.0` — OK, tarball present, dependencies: `@godspeedai/cognate-capabilities`, `@godspeedai/cognate-provider-auth`, `@godspeedai/cognate-provider-wire`
- `@godspeedai/cognate-provider-typesafe@0.2.0` — OK, tarball present, dependencies: `@godspeedai/cognate-events`, `@godspeedai/cognate-capabilities`, `@godspeedai/cognate-provider-auth`
- `@godspeedai/cognate-provider-wire@0.2.0` — OK, tarball present, dependencies: `@godspeedai/cognate-capabilities`
- `@godspeedai/cognate-store-postgres@0.2.0` — OK, tarball present, dependencies: `postgres`, `@godspeedai/cognate-events`

## 2. Manifest Synchronization

All nine source package manifests updated to version 0.2.0:
- `packages/agent-discovery/package.json`: 0.1.0 -> 0.2.0
- `packages/hook-interoperability/package.json`: 0.1.0 -> 0.2.0
- `packages/provider-anthropic-compatible/package.json`: 0.1.0 -> 0.2.0
- `packages/provider-auth/package.json`: 0.1.0 -> 0.2.0
- `packages/provider-openai-oauth/package.json`: 0.1.0 -> 0.2.0
- `packages/provider-openai-responses/package.json`: 0.1.0 -> 0.2.0
- `packages/provider-typesafe/package.json`: 0.1.0 -> 0.2.0
- `packages/provider-wire/package.json`: 0.1.0 -> 0.2.0
- `packages/store-postgres/package.json`: 0.1.2 -> 0.2.0

Updated `.release-please-manifest.json` so all 45 registered SDK package paths are at version 0.2.0.

## 3. Release Architecture Validation

Executed verification scripts:
- `node scripts/check-unified-release-config.mjs`:
  45 SDK packages registered, 1 public GitHub Release owned by `packages/cognate`, 44 components set to `skip-github-release: true`, all 45 components in `linked-versions`. Output: PASS.
- `node scripts/plan-sdk-release.mjs`:
  All 45 package manifests and manifest entries match SDK version 0.2.0 without mismatch. Output: PASS.

## 4. Clean-Room Installation and Smoke Verification

In an isolated temporary directory outside the monorepo:
1. Installed published packages from npm:
   `bun add @godspeedai/cognate-cli@0.2.0 @godspeedai/cognate@0.2.0 @godspeedai/cognate-store-postgres@0.2.0`
   `bun add @godspeedai/cognate-runtime-bun@0.2.0 @godspeedai/cognate-agent-discovery@0.2.0 @godspeedai/cognate-hook-interoperability@0.2.0 @godspeedai/cognate-provider-anthropic-compatible@0.2.0 @godspeedai/cognate-provider-auth@0.2.0 @godspeedai/cognate-provider-openai-oauth@0.2.0 @godspeedai/cognate-provider-openai-responses@0.2.0 @godspeedai/cognate-provider-typesafe@0.2.0 @godspeedai/cognate-provider-wire@0.2.0`
2. Executed `scripts/clean-room-smoke.ts`:
   - capability executed; shared state derived from snapshot + patches: PASS
   - event persistence across runtime restart in SQLite: PASS
   - durable continuation suspended and resumed: PASS
   - CLI usage smoke: PASS
3. Verified module imports across all 9 new packages: PASS.

## 5. always-auth Warning Remediation

Root cause: `actions/setup-node@v4` with `registry-url: https://registry.npmjs.org` generates a user `.npmrc` file with `always-auth=false`. In modern npm (npm >= 11), `always-auth` is deprecated and produces `npm warn Unknown user config "always-auth"`.
Fix:
- In `.github/workflows/package.yml`: removed unnecessary `registry-url: https://registry.npmjs.org` from `setup-node` because packaging and clean-room installation are unauthenticated public reads and local packing.
- In `.github/workflows/release.yml`: added `npm config delete always-auth 2>/dev/null || true` immediately after `setup-node` to remove the obsolete config while retaining `registry-url` and OIDC authentication.

## 6. Repository Verification Gates

- `just check`: Substrate check passed (81/81 requirements).
- `just typecheck`: Clean.
- `just docs`: 45 published package READMEs checked, OK.
- `just verify`: 81/81 gates passed.
- Provider suites: 70/70 unit and conformance tests passed across 9 test files.
- Harness model provider / registry tests: 6/6 passed.
- PostgreSQL suites: 77/77 passed across 8 test files.
