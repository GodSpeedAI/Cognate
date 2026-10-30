# copilot/cognate — CopilotKit reconstruction app

## Overview

This is an independent third-party reconstruction of Cognate behavior: it rebuilds a pinned
CopilotKit reference surface on Cognate primitives so the behavior can be re-derived from the
documentation and pinned reference evidence rather than copied from reference source. The tree's own
docs state that framing and the evidence class per journey row (`[validation/reconstructions/copilot/DESIGN.md:1]`, `[validation/reconstructions/copilot/PRODUCT.md:1]`,
`[validation/reconstructions/copilot/reference-behavior-matrix.md:1]`, all at the tree root); the `package.json` scripts further scope it
(`dev`/`start`/`test`/`typecheck` `[validation/reconstructions/copilot/cognate/package.json:scripts]`). The code itself is one Bun process plus a
React UI; the app carries its own visual identity rather than posing as a pixel copy
`[validation/reconstructions/copilot/PRODUCT.md:38]`.

## Interface

- `scripts.test` — `bun test test`; `scripts.dev` serves on `PORT=3190` `[validation/reconstructions/copilot/cognate/package.json:scripts]`
- Runtime workspaces consumed: `@godspeedai/cognate-runtime-bun`, `-kernel-api`, `-projections`, `-react`, `-protocol-connect`, `-protocol-connect-bun`, providers and `@modelcontextprotocol/sdk` `[validation/reconstructions/copilot/cognate/package.json:dependencies]`
- `DESIGN.md` — authoritative visual system for the app's own surfaces `[validation/reconstructions/copilot/DESIGN.md]`
- `PRODUCT.md` — product truth: the three claims (conversation, frontend capability, shared state) `[validation/reconstructions/copilot/PRODUCT.md]`
- `reference-behavior-matrix.md` — per-row evidence classes for the pinned reference `[validation/reconstructions/copilot/reference-behavior-matrix.md]`
- Subdirectories: [src](./src/EGM.md) — server composition, journey agents, and React surfaces

## Invariants

- The dependency set is a Cognate workspace plus React/MCP/zod; no CopilotKit package is a dependency `[validation/reconstructions/copilot/cognate/package.json:dependencies]`
- Model behavior is deterministic by construction: the chat journey uses a local fixed-response provider with chunk size 8 `[validation/reconstructions/copilot/cognate/src/journey.ts:deterministicModelComponent]`
- The pinned reference is named by commit in the evidence matrix, and rows without black-box evidence stay marked documented-only `[validation/reconstructions/copilot/reference-behavior-matrix.md]`
- The app is judged as a product-quality application with its own visual identity, not a pixel copy `[validation/reconstructions/copilot/PRODUCT.md]`

## Side Effects

- `bun run dev` / `bun run start` bind a loopback HTTP port and open a PostgreSQL-backed runtime `[validation/reconstructions/copilot/cognate/package.json:scripts]`
- Boot writes `.generated/entry.tsx` in the app directory `[validation/reconstructions/copilot/cognate/src/server.ts:startServer]`

## Verification

- Run: `cd validation/reconstructions/copilot/cognate && bun test test`
