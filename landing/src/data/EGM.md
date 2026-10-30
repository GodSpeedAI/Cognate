# landing/src/data — verified evidence data

## Overview
Declarative modules holding every claim the site makes: a fourteen-part census with pinned source excerpts, the verified dependency edges between those parts, the six Workbench captures, the four-beat refund walkthrough, and the onboarding commands. Each module exports typed constants consumed by pages, components and the verification script. Nothing here renders; the modules are the single place a SHA or excerpt is written down.

## Interface
- `types.ts` — `Repo`, `LayerId`, `Part`, `Edge`, `SourceRef`, `Capture`, `EdgeKind` `[landing/src/data/types.ts:Part]`
- `parts.ts` — `layers` (L1–L4), `parts` (C-01..C-14), `edges` `[landing/src/data/parts.ts:parts]`
- `captures.ts` — `captures`, six bare PNGs from two pinned Workbench commits `[landing/src/data/captures.ts:captures]`
- `refund.ts` — `refundSteps`, `refundHead`, `leaseSource` `[landing/src/data/refund.ts:refundSteps]`
- `onboarding.ts` — `mkdirCommand`, `skillCommand`, `checkCommand`, `testCommand`, `firstRequest` `[landing/src/data/onboarding.ts:skillCommand]`

## Invariants
- `sources[0]` is the file the excerpt is copied from `[landing/src/data/types.ts:Part]`
- Only edges verified in source are listed, and each carries a file and line `[landing/src/data/types.ts:Edge]`
- `branchOnly` marks the parts the extension beat adds later `[landing/src/data/types.ts:Part]`
- Captures are copied byte-for-byte from pinned SHAs; the only permitted modification is lossy WebP re-encoding `[landing/src/data/captures.ts:WB]`
- `refundSteps` step 6 carries captured output instead of a file excerpt `[landing/src/data/refund.ts:RefundStep]`
- Onboarding commands must match the root README byte-for-byte after joining line continuations `[landing/src/data/onboarding.ts:mkdirCommand]`
- Workbench parts are pinned at two commits: the four contract captures at one, the Expert Teams pair at a later main `[landing/src/data/captures.ts:WB_MAIN2]`

## Side Effects
- None. Every export is a constant; the git reads happen in `scripts/verify-sources.ts` `[landing/src/data/parts.ts:edges]`

## Verification
- Run: `cd landing && bun test tests/parts.test.ts`
