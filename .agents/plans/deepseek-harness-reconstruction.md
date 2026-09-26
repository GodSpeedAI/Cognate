# Plan: DeepSeek Harness reconstruction (branch `cognate/harness`)

Spec: [.agents/prompts/deepseek-harness-reconstruction-test.md](../prompts/deepseek-harness-reconstruction-test.md). Method: [building-with-cognate](../skills/building-with-cognate/SKILL.md).
Reference: `deepseek-ai/deepseek-harness` @ `477b4f420553e8a52c2fbccc464d7561b239c443` (dsh 0.1.7-rc.2), cloned at `.tmp/ref/deepseek-harness` (git-ignored, observation only).
Output root: `validation/reconstructions/deepseek-harness/` (R below).

## Tranches (vertical slices, ordered by dependency and risk)

| # | Tranche | Journeys | Output |
|---|---|---|---|
| T0 | Pin + characterize reference | — | `R/reference-manifest.json`, `R/reference/observations/*` |
| T1 | Deterministic scenario model server (OpenAI-compatible SSE, scenario chosen by marker in last user message) + fixture workspace (known files + git state). Shared by reference and Cognate. | all | `R/fixtures/` |
| T2 | Reference behavior matrix and screenshots via Playwright against the pinned reference + T1 | all | `R/reference-behavior-matrix.md`, `R/reference/screenshots/` |
| T3 | Interaction domain model (`.sea`), validated | all | `R/cognate/domain/`, handoff |
| T4 | Framework defect repairs (general, regression-tested) and gap records | B, H | see "Findings" |
| T5 | App skeleton: Bun server + Connect runtime + React/Astryx shell geometry, Settings → Models (provider hot-swap), workspace choose/select, composer gating | A | `R/cognate/` |
| T6 | Sessions, conversation, streaming, history, reload/restart restore | B, G | |
| T7 | Tools: read / edit / shell, tool cards, diffs, workspace mutation | C | |
| T8 | Approvals: policy gate + continuation, approve / deny, persistence | D | |
| T9 | Plan mode / goals as projection over events | E | |
| T10 | Subagents: scoped child runs, activity view | F | |
| T11 | Cancel, provider error, retry | H | |
| T12 | Parameterized Playwright journey suite (reference + Cognate), visual side-by-side + diffs | A–H | `R/tests/`, `R/diffs/` |
| T13 | Architecture purity tests, reference-removal run, provenance, parity report, critic loop | — | `R/primitive-provenance.md`, `R/parity-report.{md,json}` |

Each tranche: builder subagent (Sonnet; Haiku for tightly local edits) → orchestrator verification (tests + diff + screenshots) → critic subagent with evidence → fix → commit.

## Findings (architectural)

- **D1 (defect, existing primitive):** `RunContext.emit` called inside `RunContext.step` shifts `emit:<n>` counters on replay (the replayed step skips its inner emits), so later emits can collide with recorded ones. `packages/runtime-bun/src/executor.ts` `emit`/`step`. Domain-independent; repair with a regression test.
- **D2 (defect, existing primitive):** `provider-openai-compatible` advertises `stream: true` but implements no `stream()`.
- **G1 (candidate gap):** a capability handler cannot publish progress (e.g. model token deltas) into the invoking run: `HandlerContext` has no emit/progress channel. Streaming through a policy-gated, hot-swappable `model.*` capability is therefore not expressible today. Decision pending (see status).
