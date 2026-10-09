# @godspeedai/cognate-runtime-api

Transport-independent runtime contract (ADR-0011):

- `RuntimeService` — start/get/cancel runs, a reconnectable event stream, continuation listing and resolution, capability invocation, artifacts, public projections. Every operation takes a `Caller` established by the transport's authenticator, never by the request body (spec §32). Failures are `ServiceError` with a typed `code`.
- `AgentDefinition` / `RunContext` — durable, replay-safe agent authoring: `step`, `emit`, `invoke`, `artifact`, `waitFor`, `recall` record their results on stream `run-<id>`; re-entry after suspension or restart replays them.
- `@godspeedai/cognate-runtime-api/conformance` — the service kit. It runs unchanged in-process (`runtime-bun`) and over Connect (`protocol-connect`), which is how transport replaceability (§40.G) is proven.
