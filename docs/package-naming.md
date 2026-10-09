# Package naming convention and 0.1.0 name migration

Every Cognate-owned SDK module publishes as `@godspeedai/cognate-<module>`.
The `cognate-` infix identifies the owning product inside the `@godspeedai`
scope, which also contains independent GodSpeed products (for example
`@godspeedai/domainforge` and `@godspeedai/realitytrace` tooling). A
Cognate adapter for an independent technology therefore reads as the
Cognate integration of that technology:

- `@godspeedai/cognate-domainforge` — Cognate's adapter for DomainForge (the external `@godspeedai/domainforge` npm package).
- `@godspeedai/cognate-realitytrace` — Cognate's adapter for RealityTrace.

npm treats `@scope/a/b` as a subpath of the package `@scope/a`, not as a
third name segment, so the SDK uses independently versioned
`@godspeedai/cognate-*` packages. `@godspeedai/cognate` is an optional
umbrella entrypoint (`createRuntime`, `createClient`, plus `/runtime` and
`/client` subpaths); it re-exports and adds nothing else.

## 0.1.0 name migration (2026-10-08)

The first release briefly published the SDK as `@godspeedai/<module>`.
Those names are superseded and deprecated (except where noted). Old
versions remain installable and are never unpublished.

| Old name (`@godspeedai/…`) | New name (`@godspeedai/cognate-…`) |
|---|---|
| `a2a` | `cognate-a2a` (never published under the old name) |
| `ag-ui` | `cognate-ag-ui` |
| `artifacts` | `cognate-artifacts` |
| `capabilities` | `cognate-capabilities` |
| `cli` | `cognate-cli` |
| `client` | `cognate-client` |
| `cognitive-api` | `cognate-cognitive-api` |
| `cognitive-memory` | `cognate-cognitive-memory` |
| `cognitive-ruvector` | `cognate-cognitive-ruvector` |
| `cognitive-rvf` | `cognate-cognitive-rvf` |
| `continuations` | `cognate-continuations` |
| `domainforge` | `cognate-domainforge` (published only under the new name) |
| `events` | `cognate-events` |
| `execution` | `cognate-execution` |
| `execution-ssh` | `cognate-execution-ssh` |
| `execution-wsl` | `cognate-execution-wsl` |
| `kernel-api` | `cognate-kernel-api` |
| `kernel-cordis` | `cognate-kernel-cordis` |
| `mcp` | `cognate-mcp` |
| `profile` | `cognate-profile` |
| `profile-copilot` | `cognate-profile-copilot` |
| `profile-harness` | `cognate-profile-harness` |
| `projections` | `cognate-projections` |
| `proto` | `cognate-proto` |
| `protocol-connect` | `cognate-protocol-connect` |
| `protocol-connect-bun` | `cognate-protocol-connect-bun` |
| `provider-local` | `cognate-provider-local` |
| `provider-openai-compatible` | `cognate-provider-openai-compatible` |
| `react` | `cognate-react` |
| `realitytrace` | `cognate-realitytrace` |
| `runtime-api` | `cognate-runtime-api` |
| `runtime-bun` | `cognate-runtime-bun` |
| `store-memory` | `cognate-store-memory` |
| `store-sqlite` | `cognate-store-sqlite` |
| `ui-astryx` | `cognate-ui-astryx` |
| — (new) | `cognate` (umbrella entrypoint) |

## Release Please handling

Release Please identifies components by the unscoped package name, so the
rename produced fresh components (`cli` → `cognate-cli`, …) with no tag
collisions against the old `cli-v0.1.0`-style tags. The manifest
(`.release-please-manifest.json`) was reset to `0.0.0` for every path and
`initial-version: 0.1.0` bootstraps the new identities at exactly `0.1.0`,
independent of the old packages' history. The old GitHub releases and tags
remain as historical record.

## CLI

The command stays `cognate` (bin of `@godspeedai/cognate-cli`):

```sh
bunx @godspeedai/cognate-cli create my-app --profile copilot --source <checkout>
```

## Consumer type setup

Every `@godspeedai/cognate-*` package ships Bun-native TypeScript source.
Consumers running `tsc` need `bun add -d @types/bun @types/node` (verified
in the registry clean-room).
