# workbench — pure Workbench domain modules

## Overview

The Workbench layer's domain: types and event vocabulary, a pure reducer, and the decision modules for
contracts, authority, shell safety, glob matching, workflow scheduling, the Skill OS lifecycle,
evidence ledgers, economics, parallelism, steering, grounded feedback, and focus. Every module is pure:
the durable truth is the `workbench.*` event log and every row is derived
`[validation/reconstructions/deepseek-harness/cognate/src/workbench/reducer.ts:reduceWorkbench]`.

## Interface

- `WORKBENCH_EVENTS`, `WorkbenchEventType`, `TaskContract`, `CONTRACT_FIELDS`, `TaskStatus`, `DoneLevel`, `CAPABILITY_LIFECYCLE` — the event and object vocabulary `[validation/reconstructions/deepseek-harness/cognate/src/workbench/types.ts:WORKBENCH_EVENTS]`
- `reduceWorkbench`, `Write`, `usageScope` — the pure fold behind the `workbench` projection `[validation/reconstructions/deepseek-harness/cognate/src/workbench/reducer.ts:reduceWorkbench]`
- `TaskRecord`, `WorkflowInstanceRecord`, `CapabilityRecord`, `BindingRecord`, `AutomationRecord`, `UsageRow`, `BlockedRecord` — the row shapes `[validation/reconstructions/deepseek-harness/cognate/src/workbench/state.ts:TaskRecord]`
- `contractMissing`, `isContractComplete`, `defaultAuthority`, `contractChips` — contract completeness `[validation/reconstructions/deepseek-harness/cognate/src/workbench/contract.ts:contractMissing]`
- `decideWrite`, `decideShell`, `describeAuthority`, `matchesProtected`, `AuthorityRow` — authority decisions with protected-evidence enforcement `[validation/reconstructions/deepseek-harness/cognate/src/workbench/authority.ts:decideWrite]`
- `tokenize`, `splitCommands`, `isDestructiveCommand`, `mutationTargets`, `usesNetwork`, `installsPackages` — shell command analysis `[validation/reconstructions/deepseek-harness/cognate/src/workbench/shellSafety.ts:isDestructiveCommand]`
- `globToRegExp`, `globMatch`, `isGlob` — glob matching for protected-path patterns `[validation/reconstructions/deepseek-harness/cognate/src/workbench/glob.ts:globMatch]`
- `validateWorkflow`, `readyNodes`, `nodeDone`, `nextTransitions`, `failureRoute`, `retryable`, `workflowView`, `parallelLayers`, `frontendProductActualization` — workflow graph scheduling `[validation/reconstructions/deepseek-harness/cognate/src/workbench/workflow.ts:validateWorkflow]`
- `nextFire`, `describeSchedule`, `newAutomation`, `advance`, `deliveryReceipt`, `substrateNote` — automation lifecycle `[validation/reconstructions/deepseek-harness/cognate/src/workbench/automation.ts:advance]`
- `nextLifecycle`, `advanceLifecycle`, `canInvoke`, `isTrusted`, `seedCatalog`, `seedBindings`, `checkSubstitution`, `bindingsFor`, `detectConflicts` — the Skill OS `[validation/reconstructions/deepseek-harness/cognate/src/workbench/skillOs.ts:advanceLifecycle]`
- `ledgerRows`, `openRequired`, `groupLedger`, `reviewReadiness`, `acceptanceReady`, `doneLevel`, `artifactVerification` — the evidence ledger and review gate `[validation/reconstructions/deepseek-harness/cognate/src/workbench/ledger.ts:reviewReadiness]`
- `rollupUsage`, `budgetState`, `routeExecutor`, `costToVerifiedAcceptance`, `provenanceLine` — economics and executor routing `[validation/reconstructions/deepseek-harness/cognate/src/workbench/economics.ts:budgetState]`
- `WorkUnit`, `assessPair`, `planParallelism` — work-unit parallelism verdicts `[validation/reconstructions/deepseek-harness/cognate/src/workbench/parallelism.ts:planParallelism]`
- `emptyInbox`, `enqueue`, `drainStep`, `drainTurn`, `foldInbox` — the two-queue steering inbox `[validation/reconstructions/deepseek-harness/cognate/src/workbench/steering.ts:enqueue]`
- `validateGroundedFeedback`, `renderChangeContract`, `bindsRepairScope`, `describeFocus` — grounded feedback `[validation/reconstructions/deepseek-harness/cognate/src/workbench/grounded.ts:validateGroundedFeedback]`

## Invariants

- Rows are workspace-agnostic keys (`task/<id>`, `evidence/<taskId>/<id>`); the projection wrapper adds the tenant prefix and a case whose subject row is absent returns no writes `[validation/reconstructions/deepseek-harness/cognate/src/workbench/reducer.ts:reduceWorkbench]`
- Contract, evidence, and "done" components stay separate flags (`finished`, `produced`, `humanApproved`, `operationalized`), so no single boolean stands in for acceptance `[validation/reconstructions/deepseek-harness/cognate/src/workbench/state.ts:TaskRecord]`
- A workflow node is done only when its required evidence closure is met `[validation/reconstructions/deepseek-harness/cognate/src/workbench/workflow.ts:nodeDone]`
- The lifecycle is one ordered path: `advanceLifecycle` refuses a skip, and `canInvoke`/`isTrusted` decide usability from state `[validation/reconstructions/deepseek-harness/cognate/src/workbench/skillOs.ts:advanceLifecycle]`
- Attention resolves by fixed precedence, not recency: explicit selection, keyboard focus, active run, pinned focus, workspace fallback `[validation/reconstructions/deepseek-harness/cognate/src/workbench/focus.ts:ATTENTION_PRECEDENCE]`
- Steering keeps two queues — immediate at the next step boundary, deferred to the next turn `[validation/reconstructions/deepseek-harness/cognate/src/workbench/steering.ts:enqueue]`
- `glob.ts` and `shellSafety.ts` record in their own headers that they are re-implementations of named donor logic, not vendored code `[validation/reconstructions/deepseek-harness/cognate/src/workbench/glob.ts:globToRegExp]`, `[validation/reconstructions/deepseek-harness/cognate/src/workbench/shellSafety.ts:tokenize]`

## Side Effects

- None; these modules are pure functions and pure types `[validation/reconstructions/deepseek-harness/cognate/src/workbench/reducer.ts:reduceWorkbench]`

## Verification

- Run: `cd validation/reconstructions/deepseek-harness/cognate && bun test ./test/workbench-contract.test.ts ./test/workbench-ledger.test.ts ./test/workbench-workflow.test.ts`
