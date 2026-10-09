# @godspeedai/cognate-ui-astryx

Reference chat-application surfaces for Cognate, built with the [Astryx](https://www.npmjs.com/package/@astryxdesign/core) design system: an application shell, chat panel, approval cards, artifact viewer, and run/state inspectors, with light/dark theming included.

**When to use this package:** you want a working, accessible Cognate UI out of the box, or a concrete reference while composing your own. It is a renderer, not the ontology — everything here composes [`@godspeedai/cognate-react`](https://www.npmjs.com/package/@godspeedai/cognate-react) hooks and Cognate types only, so swapping the design system means replacing this package and nothing else. For bindings without components, use `@godspeedai/cognate-react` directly.

## Installation

```sh
bun add @godspeedai/cognate-ui-astryx
```

Requires [Bun](https://bun.sh) >= 1.4.0 and **React 19.3.0** with **react-dom 19.3.0** (both declared as peer dependencies). Astryx itself (`@astryxdesign/core`, `@astryxdesign/theme-neutral`) is a regular dependency. The packages ship Bun-native TypeScript source; if you type-check outside Bun, add `@types/bun` and `@types/node`.

## Quick start

```tsx
import { useState } from "react";
import { createClient } from "@godspeedai/cognate-client";
import { CognateProvider } from "@godspeedai/cognate-react";
import { Approvals, ChatPanel, CognateShell, RunInspector } from "@godspeedai/cognate-ui-astryx";

const client = createClient({ service: runtime.service, caller }); // runtime from @godspeedai/cognate-runtime-bun

function App() {
  const [runId, setRunId] = useState<string>();
  return (
    <CognateProvider client={client}>
      <CognateShell title="Support copilot">
        <ChatPanel agent="agent.support" placeholder="Ask about a refund" onRunStarted={setRunId} />
        <Approvals runId={runId} />
        <RunInspector runId={runId} />
      </CognateShell>
    </CognateProvider>
  );
}
```

Type a message and the panel starts a run of the agent; streamed assistant text appears as it is emitted; approval-style continuations render as Approve/Reject cards that resolve through the client; the inspector follows status, open continuations, and artifacts. The shell works under server-side rendering (`renderToString` produces the accessible markup in light and dark modes) and hydrates against a live runtime.

## Surfaces

| Component | Purpose |
| --- | --- |
| `CognateShell({ title, mode?, onModeChange?, children })` | Astryx theme wrapper with a header (title, light/dark toggle) and main region; stamps `data-cognate-theme` on its root |
| `ChatPanel({ agent, placeholder?, onRunStarted? })` | message form that starts runs via `useAgent`; shows the streamed reply |
| `ApprovalCard({ continuation, onResolve })` | one continuation's type and payload with Approve/Reject buttons |
| `Approvals({ runId })` | all open approval-style continuations of a run as cards, resolved through `useContinuations` |
| `ArtifactViewer({ artifactId })` | `text/*` as text, JSON objects as an accessible key/value table, anything else as a download link |
| `RunInspector({ runId })` | status, error, open-continuation and artifact counts |
| `StateInspector({ runId })` | the run's derived shared state as formatted JSON |

## Serving the stylesheets

Astryx ships pre-compiled CSS (no style build step). `stylesheetPaths()` from the `./styles` subpath resolves the absolute paths of the two stylesheets a host page must link or serve:

```ts
import { stylesheetPaths } from "@godspeedai/cognate-ui-astryx/styles";

for (const path of stylesheetPaths()) registerStylesheet(path); // host-app specific
```

Without those stylesheets the components render and function, but not with Astryx's intended look.

## Limitations

- These are reference surfaces, not a component framework: there is no public theming API beyond Astryx's own `Theme`/`mode` mechanism surfaced by `CognateShell`.
- The chat panel covers one agent and the latest run's text; multi-run conversation views are yours to compose with `@godspeedai/cognate-react` hooks.
- Only text, JSON-object, and download-link artifact rendering is provided.

## Related packages

- [`@godspeedai/cognate-react`](https://www.npmjs.com/package/@godspeedai/cognate-react) — the hooks every surface here is built from.
- [`@godspeedai/cognate-client`](https://www.npmjs.com/package/@godspeedai/cognate-client) — the headless client underneath.
- [`@godspeedai/cognate-profile-copilot`](https://www.npmjs.com/package/@godspeedai/cognate-profile-copilot) — a composed application profile that ships these surfaces.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
