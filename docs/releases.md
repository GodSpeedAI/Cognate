# One SDK release, many npm packages

Cognate is a single **linked-version SDK product** with individual installable `@godspeedai/cognate-*` packages.

## GitHub release format (future releases)

- Exactly **one public GitHub release** for each SDK version, with tag and title `vX.Y.Z`. The `packages/cognate` umbrella is the designated Release Please release owner.
- The umbrella releases in **component-in-tag mode**: Release Please creates its release on the internal `cognate-vX.Y.Z` tag, and a workflow step then creates the unified `vX.Y.Z` tag at the same commit and moves the release onto it. This is a requirement, not a preference — Release Please's linked-versions plugin silently drops any package whose strategy reports no component, and `getComponent()` is falsy whenever `include-component-in-tag` is false. Setting the umbrella to unprefixed tags removes it from the group, so it never gets version-bumped and the `cognate_release_created` publish gate never fires (observed once: 44 of 45 packages bumped to 0.3.0 while the umbrella stayed at 0.2.0 and nothing published).
- Component-specific Git tags such as `cognate-runtime-bun-vX.Y.Z` are **internal release-history markers**. They are needed by Release Please's manifest version tracking, but have **no associated GitHub Release objects**.
- Existing historical package tags and GitHub releases are preserved. This change does not delete or rewrite them, and the old releases remain visible unless an operator separately authorizes cleanup.
- The transition adds a `v0.2.0` tag referencing the historical `cognate-v0.2.0` commit before Release Please runs. This is a one-time bootstrap and does not rewrite the old tag.

## Automated flow

1. Release Please maintains one combined version-bump PR for all published paths.
2. After merge, it creates the one public GitHub Release from `packages/cognate` on the internal `cognate-vX.Y.Z` tag. A workflow step then creates the unified `vX.Y.Z` tag at the same commit and moves the release onto it, retitled to `vX.Y.Z`.
3. A dedicated job validates that every package **and** the manifest has the same version, then writes missing component Git tags to the release commit. If versions diverge, it fails and blocks automated npm publication.
4. The package matrix iterates every registered package and skips versions already on npm. It uses npm OIDC trusted publishing for new versions. No hard-coded list of package paths in YAML.
5. `scripts/check-unified-release-config.mjs` prevents future changes from silently re-enabling per-package GitHub Releases or omitting SDK packages.

## Initial npm bootstrap

Newly added packages still need to be present on npm at the release version, and npm OIDC trust may require an initial manual publication for each newly created name. A successful GitHub release **does not prove** npm availability. Retain and exercise clean-room installation gates.

## Recovery

Do not force-move existing tags. An existing component tag is left unchanged during idempotent recovery. If npm publication fails, inspect the package whose release is missing; publish the exact approved version and re-run the registry consumer verification. Never unpublish or overwrite existing npm versions.
