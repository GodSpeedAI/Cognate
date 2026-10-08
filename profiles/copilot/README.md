# @godspeedai/profile-copilot

Reference Copilot profile (spec §29.1, §40.J, CG-PRF-002): a pure composition of existing packages. No
kernel or runtime primitive is added; every profile component name resolves to an existing package.

| Profile component      | Backing package                  | Primitive used                                                              |
| ----------------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| `runtime`               | `@godspeedai/runtime-bun`            | `createRuntime` (kernel, store, agent execution loop)                              |
| `runs`                  | `@godspeedai/runtime-api`            | `AgentDefinition.run(input, RunContext)`                                           |
| `continuations`         | `@godspeedai/continuations`          | `RunContext.waitFor` (approval gate + frontend tool waits)                         |
| `frontend-capabilities` | `@godspeedai/runtime-api`            | `invokeFrontend` (a `frontend_capability` continuation, no bidi transport)         |
| `state-projections`     | `@godspeedai/client`                 | `state.changed {snapshot|patch}` folded into `RunState.state` (RFC 6902)           |
| `artifact-projections`  | `@godspeedai/artifacts`              | `RunContext.artifact` → `run.artifact` → `RunState.artifacts` / `getArtifact`      |
| `ag-ui`                 | `@godspeedai/ag-ui`                  | `createAgUiHandler({ service, defaultAgent, authenticate })`                       |
| `react`                 | `@godspeedai/react`                  | `useCognate`, `CognateProvider` (headless client bindings)                         |
| `astryx`                | `@godspeedai/ui-astryx`              | `ArtifactViewer` (used directly by consumers; not reimplemented here)              |

`createCopilotApp` mounts `modelComponent(options.model)` (`@godspeedai/provider-openai-compatible`) plus one
kernel component per backend tool, each publishing exactly `tool.contract` (its own capability id/version) —
no new contract shapes. `COPILOT_AGENT` is an ordinary `AgentDefinition`: it builds a `ModelRequest`, prefers
`provider.stream()` when available (recorded once via `ctx.step`, replayed as ordered `ctx.emit("message.delta")`
calls — `ctx.emit` is idempotent per call site, so replay never duplicates), and per tool call either
`ctx.waitFor` an approval continuation (`type` containing `"approval"`, `condition.kind: "human_approval"`) or
`invokeFrontend` a client-served tool. Approved backend calls go through `ctx.invoke(capability, args)`; their
`statePatch`/`render`/`artifact` projections emit `state.changed`, `ui.render`, and `ctx.artifact` respectively.

`GenerativeSurface` renders a run's `ui.render` events with an app-supplied component registry, synchronously
draining `useCognate().subscribe({ runId })`'s replayed buffer (so it also works under `renderToString`) and
keeping live via `useEffect` in a mounted client; an unknown `component` name renders a placeholder, never throws.

No file in this package touches `@godspeedai/kernel-cordis`, `@godspeedai/kernel-api`'s scope/fiber machinery, or any
runtime-bun internal — only its public `createRuntime` and `RunContext` surface.
