# Architectural purity suite (settlement gates 22, 23, 24, 26, 27, 28, 30 + Phase 13 purity bullets)

Automatically proves the CopilotKit reconstruction's architectural purity constraints
(normative: `.agents/prompts/copilotkit-reconstruction-test.md` §"Phase 13 — Architectural
Purity Tests").

## Gate command

```sh
cd /home/sprime01/projects/cognate/validation/reconstructions/copilot && bun test tests/architecture/
```

Green standalone from a cold start (observed: 45 pass / 0 fail in ~12 s, including the
reference-removed run). No service is booted on any fixed port — the only servers started are
the journey suite's own ephemeral runtimes (port 0) inside the reference-removed check. The
reference stack (4012/13361/8123/3000) stays down.

## What each file proves

| File | Gate | Proof |
| --- | --- | --- |
| `no-copilotkit-dependency.test.ts` | 22 | No `@copilotkit/*`/`copilotkit` dependency: manifests under the reconstruction, the root `bun.lock` dependency closure of the copilot workspace, source import specifiers, and the RESOLVED module graphs (bundled server entry, browser UI entry, every journey test entry). |
| `no-reference-imports.test.ts` | Phase 13 (supports gate 23's precondition) | No import/require specifier or resolved path reaches the pinned checkout (`.tmp/ref/copilotkit`, per `reference-manifest.json` `clonePath`). `reference/` (the sanctioned observation harness) is out of scope by design. |
| `no-copied-source.test.ts` | Phase 13 | No copied CopilotKit source/CSS: 8-line normalized-line shingles (>=20 chars, boilerplate excluded) over `cognate/` + `capture/` vs reference `packages/**`, `examples/**`, `showcase/**`; plus asset byte-identity. Skips with a FAILED-GATE message when the checkout is absent. |
| `kernel-primitives.test.ts` | 24 | No reference-named kernel primitive in `packages/**/src` (`CopilotAction`, `CopilotThread`, `CopilotChatPrimitive`, `CopilotGenerativeUI`, `CopilotHITL`, `/copilotkit/i`); `packages/profile` composition and `profiles/copilot` are allowed; kernel packages additionally hold "no /copilot/i at all". |
| `boundaries.test.ts` | 30 | AG-UI reached only through `@cognate/ag-ui` (direct `@ag-ui/*` only in `packages/ag-ui` and test trees); `@cognate/ui-astryx` only in UI/presentation files; no `kernel-cordis`/`cordis` import in the app, and framework-side only `runtime-bun -> kernel-cordis -> cordis` consumes them. |
| `sqlite-authoritative.test.ts` | Phase 13 | The server's `createRuntime` opens its runtime home on a SQLite file path (`join(home, "*.sqlite")`), never `:memory:` or a memory store object; no `@cognate/store-memory` import. |
| `sea-unchanged.test.ts` | 26 | `.sea` grammar unchanged: git evidence (`git status --porcelain`, `git diff --stat HEAD -- .sea packages/domainforge packages/realitytrace`, run from repo root), `.sea/interaction/**` holds only validation models + catalog docs (no grammar artifacts), and no reconstruction source writes to `.sea/**`. |
| `domainforge-realitytrace-unchanged.test.ts` | 27, 28 | DomainForge/RealityTrace untouched: empty `git diff --stat HEAD` and porcelain for both paths, no commit subject mentioning the copilot reconstruction (the 0.18.2 pin commit is general maintenance), external pin `@godspeedai/domainforge@0.18.2` intact. |
| `reference-removed.test.ts` | 23 | Gate 23: the pinned checkout is renamed aside (try/finally + process-exit + signal handlers + self-heal on next run), the journey suite (`cd cognate && bun test test`) and this suite (minus this check, via `COPILOT_ARCH_SKIP_REFERENCE_REMOVED=1`) must be green while it is absent, and the checkout is restored and asserted present. Appends observed commands + output tails to `reference-removed.log`. |
| `helpers.ts` | — | Shared paths, symlink-safe walkers, import-specifier extraction, git/lockfile utilities. |

## Notes

- The root `bun.lock` legitimately resolves `@copilotkit/aimock` for the *deepseek-harness*
  reconstruction's own mock-model devDependency. This suite scans the copilot reconstruction's
  dependency closure, so that entry is correctly out of scope.
- The reconstruction's own identity strings (`copilotkit-reconstruction.*` agent ids, the
  `/health` payload) are self-naming, not dependencies; the checks match import specifiers,
  dependency names, and inlined module paths, never the bare word.
- `reference-removed.log` records every reference-removed run (commands, exit codes, tails,
  restore confirmation). The log is evidence, not a gate: the assertion lives in the test.
