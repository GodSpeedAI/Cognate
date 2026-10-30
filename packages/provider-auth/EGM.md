# provider-auth

## Overview

`@godspeedai/cognate-provider-auth` at version `0.8.0` is described by its manifest as the "Ephemeral credential-source and usage authorization boundary for model providers" and exposes exactly one entry module, `./src/index.ts` `[packages/provider-auth/package.json:exports]`. The manifest declares `exports`, `files`, `engines`, and `publishConfig` but no `dependencies` block, so the package carries no runtime coupling `[packages/provider-auth/package.json:engines]`. It is consumed as a workspace dependency: `@godspeedai/cognate-provider-openai-responses` declares it directly `[packages/provider-openai-responses/package.json:dependencies]`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — the credential lease, source factories, and the subscription policy gate
- test/ — one suite, `auth.test.ts`; no `EGM.md` on disk, so it is not linked

## Global Invariants

- Only `src` is published (`files: ["src"]`), so the test suite is not part of the distributed package `[packages/provider-auth/package.json:files]`
- The contract is expressed purely as exported TypeScript types and functions; nothing in the package performs network, disk, or process work `[packages/provider-auth/src/index.ts:credentialHeaders]`
- A lease is per-request and must never be copied into an event, projection, capability description, error, or log `[packages/provider-auth/src/index.ts:CredentialLease]`
- The package does not grant permission to use a plan-backed subscription for unattended work; that is the gate's separate decision `[packages/provider-auth/src/index.ts:assertSubscriptionUse]`

## Global Side Effects

- The only outward action is awaiting a caller-supplied secret accessor at acquire time; there is no caching, refresh timer, or clock read in the package `[packages/provider-auth/src/index.ts:apiKeySource]`

## Verification

- Run: `cd packages/provider-auth && bun test`
