# Artifact Viewer modules

## Overview
The implementation modules behind `just show-documents`: a loopback-only projection server over the repository's existing `docs/` Markdown, with local Git as the history backend. Nothing here copies Markdown, generates an HTML corpus, or commits anything.

## Interface
- `paths.ts` — `ViewerError` with a `ViewerErrorCode`, `ConfinedPath`, `isWithin`, `confine`, `resolveRoot` `[scripts/viewer/paths.ts:confine]`
- `corpus.ts` — `Corpus`, `buildCorpus` (walk, parse, index, backlinks), `indexResponse` (wire form) `[scripts/viewer/corpus.ts:buildCorpus]`
- `git.ts` — `HistoryProvider` interface and `LocalGitProvider` (`availability`, `history`, `content`, `lastCommit`, `repositoryHead`, `workingTree`) `[scripts/viewer/git.ts:LocalGitProvider]`
- `service.ts` — `DocumentationService` (`document`, `history`, `compare`, `save`, `asset`) and `sha256` `[scripts/viewer/service.ts:DocumentationService]`
- `assets.ts` — `FONT_FILES`, `STATIC_FILES`, `prepareAssets` (bundles `docs/.viewer/src/app.ts` into `.tmp/viewer/<hash>/app.js`) `[scripts/viewer/assets.ts:prepareAssets]`
- `PRODUCT.md` — the viewer's product brief (no EGM.md)

## Invariants
- Every requested path is canonicalized; traversal, absolute paths, NUL bytes, and symlinks resolving outside the root are rejected `[scripts/viewer/paths.ts:Path traversal is not served.]`
- `isWithin` treats only the root itself or a descendant as inside `[scripts/viewer/paths.ts:isWithin]`
- Confinement can restrict by extension; the document path only accepts `.md` `[scripts/viewer/service.ts:confine(this.#corpus.root, requested, { extensions: [".md"] })]`
- Only revisions matching `^(?:[0-9a-fA-F]{4,40}|HEAD)$` are read or compared `[scripts/viewer/service.ts:const REVISION]`
- A save is refused with `conflict` when `expectedSha256` no longer matches the file on disk `[scripts/viewer/service.ts:This document changed on disk since you loaded it]`
- Saves are size-capped at 2 MiB and written to a temporary sibling then renamed into place `[scripts/viewer/service.ts:MAX_DOCUMENT_BYTES]`
- Assets are served only for the `ASSET_TYPES` extension map; anything else is `not_a_document` `[scripts/viewer/service.ts:ASSET_TYPES]`
- Historical revision reads are read-only; no save path targets a revision `[scripts/viewer/service.ts:readOnly: true]`
- Git output is parsed with `%x1e`/`%x00` record separators so a spawn argument needs no NUL byte `[scripts/viewer/git.ts:const RECORD]`
- The viewer bundle is cached under a hash of its sources plus the root `package.json`, so a dependency upgrade forces a rebuild `[scripts/viewer/assets.ts:hashInputs]`
- A missing font package fails with "Run `bun install`." instead of degrading `[scripts/viewer/assets.ts:Font package missing]`

## Side Effects
- `buildCorpus` walks the documentation root and reads every `.md` file into memory; nothing is cached on disk `[scripts/viewer/corpus.ts:async function walk]`
- `prepareAssets` runs `Bun.build` and writes the bundle under `.tmp/viewer/` `[scripts/viewer/assets.ts:Bun.build]`
- `save` writes a `.viewer-save-<pid>-<uuid>.tmp` file beside the target and renames it over the document `[scripts/viewer/service.ts:temporary]`
- `LocalGitProvider` spawns `git` in the repository root for log, show, status, and ls-files `[scripts/viewer/git.ts:Bun.spawn]`
- `confine` performs disk `existsSync`/`realpathSync`/`statSync` calls to prove a path is inside the root `[scripts/viewer/paths.ts:realpathSync]`

## Verification
- Run: `bun test ./tests/integration/viewer-server.test.ts`
