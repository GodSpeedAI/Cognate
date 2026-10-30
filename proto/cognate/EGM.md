# proto/cognate — canonical protobuf tree

## Overview
The wire-surface protobuf tree, namespaced on disk by protocol version. Its only child is `v1/`, which holds one file per framework concept and a `package cognate.v1` declaration in each. `packages/proto` compiles these sources; nothing here is TypeScript and nothing here is imported directly by application code.

## Subdirectories & Boundaries
- v1: [./v1/EGM.md](./v1/EGM.md) — the `cognate.v1` message and service definitions

## Global Invariants
- Every source in this tree declares `syntax = "proto3"` and `package cognate.v1` `[proto/cognate/v1/event.proto:package]`
- Version is carried by the directory name, so a new wire surface is a new sibling directory rather than a rename `[proto/cognate/v1/EGM.md:Overview]`
- Files import each other by the versioned path, e.g. `cognate/v1/identity.proto` `[proto/cognate/v1/event.proto:import]`
- Shared scalar containers come from the well-known types, not from hand-rolled messages `[proto/cognate/v1/event.proto:struct.proto]`

## Global Side Effects
- None in this directory: the sources are read by codegen and never written `[proto/cognate/v1/EGM.md:Side Effects]`

## Verification
- Run: `bun test ./packages/proto/test/codegen.test.ts`
