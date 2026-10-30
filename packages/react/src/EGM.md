# react / src — React 19 bindings over the headless client

## Overview

React 19 hooks that adapt the headless client's framework-neutral `Readable` values with `useSyncExternalStore`, leaving the client as the single source of truth `[index.tsx:1]`. The module exports `CognateProvider`, `useCognate`, and the run/state/capability/artifact/connection hooks `[index.tsx:CognateProvider]`. A module-level `RemoteCapabilityRendererRegistry` keeps same-session renderer provenance for remote capability calls `[index.tsx:RemoteCapabilityRendererRegistry]`.

## Interface

- `CognateProvider` — context provider carrying one `CognateClient` `[index.tsx:CognateProvider]`
- `useCognate` / `useConnectionStatus` — client access and `ConnectionStatus` subscription `[index.tsx:useConnectionStatus]`
- `useRun` / `useAgent` — derived run state and agent start helper `[index.tsx:useRun]`
- `useSharedState` / `useThreadSharedState` — mutable shared state with write functions `[index.tsx:useSharedState]`
- `useProjection` / `useArtifact` / `useContinuations` — projection rows, artifact fetch, open continuations plus resolver `[index.tsx:useContinuations]`
- `useCapability` / `useRemoteCapability` / `useRemoteCapabilityHistory` — frontend and remote capability registration `[index.tsx:useRemoteCapability]`
- `RemoteCapabilityRenderRecord` / `RemoteCapabilityRenderer` — renderer record and callback types `[index.tsx:RemoteCapabilityRenderRecord]`

## Invariants

- `useCognate` requires a mounted `CognateProvider`; the context default is `undefined` `[index.tsx:CognateContext]`
- Without a `runId`, `useRun` and `useRemoteCapabilityHistory` return `undefined` / an empty frozen history rather than throwing `[index.tsx:useRemoteCapabilityHistory]`
- A renderer key is `${continuationId}@${contractVersion}`, so a remounted offer is never mistaken for an older call `[index.tsx:RemoteCapabilityRendererRegistry]`
- Renderer history is keyed per run and cached as a stable snapshot per run id `[index.tsx:RemoteCapabilityRendererRegistry]`
- Renderer provenance is derived from durable `run.waiting` metadata where the type starts with `remote:`, plus terminal run events for positions `[index.tsx:RemoteCapabilityRendererRegistry]`
- Renderer callbacks live in provider memory and cannot be restored after a full reload `[index.tsx:useRemoteCapabilityHistory]`
- `useRemoteCapability` status is exactly `publishing`, `available`, `error`, and an unmounted prior registration is stopped on cleanup `[index.tsx:useRemoteCapability]`
- `useArtifact` decodes the body only when `mediaType` starts with `text/` `[index.tsx:useArtifact]`
- Only continuations whose action is `resume` or `cancel` can be resolved through `useContinuations` `[index.tsx:useContinuations]`

## Side Effects

- Client subscriptions (`client.subscribe`, `client.status.subscribe`) while hooks are mounted `[index.tsx:useRemoteCapabilityHistory]`
- Service calls: `offerCapability`, `artifact`, `resolveContinuation`, shared-state updates `[index.tsx:useRemoteCapability]`
- `crypto.randomUUID()` for the per-instance remote lease id `[index.tsx:useRemoteCapability]`

## Verification

- Run: `cd packages/react && bun test`
