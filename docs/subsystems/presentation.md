# Subsystem: presentation

## Purpose

Present a running application to people — without letting the presentation layer become the
application, and without letting a design system leak into the framework's contracts.

## Responsibilities

- A headless, transport-agnostic client over any `RuntimeService` (`@cognate/client`).
- React 19 bindings over that client (`@cognate/react`).
- A reference renderer built on Astryx (`@cognate/ui-astryx`).

## Non-responsibilities

- It holds no authority. Nothing here is cached in a way that cannot be rebuilt by replaying
  events from position 0.
- It does not authorize. `provideCapability` and `updateState` go through `RuntimeService`, which
  does.
- It does not define the application. Astryx is a renderer; the same application can be served by
  AG-UI, a CLI, or nothing at all.

## Position in the system

```text
RuntimeService (in-process or over any transport)
      │
      ▼
@cognate/client      — no React import, framework-neutral
      │
      ▼
@cognate/react       — useSyncExternalStore bindings
      │
      ▼
@cognate/ui-astryx   — reference surfaces
```

Dependencies are strictly downward: `ui-astryx → react → client`; `client` never imports React or
Astryx, and `react` never imports Astryx. Both absences are tests, not conventions
(`tests/architecture/dependencies.test.ts`).

## Core abstractions

- **`Readable<T>`** — `{ get(), subscribe(listener) }`. The client's universal observable; React
  adapts it with `useSyncExternalStore`.
- **`RunState`** — `{ runId, status, text, state, openContinuations, artifacts, output, error,
  position }`, derived only from the run's durable events.
- **`ConnectionStatus`** — `connecting | live | reconnecting | closed`.
- **`CognateClient`** — `status`, `startRun`, `cancelRun`, `updateState`, `run`, `subscribe`,
  `projection`, `resolveContinuation`, `provideCapability`, `invoke`, `artifact`, `close`.
- **React hooks** — `CognateProvider`, `useCognate`, `useRun`, `useAgent`, `useProjection`,
  `useCapability`, `useSharedState`, `useContinuations`, `useArtifact`, `useConnectionStatus`.
- **Astryx surfaces** — `CognateShell`, `ChatPanel`, `ApprovalCard`, `Approvals`,
  `ArtifactViewer`, `RunInspector`, `StateInspector`; `ThemeMode = "light" | "dark"`.

## Internal operation

`Engine` owns exactly one reconnecting subscription to the tenant event stream and derives
everything else from it. Details, including the generation guards and the frontend-capability
scan, are in [client-and-ui-session](../workflows/client-and-ui-session.md).

`RunStore` folds one run's events; `ProjectionStore` refreshes a named public projection whenever
any event commits, discarding a stale response with a generation counter.

`ArtifactViewer` renders text and markdown as text, JSON as a table, and anything else as a
download link — the "one artifact, many representations" idea, at minimum viable fidelity.

## State

All of it derived, none of it durable:

| Client-side | Lifetime | Rebuilt by |
|---|---|---|
| engine buffer of `StoredEvent` | the client's life | re-subscribing from `afterPosition: 0` |
| `RunStore` per run | the client's life | replaying the buffer |
| `ProjectionStore` per name | the client's life | the next `readProjection` |
| `resolvedFrontend` / `inFlightFrontend` | the client's life | — |

`useCapability` unregisters on unmount, which is what makes a frontend capability a reversible
effect rather than a leak.

## Lifecycle

Create a client (opens the stream) → subscribe/fold → close (aborts, awaits the loop, status
`closed`). There is no reconnect handshake beyond the automatic backoff loop, and no server-side
session: the durable run continues regardless of whether any client is connected.

## Failure modes

| Symptom | Cause | Recovery |
|---|---|---|
| status stuck `reconnecting` | the service or transport is unreachable | the loop retries at 50 ms → 2 s; fix the server |
| a UI value lags after a restart | the client re-subscribed from the wrong position | pass the last known `position`; `RunState.position` is the value |
| `provideCapability` handler never fires | the continuation's `condition.capability` does not match, or no `run.waiting` event arrived | check the `condition.kind` is `frontend_capability` |
| the same frontend continuation runs twice | not possible — tracked by `resolvedFrontend` + in-flight set | — |
| Astryx theme warns about runtime style injection | using the source theme instead of the prebuilt one | import `@astryxdesign/theme-neutral/built` and its CSS |
| a state update throws in the browser | a non-applying patch | skipped by `RunStore`; check the service-side error |
| `useSyncExternalStore` warns about changing snapshots | a mutable value returned from `get()` | return a new object (the client already does) |

## Extension points

- **A new surface** — build on `@cognate/client` directly. It is framework-neutral on purpose;
  Svelte, Vue, a CLI, or a native app are all legitimate consumers.
- **A frontend capability** — `client.provideCapability(name, handler)`, or `useCapability` in
  React. Scoped to the component's lifetime.
- **A new design system** — implement the same surfaces over `@cognate/react`. Astryx is a
  reference, not a contract (acceptance criterion F).
- **A custom run/projection view** — `useRun` / `useProjection` give the derived data; render
  whatever you like.

Not extension points: the `Readable` shape, `RunState`'s fields, or the decision to derive rather
than cache.

## Source trail

- `packages/client/src/index.ts` — `Readable`, `RunState`, `Engine`, `RunStore`,
  `ProjectionStore`, `createClient`.
- `packages/client/AGENTS.md` — "never cache authority; no React or Astryx imports".
- `packages/react/src/index.tsx` — the hook surface.
- `packages/ui-astryx/src/index.tsx`, `styles.ts` — the reference surfaces and `stylesheetPaths`.
- `packages/client/test/client.test.ts`, `packages/react/test/hooks.test.tsx`,
  `packages/ui-astryx/test/surfaces.test.tsx`.
- `tests/integration/failure-isolation.test.tsx` — a UI crash does not stop the runtime (`CG-FAIL-001`).
- [../ui.md](../ui.md) — canonical page for this plane.
- [decisions/ADR-0009-ui-react-astryx.md](../decisions/ADR-0009-ui-react-astryx.md).

## Related

- [../workflows/client-and-ui-session.md](../workflows/client-and-ui-session.md) — the trace.
- [../explanation/why-projection-not-storage.md](../explanation/why-projection-not-storage.md).
- [../security.md](../security.md) — what a browser may and may not do.
