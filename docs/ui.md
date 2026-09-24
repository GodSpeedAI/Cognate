# UI: headless client, React, and Astryx

Three layers, each replaceable independently (spec §3.8, §25). Astryx types never cross into `@cognate/client` or `@cognate/react` (`CG-UI-003`, proven).

```text
RuntimeService (in-process or remote)
        │
        ▼
   @cognate/client     — headless, no React
        │
        ▼
   @cognate/react       — React 19 hooks
        │
        ▼
   @cognate/ui-astryx    — reference component system
```

## Headless client: `@cognate/client`

[`@cognate/client`](../packages/client/README.md) is a headless client over any `RuntimeService`, in-process or remote, with no React dependency (spec §25.1). It owns connection management, a local projection cache, subscriptions, capability registration, continuation interaction, artifact access, and run control:

- `run(runId)` — live `RunState` derived only from durable events: text (`message.delta`), shared state (`state.changed` snapshot or RFC 6902 patch), status, open continuations, artifacts, output, last position.
- `subscribe({ afterPosition })` — an event stream that resumes from the last delivered position after a disconnect, with no gaps and no duplicates; `status` reports `connecting`/`live`/`reconnecting`/`closed` (spec §31.8).
- `provideCapability(name, handler)` — serves frontend capabilities: an open `frontend_capability` continuation naming `name` is executed locally and resolved `{ ok, value | error }`. Returns an unregister function — a reversible effect (see [concepts.md](concepts.md#reversible-effects-durable-facts-external-commitments)).
- `projection`, `invoke`, `artifact`, `startRun`, `cancelRun`, `resolveContinuation`, `close`.

Proven by `test/client.test.ts` (`CG-CLT-001`).

## React bindings: `@cognate/react`

[`@cognate/react`](../packages/react/README.md) wraps `@cognate/client` for React 19 via `useSyncExternalStore` (spec §25.2): `CognateProvider`, `useCognate`, `useRun`, `useAgent`, `useProjection`, `useCapability` (registers a frontend capability for the component's lifetime, unregistered on unmount), `useContinuations`, `useArtifact`, `useConnectionStatus`. No Astryx dependency — renderers such as `@cognate/ui-astryx` sit above this package. Proven by `test/hooks.test.tsx` (`CG-UI-001`); tests register `happy-dom` through `test/setup-dom.ts`.

## Reference renderer: `@cognate/ui-astryx`

[`@cognate/ui-astryx`](../packages/ui-astryx/src/index.tsx) is Astryx's reference application shell: chat/agent surfaces, artifact surfaces, continuation/approval surfaces, run and state inspection, accessible controls, and theme/dark mode (spec §25.3). Its contract, from [`packages/ui-astryx/src/index.tsx`](../packages/ui-astryx/src/index.tsx):

```tsx
type ThemeMode = "light" | "dark";
function CognateShell(props: { title: string; mode?: ThemeMode; onModeChange?: (mode: ThemeMode) => void; children: ReactNode }): ReactNode;
function ChatPanel(props: { agent: string; placeholder?: string; onRunStarted?: (runId: string) => void }): ReactNode;
function ApprovalCard(props: { continuation: ContinuationView; onResolve: (approved: boolean) => void | Promise<void> }): ReactNode;
function Approvals(props: { runId: string | undefined }): ReactNode;      // renders every open approval continuation of a run
function ArtifactViewer(props: { artifactId: string | undefined }): ReactNode; // text/markdown as text, JSON as a table, other media as a download link
function RunInspector(props: { runId: string | undefined }): ReactNode;
function StateInspector(props: { runId: string | undefined }): ReactNode; // the run's derived state as formatted JSON
```

**In progress**: every exported function currently `throw`s `"ui-astryx: not implemented"`. `CG-UI-002` is `candidate` in [`requirements/ledger.yaml`](../requirements/ledger.yaml) — treat the signatures above as the contract, not as working behavior yet. Astryx implementation types must not cross into `@cognate/client` or `@cognate/react` once implemented.

## E2E testing note

End-to-end UI suites (`AK-010`, `CG-E2E-001`) hit [DEBT-012](../.agents/DEBT.md): Playwright's `webServer` TCP readiness probe hangs indefinitely on this WSL2 host, so fixtures use a `globalSetup` that spawns `bun run` and waits on stdout instead. Playwright workers run under Node, so `Bun` globals are unavailable inside specs — servers run as separate Bun processes.

## Status

`CG-UI-001` (React bindings) and `CG-UI-003` (no Astryx type leakage) are `implemented`. `CG-UI-002` (Astryx reference surfaces) is `candidate` — in progress. `CG-CLT-001` (headless client) proves the layer everything above depends on.

## Related

- [protocols.md](protocols.md) — AG-UI's compatibility with this client, for third-party frontends.
- [extensions.md](extensions.md) — how `profiles/copilot` composes these into a full application.
