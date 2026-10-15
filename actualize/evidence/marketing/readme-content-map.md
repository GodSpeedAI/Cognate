# README content map (old README.md to new location)

Source: `README.md` as it stood before this rewrite (1541 lines), copied to the scratchpad as `README.old.md`. Every H1 section of the old file and its H2 subsections is listed. "Verbatim" means moved with heading demoted from `#` to `##` and no text changed, except where a stale claim was fixed (noted).

| Old section (old line) | Destination | Treatment |
| --- | --- | --- |
| Title, status blockquote (L1-5) | `README.md` opening (approved top) and Release status | Status rewritten. Stale claims removed: "runs execute serially in a polling loop" (corrected in Under the hood, Concurrency), "without a checkout" framing (corrected) |
| `## Why Cognate?` (L40-61) | `docs/explanation/design-principles.md` | Moved; heading renamed to "Why Cognate starts one level lower" |
| `## Quick Start` (L62-103) | README opening (approved top) for the agent-built path; scaffold command in `docs/explanation/under-the-hood.md` (Profiles) | Fixed: `@godspeedai/cognate-cli@0.1` changed to `@0.5.0`; "no checkout needed" corrected (`cognate create` requires `--source`, C23). Starter layout tree and "No Redis" line not carried over (layout is in `docs/getting-started.md`, section "cognate create and cognate dev"; "No Redis" was marketing copy) |
| `# What You Can Build` (L105-179) | `docs/explanation/what-you-can-build.md` | Moved; one relative link fixed to `../decisions/` |
| `# One Application, Many Representations` (L180-224) | `docs/explanation/design-principles.md` | Moved verbatim |
| `# Architecture` (L225-274) | `docs/explanation/under-the-hood.md` | Moved verbatim (diagram and planes table) |
| `# Semantics First` (L275-312) | `docs/explanation/design-principles.md` | Moved verbatim; summarized in README Under the hood (DomainForge) |
| `# Everything Is a Capability` (L313-353) | `docs/explanation/design-principles.md` | Moved verbatim; plain-language version in README "How capabilities work" |
| `# Components Are Alive` (L354-391) | `docs/explanation/design-principles.md` | Moved verbatim |
| `# Effects Undo Themselves` (L392-419) | `docs/explanation/design-principles.md` | Moved verbatim |
| `# Not Everything Is Reversible` (L420-457) | `docs/explanation/design-principles.md` | Moved verbatim |
| `# Events Are Truth` (L458-499) | `docs/explanation/design-principles.md` | Moved verbatim; summarized in README Under the hood |
| `# Cognition Is Not Truth` (L500-552) | `docs/explanation/design-principles.md` | Moved verbatim; summarized in README Under the hood |
| `# Learning Cannot Grant Authority` (L553-585) | `docs/explanation/design-principles.md` | Moved verbatim; summarized in README Under the hood |
| `# Portable Cognition with RVF` (L586-634) | `docs/explanation/under-the-hood.md` | Moved. Fixed: `frameworkVersion: "0.0.0"` changed to `"0.5.0"` (the field is recorded in the manifest, `packages/cognitive-rvf/src/index.ts:12,45`). `createRvfIndex`, `importSnapshot`, `branch()` confirmed exported/present. RVF binding flagged experimental in README limits |
| `# RealityTrace Observations and Evidence` (L635-675) | `docs/explanation/under-the-hood.md`; summary in README Under the hood (Evidence) | Moved verbatim |
| `# Continuations: Work That Is Not Done Yet` (L676-716) | `docs/explanation/under-the-hood.md`; summary in README Under the hood and the Refund Desk walkthrough | Moved verbatim |
| `# Agent-Native UI` (L717-763) | `docs/explanation/under-the-hood.md` | Moved verbatim |
| `# Frontend Capabilities` (L764-786) | `docs/explanation/under-the-hood.md` | Moved verbatim |
| `# Shared State` (L787-809) | `docs/explanation/under-the-hood.md` | Moved verbatim |
| `# Artifacts Are First-Class` (L810-850) | `docs/explanation/under-the-hood.md` | Moved verbatim |
| `# Protocols Are Adapters` (L851-883) | `docs/explanation/under-the-hood.md`; summary in README Under the hood | Moved verbatim. Canonical page: `docs/protocols.md` |
| `# AG-UI Compatibility` (L884-906) | `docs/explanation/under-the-hood.md` | Moved verbatim |
| `# Protobuf + Connect` (L907-928) | `docs/explanation/under-the-hood.md` | Moved verbatim |
| `# Bun Native` (L929-956) | `docs/explanation/under-the-hood.md`; summary in README Under the hood | Moved verbatim |
| `# Any Model` (L957-990) | `docs/explanation/under-the-hood.md`; summary in README Under the hood | Moved verbatim |
| `# Providers Can Be Replaced Live` (L991-1012) | `docs/explanation/under-the-hood.md` | Moved verbatim |
| `# Profiles`, `## Copilot`, `## Harness` (L1013-1070) | `docs/explanation/under-the-hood.md`; summary in README Under the hood | Moved verbatim (`--source` note kept) |
| `# Build Your Own Profile` (L1071-1097) | `docs/explanation/under-the-hood.md` | Moved verbatim |
| `# Packages` (L1098-1148) | README Under the hood, Packages (table) | Rewritten, not moved. Corrected: old list used `@godspeedai/domainforge` (actual `@godspeedai/cognate-domainforge`), omitted packages, and had no profiles. New list = 45 workspace packages (43 in `packages/` + 2 in `profiles/`), names from each `package.json` |
| `# Built In, Not Locked In` (L1149-1173) | `docs/explanation/under-the-hood.md` | Moved verbatim |
| `# Failure Is Part of the Model` (L1174-1207) | `docs/explanation/under-the-hood.md` | Moved verbatim |
| `# Security` (L1208-1227) | README Under the hood, Security (summary); full text `docs/explanation/under-the-hood.md` | Moved verbatim; canonical page `docs/security.md` |
| `# Testing the Substrate` (L1228-1271) | `docs/explanation/under-the-hood.md` | Moved verbatim |
| `# Agent-Friendly by Design` (L1272-1301) | `docs/explanation/under-the-hood.md` | Moved verbatim |
| `# Examples` (L1302-1332) | README Examples (rewritten list, adds `refund-desk`); old tree kept in `docs/explanation/under-the-hood.md` | Rewritten list; `examples/README.md` remains canonical |
| `# Cognate vs. an Agent Framework` (L1333-1354) | `docs/comparisons.md`; condensed in README | Moved, lightly condensed in README |
| `# Cognate vs. a Frontend Agent SDK` (L1355-1364) | `docs/comparisons.md`; condensed in README | Moved verbatim |
| `# Cognate vs. a Memory Framework` (L1365-1380) | `docs/comparisons.md`; condensed in README | Moved verbatim |
| `# Cognate vs. a Workflow Engine` (L1381-1388) | `docs/comparisons.md`; condensed in README | Moved verbatim |
| `# The Design Rule` (L1389-1406) | `docs/explanation/design-principles.md` | Moved verbatim |
| `# Documentation` (L1407-1428) | README Documentation (new table); full map already in `docs/documentation-map.md` and `docs/README.md` | Rewritten; old layer table covered by existing docs |
| `# Development` (L1429-1454) | README Development | Rewritten from `justfile`. Old `bun dev` / `bun test` notes moved into the README command table; repository URL made concrete |
| `# Contributing` (L1455-1472) | README Contributing | Condensed; pointer to `docs/how-to/verify-a-change.md` |
| `# Architecture Lineage` (L1473-1492) | `docs/comparisons.md`; one-paragraph summary in README | Moved verbatim |
| `# Philosophy` (L1493-1538) | `docs/explanation/design-principles.md`; one line in README | Moved verbatim |
| `# License` (L1539-1541) | README License | Kept; Apache-2.0 per `LICENSE` |

## Stale claims fixed

| Claim | Old location | Fix | Evidence |
| --- | --- | --- | --- |
| `@godspeedai/cognate-cli@0.1` pin | Quick Start | `@0.5.0`, invoked with `bun x` | npm 0.5.0 (C2); `bun x` per onboarding (C26 notes) |
| "No checkout needed to generate an app" | Quick Start | `cognate create` requires `--source` | `packages/cli/src/bin.ts:31-35` (C23) |
| `frameworkVersion: "0.0.0"` | RVF snippet | `"0.5.0"` | `packages/cognitive-rvf/src/index.ts:12,45`; package versions 0.5.0 |
| "runs execute serially in a polling loop" | Status blockquote | Default serial (one run at a time), `maxConcurrentRuns` 1 to 64 with required `resourceKeys` above 1, background tick default 10 ms | `packages/runtime-bun/src/index.ts` (execution option, `tickMs`); `docs/runtime-concurrency.md` (C14) |
| "published on npm ... `@godspeedai/cognate-*`" | Status blockquote | Kept, now backed by the 0.5.0 status | C1, C2 |

## Also changed

- `skills.sh` link in the approved top changed to `https://skills.sh/godspeedai/cognate/building-with-cognate` (coordinator instruction), label "placeholder; not live yet" kept.

## New files

- `docs/explanation/design-principles.md`
- `docs/explanation/under-the-hood.md`
- `docs/explanation/what-you-can-build.md`
- `docs/comparisons.md`
