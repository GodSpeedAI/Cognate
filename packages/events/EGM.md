# events

## Overview

The event envelope, the `DurableStore` port every runtime adapter implements, the outbox dispatcher, and the store conformance kit `[src/types.ts:DurableStore]`. Two export maps exist: the package root re-exports `./types.ts`, the error classes, `validateNewEvent`, `MAX_PAYLOAD_BYTES`, `fingerprint`, `OutboxDispatcher`, and the projection-snapshot readers, while `./conformance` maps to `./src/conformance.ts` `[package.json:exports]`. The only dependency is `@godspeedai/cognate-kernel-api` `[package.json:dependencies]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — envelope types, validation, fingerprinting, error taxonomy, dispatcher, snapshot readers, conformance kit
- test/ — `envelope.test.ts` and `outbox-dispatcher.test.ts` (not child contracts)

## Global Invariants

- `eventType` must match lower-case dotted text; `schemaVersion` must be a positive integer; `occurredAt` must parse as a time `[src/validate.ts:validateNewEvent]`
- `tenant`, `correlationId`, and `scopeId` are required non-empty text; `causationId` and `runId` must be text or `null` `[src/validate.ts:validateNewEvent]`
- Payloads deeper than 64 nested levels, non-finite numbers, and non-plain objects are not JSON `[src/validate.ts:isJson]`
- A payload over `MAX_PAYLOAD_BYTES` (1 048 576 bytes) is rejected at commit time `[src/validate.ts:MAX_PAYLOAD_BYTES]`
- `semanticRef`, when present, must carry namespace, id, source uri and digest, and `projectionVersion` `[src/validate.ts:validateNewEvent]`
- `fingerprint` sorts object keys before hashing, so idempotency fingerprints are key-order independent `[src/fingerprint.ts:fingerprint]`
- Dispatcher `concurrency` above one requires stores that implement the fenced lease trio, else it throws `[src/dispatcher.ts:OutboxDispatcher]`
- The fallback snapshot reader reads the checkpoint before the rows so the reported checkpoint is never ahead of the rows `[src/snapshot.ts:readProjectionSnapshotFallback]`
- `OutboxStatus` is exactly `pending`, `delivered`, `poisoned` `[src/types.ts:OutboxStatus]`

## Global Side Effects

- `node:crypto` SHA-256 hashing for fingerprints `[src/fingerprint.ts:fingerprint]`
- Timer scheduling for delivery backoff and lease renewal inside the dispatcher `[src/dispatcher.ts:OutboxDispatcher]`
- Durable reads and settlements through the injected `DurableStore` `[src/dispatcher.ts:drain]`

## Verification

- Run: `cd packages/events && bun test`
