# workbench — the Workbench cockpit components

## Overview

The cockpit: a tabbed workbench view (tasks, workflows, capabilities, automations) assembled from
pure presentational components, one data-access module, and one composer bar. Components receive data
and callbacks as props; the data module is the only place that reads the `workbench` projection and
the only place that calls capabilities. The rules every component follows are written in
`UX.md` in this directory `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/UX.md]`.

## Interface

- `WorkbenchView`, `WorkbenchViewProps`, `useBindableTasks` — the tabbed cockpit and the composer's bindable-task helper `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/Workbench.tsx:WorkbenchView]`
- `useWbRows`, `useWbRow`, `errorText`, `useWorkbenchActions`, `WbRow`, `Notice` — projection reads and capability invocations `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/data.ts:useWorkbenchActions]`
- `ComposerBar`, `ComposerBarProps` — the bar above the composer: bound task, runtime state, economics, and the referent `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/ComposerBar.tsx:ComposerBar]`
- `ContractEditor`, `ContractBar`, `TaskList`, `DoneLadder`, `WorkerReturnForm` — task contract and review surfaces `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/ContractEditor.tsx:ContractEditor]`
- `LedgerPanel`, `ReviewCard` — evidence ledger and review gate `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/LedgerPanel.tsx:LedgerPanel]`
- `WorkflowGraph`, `NodeInspector` — workflow graph and node detail `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/WorkflowGraph.tsx:WorkflowGraph]`
- `CapabilityList`, `AuthorityPlane` — capability catalog and authority plane `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/CapabilityList.tsx:CapabilityList]`
- `AutomationPanel` — automation creation, dispatch, and advancement `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/AutomationPanel.tsx:AutomationPanel]`
- `RuntimeStrip`, `RuntimeStripProps` — compact runtime/task/usage status line `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/RuntimeStrip.tsx:RuntimeStrip]`
- `data.ts` is the data layer; `*.css` and `UX.md` are the component rules and layout sheets `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/UX.md]`

## Invariants

- Components are presentational only: no projection hooks, no client calls, no `fetch`, and no `Date.now()` for facts — times arrive as props `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/UX.md]`
- One filled-accent button per surface, and a disabled control must explain itself in visible text; a control that does nothing must not render `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/UX.md]`
- State is words, not colour alone; a number that is not reported renders as `n/a` or `unknown`, never as a measured zero `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/UX.md]`
- `useWbRows` treats the projection key remainder as the row id, so `task/<id>` yields id `<id>` `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/data.ts:useWbRows]`
- `useWorkbenchActions.call` deep-clones its input through JSON so protobuf `Value` never sees `undefined`, and reports the capability's own refusal text via `errorText` `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/data.ts:useWorkbenchActions]`
- `errorText` extracts the `message` field from a capability's failure JSON and strips the capability-id prefix `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/data.ts:errorText]`
- `useBindableTasks` exposes only `READY`, `RUNNING`, and `REWORK` tasks of the given workspace `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/Workbench.tsx:useBindableTasks]`
- Every decision goes through a capability, which validates server-side; the cockpit never writes a projection directly `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/Workbench.tsx:WorkbenchView]`
- The starter skill catalog is seeded on first open so Skills is never a dead end `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/Workbench.tsx:WorkbenchView]`
- `RuntimeStrip` prints `unknown` for a missing elapsed value and `tok n/a` for a missing token count `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/RuntimeStrip.tsx:formatElapsed]`

## Side Effects

- Invokes workbench capabilities through the client and surfaces the resulting notice `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/data.ts:useWorkbenchActions]`
- Seeding the catalog is a capability call performed once per cockpit open `[validation/reconstructions/deepseek-harness/cognate/src/ui/workbench/Workbench.tsx:WorkbenchView]`

## Verification

- Run: `cd validation/reconstructions/deepseek-harness/cognate && bun test ./test/ui-tasks.test.tsx ./test/ui-contract.test.tsx ./test/ui-review.test.tsx ./test/ui-automation.test.tsx`
