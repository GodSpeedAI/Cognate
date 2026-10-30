# ui-astryx/src — Astryx surfaces over cognate-react

## Overview
Two files back the two published entry points: `index.tsx` renders the reference surfaces and `styles.ts` locates the CSS a host page must serve `[packages/ui-astryx/package.json:exports]`. The file header states the boundary: a renderer, not the ontology, importing only types from `@godspeedai/cognate-runtime-api` and letting no Astryx type escape `[packages/ui-astryx/src/index.tsx:Reference Astryx surfaces]`.

## Interface
- `ThemeMode` — `"light" | "dark"` `[packages/ui-astryx/src/index.tsx:ThemeMode]`
- `CognateShell` — Astryx `Theme` wrapper with heading, theme toggle, and `main` region `[packages/ui-astryx/src/index.tsx:CognateShell]`
- `ChatPanel` — input that calls `useAgent(agent).start({ message })` and shows `state.text` `[packages/ui-astryx/src/index.tsx:ChatPanel]`
- `ApprovalCard` — renders `continuation.type` and JSON payload with Approve/Reject buttons `[packages/ui-astryx/src/index.tsx:ApprovalCard]`
- `isApprovalContinuation` — module-private predicate for approval-style continuations `[packages/ui-astryx/src/index.tsx:isApprovalContinuation]`
- `Approvals` — maps a run's open approval continuations to cards `[packages/ui-astryx/src/index.tsx:Approvals]`
- `ArtifactViewer` — media-type-driven artifact renderer `[packages/ui-astryx/src/index.tsx:ArtifactViewer]`
- `RunInspector` / `StateInspector` — run status counts and derived state as JSON `[packages/ui-astryx/src/index.tsx:RunInspector]`
- `stylesheetPaths()` — absolute paths of the two Astryx CSS files `[packages/ui-astryx/src/styles.ts:stylesheetPaths]`

## Invariants
- Theme mode is controlled when `mode` is passed and uncontrolled otherwise; `onModeChange` fires with the next mode on toggle `[packages/ui-astryx/src/index.tsx:CognateShell]`
- The shell wrapper always carries `data-cognate-theme` and renders under `neutralTheme` `[packages/ui-astryx/src/index.tsx:CognateShell]`
- `ChatPanel` clears the input before awaiting `start`, then reports `view.runId` to `onRunStarted` `[packages/ui-astryx/src/index.tsx:ChatPanel]`
- Only continuations with `condition.kind === "human_approval"` or a type containing `approval` are shown `[packages/ui-astryx/src/index.tsx:isApprovalContinuation]`
- Resolving an approval calls `resolve(id, "resume", { approved })` `[packages/ui-astryx/src/index.tsx:Approvals]`
- `ArtifactViewer` returns `null` when `artifactId` is undefined or status is `idle`, text while `loading`, and `artifact.error` on `error` `[packages/ui-astryx/src/index.tsx:ArtifactViewer]`
- `text/*` renders as text, `application/json` as a Key/Value `Table`, anything else as a download link; unparseable JSON falls through to the link `[packages/ui-astryx/src/index.tsx:ArtifactViewer]`

## Side Effects
- Requests the artifact record through `useCognate().artifact(artifactId)` in an effect guarded by a `cancelled` flag `[packages/ui-astryx/src/index.tsx:ArtifactViewer]`
- Creates blob object URLs via `URL.createObjectURL` and decodes bytes with `TextDecoder` `[packages/ui-astryx/src/index.tsx:ArtifactViewer]`
- Resolves CSS locations with `import.meta.resolve` plus `fileURLToPath`, leaving HTTP serving to the caller `[packages/ui-astryx/src/styles.ts:stylesheetPaths]`

## Verification
- Run: `cd packages/ui-astryx && bun test`
