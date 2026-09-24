# @cognate/ui-astryx

Reference Astryx surfaces over `@cognate/react` (spec §25.3). A renderer, not the ontology — see §3.8.

## Surfaces

`CognateShell` (Astryx `Theme` + header with title/theme toggle + `<main>`), `ChatPanel` (form, `useAgent`, streamed text), `ApprovalCard` (type/payload, Approve/Reject), `Approvals` (open `human_approval`-style continuations via `useContinuations`), `ArtifactViewer` (`useArtifact`: text as text, JSON object as an accessible key/value `Table`, else a download link), `RunInspector` (status/error/continuations/artifacts), `StateInspector` (derived state as a `CodeBlock`).

## Theming

`CognateShell` wraps Astryx's `Theme` (from `@astryxdesign/theme-neutral`'s `neutralTheme`) and stamps `data-cognate-theme` with the active mode on its root element. Mode is controlled via `mode`/`onModeChange` or managed internally; the header's toggle button flips light/dark through Astryx's own `mode` prop on `Theme`.

## CSS serving

Astryx ships pre-compiled CSS (no StyleX build step, ADR-0009). `stylesheetPaths()` (`./styles`) resolves the absolute paths of `@astryxdesign/core`'s and `@astryxdesign/theme-neutral`'s stylesheets via `import.meta.resolve`; a host app must link/serve both for visual styling.

## Replaceability

Only `@cognate/react` hooks and `@cognate/runtime-api` types are imported beyond Astryx itself — no `@cognate/client` internals. Astryx types never leak past this package's exports (§3.8, §40.F), so swapping the design system touches only `packages/ui-astryx`.
