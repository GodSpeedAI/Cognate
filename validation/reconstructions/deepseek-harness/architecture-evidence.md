# Phase 8 — Architectural Purity Evidence

Branch `cognate/harness`, merge-base with `main`: `fb48fcf9c3a29507363f19dd3169278b1db4f219`, HEAD at evidence time: `d93250de4e9fb3ccd41b5540f8091012f22ee058`.

Spec: `.agents/prompts/deepseek-harness-reconstruction-test.md` lines 743-771 (Phase 8). Findings referenced (D1/G1/D2/F3): `.agents/plans/deepseek-harness-reconstruction.md` "Findings (architectural)".

Run everything: `bun test validation/reconstructions/deepseek-harness/tests/architecture` (62 tests / 8 files, all pass) plus the standalone script `validation/reconstructions/deepseek-harness/tests/architecture/reference-removed.sh` (criterion 8, run separately — it reinstalls and rebuilds the whole workspace and is slow).

| # | Spec criterion | Test file / command | Result |
|---|---|---|---|
| 1 | No dependency on `deepseek-harness`, `@deepseek-ai/*`, or `dsh-*` in any package.json (APP, root, packages/*, profiles/*) or bun.lock | `tests/architecture/dependency-hygiene.test.ts` | PASS (36/36 assertions) |
| 2 | No import/require specifier in APP src/domain/test or packages/** resolves into `.tmp/ref` or names a reference package; bundled browser output scanned too | `tests/architecture/no-reference-imports.test.ts` | PASS (6/6) |
| 3 | No copied reference source (8-line normalized shingles); no byte-identical asset | `tests/architecture/no-copied-source.test.ts` | PASS (3/3) — reference checkout was present, so this ran for real (not skipped) |
| 4 | No reference-specific primitive in the framework; every added export traceable to D1/G1/D2/F3 | `tests/architecture/framework-purity.test.ts` | PASS (4/4) |
| 5 | Cordis stays behind Cognate interfaces (APP never imports `@cognate/kernel-cordis` or `cordis`) | `tests/architecture/cordis-boundary.test.ts` | PASS (3/3) |
| 6 | Event history is authoritative: sessions/plans/subagents/workspaces projections rebuild identically after deleting all projection/checkpoint state | `tests/architecture/event-history-authoritative.test.ts` | PASS (1/1, tool+plan+approval+delegate journey) |
| 7 | `.sea`/DomainForge/RealityTrace unchanged; pinned versions unchanged | `tests/architecture/domainforge-realitytrace-unchanged.test.ts` | PASS (6/6) |
| 8 | Cognate works after the reference checkout is physically removed (literal removal run) | `tests/architecture/reference-removed.sh`, log at `tests/architecture/reference-removed.log` | see below |
| 9 | RuVector-rebuild criterion (vacuous: APP uses no cognition) | `tests/architecture/no-cognition-used.test.ts` | PASS (3/3) — vacuously satisfied, see note below |

## Exact commands

```
bun test validation/reconstructions/deepseek-harness/tests/architecture
bash validation/reconstructions/deepseek-harness/tests/architecture/reference-removed.sh
```

## Notes and scoping decisions

- **Criterion 1** distinguishes a *dependency on* the reference package family from the reconstruction's own workspace package name, `deepseek-harness-reconstruction` (APP lives under `validation/reconstructions/deepseek-harness/`). That name legitimately contains the substring "deepseek-harness" in `package.json` (`name` field) and in `bun.lock`'s workspace entry; it is not a dependency declaration and is explicitly excluded from the forbidden-pattern match.
- **Criterion 2**'s bundle scan boots the real app (`bootApp`/`withTempHome` from APP's own `test/helpers.ts`) and fetches the actual `/app.js` that `startServer()` builds and serves, rather than reimplementing the `Bun.build` call — this exercises the exact function under test. It flags any bundled string literal resolving into `.tmp/ref/deepseek-harness`, `@deepseek-ai/*`, or `dsh-*`. It does not flag Bun's own `// <source-path>` bundler comments for APP's own files (which legitimately contain the substring `deepseek-harness` as part of the repo path `validation/reconstructions/deepseek-harness/cognate/...`).
- **Criterion 4**'s declared-primitive check cross-references the branch's diff (`git diff <merge-base>..HEAD -- packages profiles`) against the plan's Findings section. The framework changes are: D1 (step/emit counter-drift fix, `runtime-bun/src/executor.ts`), G1 (durable `InvocationContext.progress` channel + `run.invocation.progress` event, `kernel-api/src/types.ts`, `kernel-cordis/src/lease.ts`, `runtime-bun/src/executor.ts`), D2 (mid-stream reader-abort mapping in `provider-openai-compatible/src/index.ts`, reusing the pre-existing `mapAbortOrNetworkError` helper — no new export), and F3 (structured `name`/`details` on `InvocationOutcome.failure` for the `"failed"` kind, `runtime-bun/src/invoker.ts`). None of the added/changed lines contain reference-specific identifiers or strings.
- **Criterion 6**'s journey covers a tool turn (`[[scenario:multi]]`), a plan turn (`/plan ... [[scenario:plan]]`, approved), an approval turn (`[[scenario:approval]]`, allowed), and a subagent delegation (`[[scenario:delegate]]`) so the `subagents` projection is exercised too. All four projections (`sessions`, `plans`, `subagents`, `workspaces`) are snapshotted, their `projection_state`/`projection_checkpoints` rows deleted directly in the SQLite store (`packages/store-sqlite/src/schema.ts`), and the app restarted — `createRuntime`'s startup loop runs `ProjectionRunner.catchUp()` for every registered projection before returning, rebuilding from position 0. The snapshots are deep-equal.
- **Criterion 7** scopes "unchanged" to the DomainForge *grammar engine* (`packages/domainforge`) and RealityTrace (`packages/realitytrace`), not APP's own new `.sea/interaction/*` files (the domain model this reconstruction built, which is expected to be new). `@godspeedai/domainforge` stays pinned at `0.18.1` in `bun.lock`; `@cognate/realitytrace`'s workspace entry is byte-identical to the merge-base.
- **Criterion 9**: APP declares and imports no `@cognate/cognitive-*` package and passes no `cognition` option to `createRuntime`. The "RuVector can be deleted and rebuilt without changing deterministic behavior" criterion is therefore **vacuously satisfied** — there is no cognitive index in this reconstruction to delete or rebuild. Cognition was not added merely to exercise this criterion.

## Criterion 8 detail

See `validation/reconstructions/deepseek-harness/tests/architecture/reference-removed.log` for the full PASS/FAIL-per-step output of the one recorded run.
