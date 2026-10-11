# Unregistered Cognate SDK packages (2026-10-11)

The Cognate-Workbench extraction CI attempted to install the published Cognate v0.2.0 SDK, but npm returned HTTP 404 for `@godspeedai/cognate-store-postgres`, `@godspeedai/cognate-provider-auth`, `@godspeedai/cognate-provider-anthropic-compatible`, and `@godspeedai/cognate-provider-openai-responses`. Release workflow `38177337770` was green but omitted nine package directories because they were missing from Release Please's package map and manifest.

This change registers every currently unregistered package and adds its component to the linked-versions group. Existing package versions are **not** manually overwritten here. Package versions for newly registered packages are set to their current checked-in version, pending Release Please's next release PR.

## Bootstrap required

New npm package names may require an initial, authenticated manual publication before npm Trusted Publisher/OIDC can be configured. Review the next release PR for version alignment. In particular, the published runtime v0.2.0 depends on `@godspeedai/cognate-store-postgres@^0.2.0`; a postgres version below 0.2.0 will not satisfy it. Do not consider registry bootstrap complete until the exact required package names and versions are independently installable from npm.

After initial publication, configure each newly created npm package's trusted publisher (repository `GodSpeedAI/Cognate`, workflow `release.yml`, environment `release`) and use the established OIDC release process. Do not add long-lived npm publishing tokens.

Verify all nine packages actually exist in the npm registry, run the separate consumer-install test, and then re-run [Cognate-Workbench PR #1](https://github.com/GodSpeedAI/Cognate-Workbench/pull/1).
