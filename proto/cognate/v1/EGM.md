# Canonical proto schema (cognate.v1)

## Overview
The canonical protobuf sources for Cognate's wire surface, split one file per framework concept. `packages/proto` compiles these sources with a pinned `buf` / `protoc-gen-es` toolchain into the TypeScript bindings the transport packages consume. Messages carry framework concepts only, never domain ontology.

## Interface
- `artifact.proto` — `GetArtifactRequest`, `Artifact` (id, name, media type, content hash, bytes) `[proto/cognate/v1/artifact.proto:Artifact]`
- `capability.proto` — `CapabilityContract`, `PolicyDecision`, `InvokeRequest`, `InvokeResponse` `[proto/cognate/v1/capability.proto:CapabilityContract]`
- `cognitive.proto` — `RecallItem`, `RecallResult` with `status` `ok | degraded` `[proto/cognate/v1/cognitive.proto:RecallResult]`
- `component.proto` — `FiberState` enum and `ComponentView` `[proto/cognate/v1/component.proto:FiberState]`
- `continuation.proto` — `ContinuationStatus`, `ContinuationAction`, `ResolveOutcome`, list/resolve request-response pairs `[proto/cognate/v1/continuation.proto:Continuation]`
- `event.proto` — `Event` envelope and `Erasure` `[proto/cognate/v1/event.proto:Event]`
- `execution.proto` — `RunStatus`, `Run`, run and state request/response messages, `StateUpdate` `[proto/cognate/v1/execution.proto:Run]`
- `identity.proto` — `Principal`, `SemanticSource`, `SemanticRef` `[proto/cognate/v1/identity.proto:SemanticRef]`
- `runtime.proto` — `service RuntimeService` with 16 unary/server-streaming RPCs plus shared-state and remote-offer messages `[proto/cognate/v1/runtime.proto:RuntimeService]`
- `trace.proto` — `ObservationReceipt` `[proto/cognate/v1/trace.proto:ObservationReceipt]`

## Invariants
- Every file is `proto3` in `package cognate.v1` `[proto/cognate/v1/event.proto:package cognate.v1]`
- `RuntimeService` declares only unary and server-streaming methods; client and bidi streaming are unsupported on the Bun transport (DEBT-004) `[proto/cognate/v1/runtime.proto:client/bidi streaming are unsupported on the Bun transport (DEBT-004)]`
- Caller identity comes from transport authentication, never from a message field `[proto/cognate/v1/runtime.proto:Caller identity comes from transport authentication, never from messages (§32)]`
- `Event` ordering authority is stream sequence and store position `[proto/cognate/v1/event.proto:Stream sequence and store position are the ordering authority]`
- `ProjectionCheckpoint` is never ahead of the entries in the same response (DEBT-021) `[proto/cognate/v1/runtime.proto:Never ahead of the entries in the same response (DEBT-021)]`
- No message may be named for a DomainForge kind (Entity, Resource, Flow, Policy, Metric, Dimension, Unit, Role, Relation) or an example domain noun, and no file may import a `.sea` `[tests/architecture/invariants.test.ts:§3.7]`
- `buf.yaml` lints with `STANDARD` and checks `FILE`-level breaking changes `[packages/proto/buf.yaml:lint]`

## Side Effects
- None in this directory: the sources are declaration-only and are read, never written, by codegen `[packages/proto/buf.gen.yaml:inputs]`
- Compilation writes generated bindings into `packages/proto/src/gen`, outside this directory `[packages/proto/scripts/generate.ts:outDir]`

## Verification
- Run: `bun test ./packages/proto/test/codegen.test.ts`
