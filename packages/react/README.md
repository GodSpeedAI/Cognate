# @godspeedai/react

React 19 bindings over `@godspeedai/client` (§25.2), via `useSyncExternalStore`.

`CognateProvider`, `useCognate`, `useRun`, `useAgent`, `useSharedState` (`{ state, update }` — shared state is bidirectional, spec §29.1: a component can write it and a suspended agent reads the write through `RunContext.state`), `useProjection`, `useCapability` (registers a frontend capability for the component's lifetime; unregistered on unmount — a reversible effect), `useContinuations`, `useArtifact`, `useConnectionStatus`.

No Astryx dependency; renderers such as `@godspeedai/ui-astryx` sit above this package (§3.8). Proof: `test/hooks.test.tsx` (CG-UI-001). Tests register happy-dom through `test/setup-dom.ts` and use render-bound queries.
