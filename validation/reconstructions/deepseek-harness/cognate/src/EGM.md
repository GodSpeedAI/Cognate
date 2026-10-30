# deepseek-harness/cognate/src — server composition, agents, and domain

## Overview

This directory composes the reconstruction's single Bun process: it loads the `.sea` domain, mounts
every capability component, registers the agents, folds eleven public projections, wires RealityTrace
delivery, and serves the Connect `RuntimeService` plus the bundled UI. Everything durable is an event;
the capabilities' only authority is to start deterministic `agent.config` / `agent.cognitive` runs
that record facts. The README locates the code split here (`pure domain modules in src/workbench/`,
capabilities in `src/capabilities/workbench.ts`, cockpit in `src/ui/workbench/`)
`[validation/reconstructions/deepseek-harness/cognate/README.md]`.

## Interface

- `startServer` — loads the domain, mounts components, registers agents and projections, serves HTTP; returns `AppServer` `[validation/reconstructions/deepseek-harness/cognate/src/server.ts:startServer]`
- `LOCAL_OPERATOR` / `SYSTEM_CALLER` — the operator (`tenant: "local"`) and system callers used by capability-initiated runs `[validation/reconstructions/deepseek-harness/cognate/src/server.ts:LOCAL_OPERATOR]`
- `GRANTED_CAPABILITIES` — the explicit allowlist the rule policy checks before every invocation `[validation/reconstructions/deepseek-harness/cognate/src/server.ts:GRANTED_CAPABILITIES]`
- `observationOutboxFor`, `wireObservations`, `observationCapabilityComponent` — RealityTrace intent hook, background drain, and read capabilities `[validation/reconstructions/deepseek-harness/cognate/src/observations.ts:observationOutboxFor]`
- `secretStore` — write-only 0600 JSON secret store `[validation/reconstructions/deepseek-harness/cognate/src/secrets.ts:secretStore]`
- `storeConfigFor`, `schemaFor` — deterministic per-home PostgreSQL schema `[validation/reconstructions/deepseek-harness/cognate/src/store.ts:storeConfigFor]`
- `PERMISSION_MODES`..`resolveGeneralSettings`, `isPluginStatePatch` — the Settings vocabulary and defaults `[validation/reconstructions/deepseek-harness/cognate/src/settings.ts:resolveGeneralSettings]`
- `WORK_DETAILS_MODES`, `showsLiveProcessDetail` — work-details presentation policy `[validation/reconstructions/deepseek-harness/cognate/src/workDetails.ts:showsLiveProcessDetail]`
- Subdirectories: [agents](./agents/EGM.md), [capabilities](./capabilities/EGM.md), [cognitive](./cognitive/EGM.md), [components](./components/EGM.md), [domain](./domain/EGM.md), [projections](./projections/EGM.md), [ui](./ui/EGM.md), [workbench](./workbench/EGM.md)

## Invariants

- Policy allows a capability only for `user` or `system` actors and only when its id is in `GRANTED_CAPABILITIES`; everything else falls through to deny `[validation/reconstructions/deepseek-harness/cognate/src/server.ts:buildPolicy]`
- `outboxFor` commits an observation intent in the same decision as the event, so no runtime dependency on RealityTrace is introduced `[validation/reconstructions/deepseek-harness/cognate/src/server.ts:startServer]`
- The observation read side mounts unconditionally; with no SXR target it reports `queued` instead of erroring `[validation/reconstructions/deepseek-harness/cognate/src/server.ts:startServer]`
- The RealityTrace drain gate reads the durable `settings` projection per cycle and fails closed, so observations queue instead of delivering `[validation/reconstructions/deepseek-harness/cognate/src/server.ts:startServer]`
- The UI bundle is rebuilt at every boot and served `no-store`, so a stale handler cannot survive a restart `[validation/reconstructions/deepseek-harness/cognate/src/server.ts:startServer]`
- A known workspaces set is maintained by following the live event stream; `workspace.added` is the only event that adds to it `[validation/reconstructions/deepseek-harness/cognate/src/server.ts:startServer]`

## Side Effects

- Creates `options.home`, the `.generated/` dir, `secrets.json`, and runs `Bun.build` at boot `[validation/reconstructions/deepseek-harness/cognate/src/server.ts:startServer]`
- Binds `127.0.0.1` on `options.port` serving `/health`, `/cognate.v1.RuntimeService/`, `/app.js`, `/astryx.css`, `/theme.css`, `/app.css`, `/` `[validation/reconstructions/deepseek-harness/cognate/src/server.ts:startServer]`
- Reads the `.sea` model from disk and logs its object count and digest `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:loadDomain]`
- Spawns the pinned SXR CLI via `wireObservations`; reads `SXR_BIN` or a repo-local binary path `[validation/reconstructions/deepseek-harness/cognate/src/observations.ts:defaultSxrBin]`
- Reads `PORT` (default 3180) and `COGNATE_HARNESS_HOME` when run as the main module `[validation/reconstructions/deepseek-harness/cognate/src/server.ts:startServer]`

## Verification

- Run: `cd validation/reconstructions/deepseek-harness/cognate && bun test ./test`
