# profiles

## Overview
This directory groups Cognate's reference application profiles: compositions of registered framework components that demonstrate a complete app shape without adding kernel primitives. Each child is its own workspace package with its own manifest, source, and acceptance suite; the root workspace includes them via the `profiles/*` glob.

## Subdirectories & Boundaries
- Copilot: [./copilot/EGM.md](./copilot/EGM.md) — interactive copilot profile: model and tool loop, approvals, projections, AG-UI, React, Astryx
- Harness: [./harness/EGM.md](./harness/EGM.md) — reference harness: providers, tool registry, sessions, storage, skills, scheduler, sandbox, subagents

## Global Invariants
- Both manifests publish only `src` and export `"."`, so no profile ships test or config code to a consumer `[profiles/copilot/package.json:files, profiles/harness/package.json:files]`
- Both pin `engines.bun` to `>=1.4.0` `[profiles/harness/package.json:engines, profiles/copilot/package.json:engines]`
- Every framework dependency in a profile is a `workspace:*` range, so no profile reaches a published version independently `[profiles/copilot/package.json:dependencies, profiles/harness/package.json:dependencies]`
- Each profile's description states it adds no kernel additions, and its source composes existing packages only `[profiles/copilot/package.json:description, profiles/harness/package.json:description]`
- The architecture suite enumerates `profiles/*/package.json` as manifests it audits for forbidden dependency sources `[tests/architecture/invariants.test.ts:manifests]`
- No profile may define a `.sea` grammar or grammar extension file `[tests/architecture/invariants.test.ts:grammarFiles]`

## Global Side Effects
- Each profile's tests open a store (file-backed or `":memory:"`) and close the runtime they created `[profiles/harness/test/harness.test.ts:afterEach, profiles/copilot/test/copilot.test.tsx:afterAll]`
- The copilot suite registers happy-dom globals process-wide and unregisters them after the file completes `[profiles/copilot/test/setup-dom.ts:GlobalRegistrator]`

## Verification
- Run: `bun test ./profiles/copilot/test/copilot.test.tsx ./profiles/harness/test/harness.test.ts`
