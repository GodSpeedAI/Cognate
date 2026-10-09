# UI: headless client, React, and Astryx

Three layers, each replaceable independently (spec §3.8, §25). Astryx types never cross into `@godspeedai/cognate-client` or `@godspeedai/cognate-react` (`CG-UI-003`, proven).

```text
RuntimeService (in-process or remote)
        │
        ▼
   @godspeedai/cognate-client     — headless, no React
        │
        ▼
   @godspeedai/cognate-react       — React 19 hooks
        │
        ▼
   @godspeedai/cognate-ui-astryx    — reference component system
```

## Headless client: `@godspeedai/cognate-client`

[`@godspeedai/cognate-client`](../packages/client/README.md) is a headless client over any `RuntimeService`, in-process or remote, with no React dependency (spec §25.1). It owns connection management, a local projection cache, subscriptions, capability registration, continuation interaction, artifact access, and run control:

- `run(runId)` — live `RunState` derived only from durable events: text (`message.delta`), shared state (`state.changed` snapshot or RFC 6902 patch), status, open continuations, artifacts, output, last position.
- `updateState(runId, update, options?)` — shared state is bidirectional (spec §29.1): a caller writes it too, not only the agent. The write appends a caller-sourced `state.changed` event that a suspended agent observes on resume through `RunContext.state`; `startRun(agent, input, { state })` seeds a run's initial state. `@godspeedai/cognate-react`'s `useSharedState(runId)` exposes the same read/write pair to components.
- `subscribe({ afterPosition })` — an event stream that resumes from the last delivered position after a disconnect, with no gaps and no duplicates; `status` reports `connecting`/`live`/`reconnecting`/`closed` (spec §31.8).
- `provideCapability(name, handler)` — serves frontend capabilities: an open `frontend_capability` continuation naming `name` is executed locally and resolved `{ ok, value | error }`. Returns an unregister function — a reversible effect (see [concepts.md](concepts.md#reversible-effects-durable-facts-external-commitments)).
- `projection`, `invoke`, `artifact`, `startRun`, `cancelRun`, `resolveContinuation`, `close`.

Proven by `test/client.test.ts` (`CG-CLT-001`).

## React bindings: `@godspeedai/cognate-react`

[`@godspeedai/cognate-react`](../packages/react/README.md) wraps `@godspeedai/cognate-client` for React 19 via `useSyncExternalStore` (spec §25.2): `CognateProvider`, `useCognate`, `useRun`, `useAgent`, `useProjection`, `useCapability` (registers a frontend capability for the component's lifetime, unregistered on unmount), `useSharedState` (the read/write pair for a run's shared state, spec §29.1), `useContinuations`, `useArtifact`, `useConnectionStatus`. No Astryx dependency — renderers such as `@godspeedai/cognate-ui-astryx` sit above this package. Proven by `test/hooks.test.tsx` (`CG-UI-001`); tests register `happy-dom` through `test/setup-dom.ts`.

## Reference renderer: `@godspeedai/cognate-ui-astryx`

[`@godspeedai/cognate-ui-astryx`](../packages/ui-astryx/README.md) is Astryx's reference application shell: chat/agent surfaces, artifact surfaces, continuation/approval surfaces, run and state inspection, accessible controls, and theme/dark mode (spec §25.3). Its contract, from [`packages/ui-astryx/src/index.tsx`](../packages/ui-astryx/src/index.tsx):

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

`CG-UI-002` is `implemented`: `bun test ./packages/ui-astryx` proves Astryx 0.6.3 surfaces (Theme, Heading, Card, TextInput, Button, CodeBlock, Table) over `@godspeedai/cognate-react` — SSR in light and dark (`data-cognate-theme`), a hydrated chat that streams text, an Approve action that completes a continuation, and a JSON artifact rendered as a table, all against a real runtime; a `Bun.build` browser bundle stays within budget and Astryx CSS paths resolve (`.agents/evidence/m8-wire-client.md`). Astryx implementation types never cross into `@godspeedai/cognate-client` or `@godspeedai/cognate-react`.

## E2E testing note

End-to-end UI suites (`AK-010`) hit [DEBT-012](../.agents/DEBT.md): Playwright's `webServer` TCP readiness probe hangs indefinitely on this WSL2 host, so fixtures use a `globalSetup` that spawns `bun run` and waits on stdout instead. Playwright workers run under Node, so `Bun` globals are unavailable inside specs — servers run as separate Bun processes.

The full browser journey from semantic load to RVF snapshot (spec §36) passes: `CG-E2E-001` is `implemented` in [`requirements/ledger.yaml`](../requirements/ledger.yaml), and `just gate CG-E2E-001` re-proves it. It drives the Astryx UI, resolves an approval continuation in the browser, opens a JSON artifact as a table, recalls a prior run in a second run, and takes an RVF snapshot to the store head — then verifies all of it from the SQLite file in a separate process rather than from the UI. `DEBT-018` (RVF `FsyncFailed` under concurrent I/O) remains open and is worked around by a retry in the E2E app.

## Status

`CG-UI-001` (React bindings), `CG-UI-002` (Astryx reference surfaces), and `CG-UI-003` (no Astryx type leakage) are all `implemented`. `CG-CLT-001` (headless client) proves the layer everything above depends on.

## Related

- [subsystems/presentation.md](subsystems/presentation.md) — the subsystem page for this plane, with its state and failure modes.
- [workflows/client-and-ui-session.md](workflows/client-and-ui-session.md) — what a live client session actually does, including reconnect.
- [workflows/shared-state.md](workflows/shared-state.md) — the two writers behind `RunState.state` and `updateState`.
- [protocols.md](protocols.md) — AG-UI's compatibility with this client, for third-party frontends.
- [extensions.md](extensions.md) — how `profiles/copilot` composes these into a full application.
