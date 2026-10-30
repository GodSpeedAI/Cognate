# react

## Overview

`package.json` declares `@godspeedai/cognate-react` at version `0.8.0`: React 19 bindings over the headless client for runs, projections, frontend capabilities, continuations, and artifacts. The `exports` map has a single entry, `.`, resolving to `./src/index.tsx`, and `files` publishes only `src`. This directory holds the manifest plus package metadata; the hooks live in `src/`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — `CognateProvider`, the run/projection/continuation/artifact hooks, and the remote-capability renderer registry
- test: `hooks.test.tsx`, `projection-convergence.test.tsx`, and `setup-dom.ts` — the bindings' own suites (not contract targets)

## Global Invariants

- `react` is declared both as a `peerDependencies` entry and as a dev dependency pinned at `19.3.0`, so the package never bundles its own React `[packages/react/package.json:peerDependencies]`
- Runtime dependencies are `@godspeedai/cognate-client`, `@godspeedai/cognate-events`, and `@godspeedai/cognate-runtime-api`; no UI surface package is a dependency `[packages/react/package.json:dependencies]`
- `@godspeedai/cognate-runtime-bun`, `@testing-library/react`, `@happy-dom/global-registrator`, and `react-dom` are dev-only, so the shipped bindings depend on an injected client `[packages/react/package.json:devDependencies]`

## Global Side Effects

- None at package load; hooks only subscribe to the injected client's `Readable` snapshots `[packages/react/src/index.tsx:useRun]`

## Verification

- Run: `cd packages/react && bun test`
