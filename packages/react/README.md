# @cognate/react

React 19 bindings over `@cognate/client` (§25.2), via `useSyncExternalStore`.

`CognateProvider`, `useCognate`, `useRun`, `useAgent`, `useProjection`, `useCapability` (registers a frontend capability for the component's lifetime; unregistered on unmount — a reversible effect), `useContinuations`, `useArtifact`, `useConnectionStatus`.

No Astryx dependency; renderers such as `@cognate/ui-astryx` sit above this package (§3.8). Proof: `test/hooks.test.tsx` (CG-UI-001). Tests register happy-dom through `test/setup-dom.ts` and use render-bound queries.
