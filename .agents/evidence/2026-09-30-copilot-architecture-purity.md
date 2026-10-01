# Evidence — CopilotKit reconstruction: architectural purity suite (Phase 13)

- Date: 2026-09-30
- Session scope: plan R3 (`.agents/plans/copilot-reconstruction-remaining.md`) — new suite
  `validation/reconstructions/copilot/tests/architecture/` only. Nothing else modified; no
  commits made.
- Normative source: `.agents/prompts/copilotkit-reconstruction-test.md` §"Phase 13 —
  Architectural Purity Tests" (settlement gates 22, 23, 24, 26, 27, 28, 30).
- Precedent mirrored (technique, not paths): `validation/reconstructions/deepseek-harness/tests/architecture/`.

## Gate command and observed outcome

```
$ cd /home/sprime01/projects/cognate/validation/reconstructions/copilot && bun test tests/architecture/
```

Observed twice (first full run and a cold-start rerun), both green:

```
 45 pass
 0 fail
 132 expect() calls
Ran 45 tests across 9 files. [12.25s]
```

Typechecked with the repo's strict tsc flags (`bun x tsc --ignoreConfig --noEmit --strict
--noUncheckedIndexedAccess --verbatimModuleSyntax ...` over the 10 suite files): exit 0.
(The root `tsconfig.json` does not include `validation/**`, so this check is extra, not
`just verify` behavior.)

## Per-check results (mechanism)

1. No `@copilotkit/*`/`copilotkit` dependency — PASS. Manifests under `validation/reconstructions/copilot/**`;
   root `bun.lock` dependency closure of the copilot workspace (JSONC-repaired parse, validated);
   source import specifiers under `cognate/src`, `cognate/test`, `capture/`, `tests/`; resolved
   module graphs via Bun.build of the server entry (target bun), a browser UI entry over
   `src/ui/App.tsx`, and all 10 journey test entries (target bun, `bun:test` external), scanning
   bundle text for `@copilotkit/`, inlined `node_modules/...copilotkit...` paths, and
   import-context `copilotkit` specifiers. Self-naming strings (`copilotkit-reconstruction.*`,
   `/health` identity) excluded by construction.
2. No imports from the reference checkout — PASS. Specifier scan + relative-specifier resolution
   against the importing file; reference path from `reference-manifest.json` clonePath
   (`/home/sprime01/projects/cognate/.tmp/ref/copilotkit`) and the literal `.tmp/ref/copilotkit`.
   `reference/` excluded by design (sanctioned observation harness).
3. No copied CopilotKit source/CSS — PASS. 8-line normalized shingles (>=20 chars, boilerplate
   excluded) over `cognate/` + `capture/` (ts/tsx/css/mjs/json/svg) vs reference
   `packages/**`, `examples/**`, `showcase/**` (13,561 files, 670,624 shingles): 0 offending
   files; asset byte-identity: 0 matches.
4. No CopilotKit-specific kernel primitive — PASS. `packages/**/src` (except
   `packages/profile/src` composition, per spec §29.1) free of `CopilotAction`/`CopilotThread`/
   `CopilotChatPrimitive`/`CopilotGenerativeUI`/`CopilotHITL`/`/copilotkit/i`;
   kernel-api, kernel-cordis, runtime-api, runtime-bun additionally free of any `/copilot/i`.
   `profiles/copilot` untouched and out of scope as a legitimate profile composition.
5. AG-UI only behind the adapter boundary — PASS. No direct `@ag-ui/*` import under
   `cognate/src`; `@cognate/ag-ui` imported by `src/server.ts` (boundary in use);
   `packages/ag-ui/src` demonstrably wraps `@ag-ui/core`/`@ag-ui/encoder`; test trees
   (`cognate/test`, `tests/**`) are the sanctioned direct-`@ag-ui` locations and do not
   re-export it into app code. (`tests/protocol/` did not exist yet at run time; the check
   covers it by path when it lands.)
6. Astryx only in presentation — PASS. `@cognate/ui-astryx` has zero importers in the app
   today (declared dependency, presentation use is via the UI tree it gates); imports are
   constrained to `src/ui/**`, `*Surface.tsx`, or `server.ts` if they appear.
7. Cordis hidden behind Cognate — PASS. App imports neither `@cognate/kernel-cordis` nor
   `cordis`; framework-side, exactly one consumer chain: `packages/kernel-cordis` (cordis
   4.0.0-rc.10) consumed only by `packages/runtime-bun`.
8. SQLite remains authoritative — PASS. `server.ts` `createRuntime` gets `store:` as a plain
   identifier bound to `join(home, "copilot.sqlite")`; no `":memory:"`, no memory-store object,
   no `@cognate/store-memory` import; runtime-bun ships both stores, the app pins the file form.
9. `.sea` grammar unchanged — PASS. `git status --porcelain` (from repo root) shows no entries
   under `.sea/`, `packages/domainforge/`, `packages/realitytrace/`;
   `git diff --stat HEAD -- .sea packages/domainforge packages/realitytrace` empty;
   `validation/reconstructions/copilot/.sea/interaction/**` contains only `.sea` semantic
   models (`@namespace`-declaring, incl. `interaction-model.sea`) + catalog docs, no grammar
   artifacts (`*.pest|*.g4|grammar.*|*.tmLanguage.json`); no reconstruction source writes `.sea`.
10. DomainForge/RealityTrace unchanged — PASS. `git diff --stat HEAD` empty for both paths;
    porcelain clean; `git log --oneline -- packages/domainforge packages/realitytrace` has no
    copilot-mentioning subject (pin commit `b96b472` is general maintenance);
    `@godspeedai/domainforge@0.18.2` pin intact.
11. Reference removed (gate 23) — PASS. `.tmp/ref/copilotkit` renamed to
    `.tmp/ref/.copilotkit-ref-stash` (verified absent), then with it absent:
    `cd validation/reconstructions/copilot/cognate && bun test test` → exit 0 (11 pass /
    0 fail / 196 expects), and `cd validation/reconstructions/copilot && bun test
    tests/architecture/` with `COPILOT_ARCH_SKIP_REFERENCE_REMOVED=1` → exit 0 (41 pass /
    2 skip [this check + FAILED-GATE skip of the copied-source comparison] / 0 fail);
    restore asserted (`exists=true`), no stash leftovers. Restore guarantees: try/finally,
    `process.on("exit")`, SIGINT/SIGTERM/SIGHUP handlers, self-heal of a stale stash on the
    next run. Commands + output tails recorded in
    `tests/architecture/reference-removed.log` (two green full-suite runs recorded).
12. Documented gate command — PASS. `tests/architecture/README.md` documents
    `cd validation/reconstructions/copilot && bun test tests/architecture/`, observed green
    standalone from cold start.

## Scope and constraints honored

- Only paths written: `validation/reconstructions/copilot/tests/architecture/**` (new) and
  this evidence file. `cognate/`, `reference/`, `tests/protocol`+`tests/persistence` (absent
  at the time), `packages/**`, `.sea/**`, scripts, justfile: read-only.
- No fixed port used (4010 untouched; reference stack stayed down); no `npx aimock`/`npx llmock`;
  the reference-removed check's temporary rename is the only interaction with
  `.tmp/ref/copilotkit`, and it was restored and verified.
- No commits.

## Findings

- Bun.build dependency resolution inside `bun test` differs from a plain `bun run` process
  (server-entry builds failed to resolve `@connectrpc/connect` when invoked from the
  reconstruction root under `bun test`, but succeed from the app workspace cwd). The suite
  builds under `withChdir(APP, ...)` to get the proven-good resolution context. Worth knowing
  for future bundling tests.
- The reconstruction's declared `@cognate/ui-astryx` dependency currently has no importer in
  the app (presentation is hand-rolled in `src/ui/`); the boundary check gates any future
  import to presentation files only.
