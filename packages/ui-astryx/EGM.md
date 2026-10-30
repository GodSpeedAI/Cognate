# ui-astryx — reference Astryx surfaces

## Overview

`@godspeedai/cognate-ui-astryx` provides reference Astryx surfaces over `@godspeedai/cognate-react`: shell, chat, approvals, artifacts, run and state inspection, and themes, explicitly described as a renderer rather than the ontology `[package.json:description]`. The directory holds no source files of its own; two entry points are published, `./src/index.tsx` and `./src/styles.ts` `[package.json:exports]`. Every surface is a React function component that reads runtime data through `cognate-react` hooks and renders it with Astryx primitives `[src/index.tsx:CognateShell]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — the surfaces (`CognateShell`, `ChatPanel`, `ApprovalCard`, `Approvals`, `ArtifactViewer`, `RunInspector`, `StateInspector`, `ThemeMode`) `[src/index.tsx:RunInspector]` and the `stylesheetPaths()` helper `[src/styles.ts:stylesheetPaths]`
- test/ — `surfaces.test.tsx` with `setup-dom.ts`; no EGM.md present
- `src/index.tsx` imports Astryx primitives, `neutralTheme`, five `cognate-react` hooks, the `ContinuationView` type, and React; Astryx types and `cognate-client` internals are not re-exported across this boundary `[src/index.tsx:1]`

## Global Invariants

- React and React DOM are declared peers at `19.3.0` and mirrored in `devDependencies` alongside `@types/react` `[package.json:peerDependencies]`
- Theme mode is controlled when a `mode` prop is supplied and uncontrolled otherwise: `effectiveMode` prefers `mode` over internal state, and the toggle reports through `onModeChange` `[src/index.tsx:CognateShell]`
- The shell always renders inside Astryx `Theme` using `neutralTheme` and marks the wrapper with `data-cognate-theme` `[src/index.tsx:CognateShell]`
- Only continuations whose condition kind is `human_approval` or whose type contains `approval` become `ApprovalCard`s `[src/index.tsx:Approvals]`
- Resolving an approval calls the client with action `"resume"` and payload `{ approved }` `[src/index.tsx:Approvals]`
- `ArtifactViewer` renders `null` when `artifactId` is undefined or the artifact status is `idle`, and surfaces `status === "error"` as text `[src/index.tsx:ArtifactViewer]`
- Artifacts render by media type: `text/*` as text, `application/json` as a key/value `Table`, anything else as a download link, with unparseable JSON falling back to the link `[src/index.tsx:ArtifactViewer]`
- `ChatPanel` starts a run through `useAgent(agent).start({ message })`, clears the input first, and reports `view.runId` to `onRunStarted` `[src/index.tsx:ChatPanel]`

## Global Side Effects

- Creates object URLs for non-text artifacts with `URL.createObjectURL` and decodes bytes with `TextDecoder` `[src/index.tsx:ArtifactViewer]`
- Resolves the Astryx core and neutral-theme CSS to absolute filesystem paths via `import.meta.resolve` and `fileURLToPath`, leaving serving to the host page `[src/styles.ts:stylesheetPaths]`
- `ArtifactViewer` fetches artifact records through `useCognate().artifact(artifactId)` inside an effect guarded by a `cancelled` flag `[src/index.tsx:ArtifactViewer]`

## Verification

- Run: `cd packages/ui-astryx && bun test`
