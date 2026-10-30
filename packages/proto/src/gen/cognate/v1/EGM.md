# packages/proto/src/gen/cognate/v1 — generated cognate.v1 bindings

## Overview

Ten generated TypeScript modules, one per `proto/cognate/v1/*.proto` file: `artifact_pb.ts`, `capability_pb.ts`, `cognitive_pb.ts`, `component_pb.ts`, `continuation_pb.ts`, `event_pb.ts`, `execution_pb.ts`, `identity_pb.ts`, `runtime_pb.ts`, and `trace_pb.ts` `[packages/proto/src/gen/cognate/v1/event_pb.ts:2]`. Each module declares a `GenFile` descriptor, the message/enum types for that proto file, and their `GenMessage`/`GenEnum` schemas `[packages/proto/src/gen/cognate/v1/artifact_pb.ts:file_cognate_v1_artifact]`. All of it is produced by `buf generate` with the pinned local `protoc-gen-es` plugin and is never edited by hand `[packages/proto/buf.gen.yaml:plugins]` `[packages/proto/scripts/generate.ts:1]`.

## Interface

- `Event` / `EventSchema` / `Erasure` — the durable event envelope and its append-only erasure marker `[packages/proto/src/gen/cognate/v1/event_pb.ts:Event]`
- `Principal` / `SemanticSource` / `SemanticRef` — identity and semantic-reference messages `[packages/proto/src/gen/cognate/v1/identity_pb.ts:Principal]`
- `Run` / `StartRunRequest` / `GetRunRequest` — execution messages `[packages/proto/src/gen/cognate/v1/execution_pb.ts:Run]`
- `Continuation` / `ListContinuationsRequest` / `ListContinuationsResponse` — continuation messages `[packages/proto/src/gen/cognate/v1/continuation_pb.ts:Continuation]`
- `ComponentView` / `FiberState` / `FiberStateSchema` — component view message plus the generated fiber-state enum `[packages/proto/src/gen/cognate/v1/component_pb.ts:FiberState]`
- `RecallItem` / `RecallResult` — cognitive recall messages `[packages/proto/src/gen/cognate/v1/cognitive_pb.ts:RecallResult]`
- `GetArtifactRequest` / `Artifact` — artifact messages `[packages/proto/src/gen/cognate/v1/artifact_pb.ts:Artifact]`
- `CapabilityContract` / `PolicyDecision` / `InvokeRequest` — capability and policy messages `[packages/proto/src/gen/cognate/v1/capability_pb.ts:CapabilityContract]`
- `ObservationReceipt` — RealityTrace receipt message `[packages/proto/src/gen/cognate/v1/trace_pb.ts:ObservationReceipt]`
- `RuntimeService` / `StreamEventsRequest` / `ReadSharedStateRequest` — the runtime service descriptor and its request messages `[packages/proto/src/gen/cognate/v1/runtime_pb.ts:RuntimeService]`

## Invariants

- Files are generated output only: `buf generate` writes them into the resolved output directory, replacing what is there `[packages/proto/scripts/generate.ts:outDir]`
- A hand edit is detected, not tolerated: a fresh generation is compared against the committed `packages/proto/src/gen` digests by relative path `[packages/proto/test/codegen.test.ts:36]`
- Every module name mirrors its source proto file stem, and its header records that source path and the `cognate.v1` package `[packages/proto/src/gen/cognate/v1/runtime_pb.ts:2]`
- The runtime service may expose only `unary` and `server_streaming` method kinds `[packages/proto/test/codegen.test.ts:46]`
- Messages are typed against the `@bufbuild/protobuf` runtime version pinned by the package `[packages/proto/package.json:dependencies]`

## Side Effects

- Regeneration overwrites every `.ts` file in this directory `[packages/proto/scripts/generate.ts:Bun.spawn]`
- The matching test run generates into temporary directories and deletes them afterwards `[packages/proto/test/codegen.test.ts:28]`

## Verification

- Run: `bun test ./packages/proto/test/codegen.test.ts`
