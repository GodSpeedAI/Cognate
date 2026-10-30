# domain — pure gate functions and the `.sea` binding loader

## Overview

Two different jobs share this directory. `domain/index.ts` is the one place that knows the `.sea`
interaction-model path; it parses the model in place and produces explicit capability bindings with
asserted arity. `approvalGate.ts` and `planGate.ts` are pure app functions named after the model's
entities, deciding whether a tool call needs human approval and what text the model receives back.
None of these modules performs I/O of its own.

## Interface

- `loadDomain`, `Domain`, `semanticId` — parse `.sea` and fail fast, exposing `${namespace}::${Entity}` ids `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:loadDomain]`
- `tranche5Bindings`..`bindTranche10`, `bindUsage2`, `bindUsage3`, `bindExecutionWorlds` — per-tranche binding groups `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:tranche5Bindings]`
- `COGNITIVE_ANCHORS`, `bindCognitive`, `WORKBENCH_ANCHORS`, `bindWorkbench` — per-capability semantic anchors `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:bindWorkbench]`
- `approvalGate`, `ApprovalDecisionRequest`, `ApprovalGateDecision`, `approvalDeniedToolResult` — the J-D approval decision `[validation/reconstructions/deepseek-harness/cognate/src/domain/approvalGate.ts:approvalGate]`
- `isPlanOffCommand`, `splitPlanPrefix`, `extractPlanHeading`, `EXIT_PLAN_MODE_NOT_IN_PLAN_MODE`, `PLAN_APPROVED_TOOL_RESULT`, `planRequestChangesToolResult` — the J-E plan helpers `[validation/reconstructions/deepseek-harness/cognate/src/domain/planGate.ts:isPlanOffCommand]`

## Invariants

- The IDM is read from `../.sea/interaction/interaction-model.sea` and never copied or symlinked; a parse error throws with the error JSON `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:loadDomain]`
- Binding groups assert their exact expected contract count and throw instead of returning a partial set `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:bindTranche5]`
- Only capabilities the app actually publishes are bound — no speculative bindings `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:tranche5Bindings]`
- Approval is required exactly when the tool is `run_code` and it carries a non-empty `sandbox_permissions` string ranked above the session mode; `read`/`edit`/`bash` never reach the gate `[validation/reconstructions/deepseek-harness/cognate/src/domain/approvalGate.ts:approvalGate]`
- An unrecognized permission or mode ranks above every known one, so the gate fails closed `[validation/reconstructions/deepseek-harness/cognate/src/domain/approvalGate.ts:approvalGate]`
- An absent mode defaults to `read-only`, the conservative default `[validation/reconstructions/deepseek-harness/cognate/src/domain/approvalGate.ts:approvalGate]`
- `planRequestChangesToolResult` states in its own comment that its wording is this app's invention, not a copy of an observed reference string `[validation/reconstructions/deepseek-harness/cognate/src/domain/planGate.ts:planRequestChangesToolResult]`
- `extractPlanHeading` takes the first markdown heading and otherwise falls back to a truncated first line `[validation/reconstructions/deepseek-harness/cognate/src/domain/planGate.ts:extractPlanHeading]`

## Side Effects

- Reads the `.sea` model file from disk and logs its object count and digest `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:loadDomain]`

## Verification

- Run: `cd validation/reconstructions/deepseek-harness/cognate && bun test ./test/J-D-approval.test.ts ./test/J-E-plan.test.ts`
