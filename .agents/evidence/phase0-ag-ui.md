# Phase 0 evidence — AG-UI — 2026-09-24

Environment: Bun 1.4.0, Linux (WSL2). Scope: `compatibility/phase0/ag-ui/`, an
isolated fixture with its own `package.json`/lockfile per the spec (§38
optional interoperability; §3.8; §6 "Optional protocols").

| Command | Exit | Observed result |
| --- | --- | --- |
| `bun install` (in `compatibility/phase0/ag-ui/`) | 0 | 6 packages installed: `@ag-ui/core@1.0.0`, `@ag-ui/encoder@1.0.0`, `@ag-ui/proto@1.0.0`, `zod@3.25.76` (transitive peer), plus 2 more transitive deps. |
| `bun test ag-ui.test.ts` | 0 | 20 pass, 0 fail, 46 `expect()` calls. |

## Per-behaviour results

| Behaviour | Result | Notes |
| --- | --- | --- |
| Package loads under Bun | PASS | `@ag-ui/core` and `@ag-ui/core/schemas` both import cleanly. |
| List all `EventType` values | PASS | 31 values enumerated (task brief names 14; the package has grown substantially — see API_NOTES.md). |
| Well-formed RUN_STARTED / RUN_FINISHED / RUN_ERROR validate | PASS | |
| Well-formed TEXT_MESSAGE_START/CONTENT/END validate | PASS | |
| Well-formed TOOL_CALL_START/ARGS/END/RESULT validate | PASS | |
| Well-formed STATE_SNAPSHOT validates | PASS | |
| Well-formed STATE_DELTA (JSON Patch, RFC 6902 ops) validates | PASS | `add`/`remove`/`replace`/`move`/`copy`/`test` all accepted. |
| Well-formed MESSAGES_SNAPSHOT validates | PASS | |
| Well-formed CUSTOM validates | PASS | |
| Malformed events are rejected | PASS | Missing required fields, an unknown JSON Patch `op`, and an unrecognized event `type` are all rejected by `EventSchema`/the specific schema. |
| `RunAgentInput` shape validates / rejects | PASS | `RunAgentInputSchema` accepts a well-formed input and rejects one missing `threadId`. |
| `@ag-ui/encoder` exists; SSE encoding works under Bun | PASS | `EventEncoder.encodeSSE()` produces a `data: <json>\n\n` frame that round-trips through `JSON.parse`. |
| `@ag-ui/proto` exists; binary encode/decode works under Bun | PASS | `encode`/`decode` round-trip a `RUN_STARTED` event with no native bindings required. |

No behaviour in scope failed or was left unproven. `API_NOTES.md` in the
fixture directory carries the exact field schemas per event (the
event-by-event matrix source) and the `RunAgentInput` shape.

## Limits / what this fixture does not prove

- Multimodal `TOOL_CALL_RESULT.content` parts (image/audio/video/document)
  are supported by the schema but not exercised beyond the plain-string
  form.
- No real HTTP/SSE server or client was stood up; SSE framing was
  validated by calling `EventEncoder` directly and parsing its output,
  not by an end-to-end stream over a socket.
- No CopilotKit-compatible consumer was tested (spec §24 "SHOULD support
  interoperability with existing CopilotKit-compatible consumers" —
  out of scope for this narrow fixture).

## Open questions

- Whether the eventual `packages/ag-ui` adapter should standardize on
  `@ag-ui/encoder` (SSE/text-oriented) or `@ag-ui/proto` (binary) as its
  primary wire format, or support both behind content negotiation
  (`EventEncoder`'s constructor already accepts an `accept` header hint
  for this).
