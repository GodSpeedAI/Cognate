# ui — the console shell and its supporting modules

## Overview

`App.tsx` is the whole console shell: sidebar, session surface, composer, settings panels, developer
trace, and the entries into the cognitive frame and the Workbench cockpit. The other modules here are
the shell's helpers — markdown rendering, the WebMCP projection of shared attention, the cognitive
right-hand frame, the remote-workspace forms, an inline icon set, and one stylesheet concatenated by
the server. The visual system is locked in the tree's own `DESIGN.md` `[validation/reconstructions/deepseek-harness/cognate/DESIGN.md:1]`.

## Interface

- `App` — the shell; resolves settings from the durable `settings` row and the theme from `appearance` `[validation/reconstructions/deepseek-harness/cognate/src/ui/App.tsx:App]`
- `renderMarkdown` — dependency-free markdown to HTML: headings, bold/italic, inline code, fenced blocks, lists, links `[validation/reconstructions/deepseek-harness/cognate/src/ui/markdown.ts:renderMarkdown]`
- `CognitiveFrame`, `SurfaceView` — the conditional cognitive region and the closed-grammar surface renderer `[validation/reconstructions/deepseek-harness/cognate/src/ui/CognitiveFrame.tsx:CognitiveFrame]`
- `toolsForFocus`, `publishToWebMcp`, `WebMcpTool`, `WebMcpHost`, `AttentionBackend` — the focus-dependent WebMCP tool projection `[validation/reconstructions/deepseek-harness/cognate/src/ui/webmcp.ts:toolsForFocus]`
- `SshWorkspaceForm`, `WslWorkspaceForm`, `WorldBanner`, `useExecutionWorlds`, `friendlyConnectionError` — remote workspace UX `[validation/reconstructions/deepseek-harness/cognate/src/ui/RemoteWorkspaceForm.tsx:friendlyConnectionError]`
- `LogoIcon`..`MoreIcon` — the inline SVG icon set `[validation/reconstructions/deepseek-harness/cognate/src/ui/icons.tsx:LogoIcon]`
- Subdirectories: [workbench](./workbench/EGM.md) — the capability-native cockpit
- `app.css` is the app stylesheet the server concatenates before the workbench sheets `[validation/reconstructions/deepseek-harness/cognate/src/server.ts:startServer]`

## Invariants

- `SurfaceView` renders only a validated surface; anything invalid becomes a rejection message instead of markup `[validation/reconstructions/deepseek-harness/cognate/src/ui/CognitiveFrame.tsx:SurfaceView]`
- WebMCP tools never read the DOM and never mutate truth: a mutating action is proposed to the human as an ask `[validation/reconstructions/deepseek-harness/cognate/src/ui/webmcp.ts:toolsForFocus]`
- WebMCP always exposes `ui_context` and `ui_focus`; further tools exist only for the focused ref kind `[validation/reconstructions/deepseek-harness/cognate/src/ui/webmcp.ts:toolsForFocus]`
- `ui_focus` rejects an argument that is not a semantic ref before calling the backend `[validation/reconstructions/deepseek-harness/cognate/src/ui/webmcp.ts:toolsForFocus]`
- `renderMarkdown` escapes HTML before applying inline rules `[validation/reconstructions/deepseek-harness/cognate/src/ui/markdown.ts:renderMarkdown]`
- `friendlyConnectionError` maps host-key mismatch, auth failure, refused, timeout, DNS, key-read, passphrase, and not-a-directory cases to actionable text and otherwise strips invocation noise `[validation/reconstructions/deepseek-harness/cognate/src/ui/RemoteWorkspaceForm.tsx:friendlyConnectionError]`
- Surface metadata rows are read from `record/` keys of the `execution-worlds` projection `[validation/reconstructions/deepseek-harness/cognate/src/ui/RemoteWorkspaceForm.tsx:useExecutionWorlds]`
- The global `Ctrl+/` shortcut is ignored while focus is in a textarea or input `[validation/reconstructions/deepseek-harness/cognate/src/ui/App.tsx:App]`

## Side Effects

- Adds and removes a `window` keydown listener for the shortcuts dialog `[validation/reconstructions/deepseek-harness/cognate/src/ui/App.tsx:App]`
- Submits SSH/WSL credentials straight to the server's secret store, never keeping them in component state after submit `[validation/reconstructions/deepseek-harness/cognate/src/ui/RemoteWorkspaceForm.tsx]`
- Publishes attention tools to `navigator.modelContext` when the browser provides it `[validation/reconstructions/deepseek-harness/cognate/src/ui/webmcp.ts:publishToWebMcp]`
- Invokes workspace and world capabilities through the client `[validation/reconstructions/deepseek-harness/cognate/src/ui/RemoteWorkspaceForm.tsx:SshWorkspaceForm]`

## Verification

- Run: `cd validation/reconstructions/deepseek-harness/cognate && bun test ./test/E2E-remote-workspaces.test.ts`
