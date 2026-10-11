# @godspeedai/cognate-provider-wire

Small shared, fetch-based HTTP and Server-Sent Events primitives for Cognate provider adapters. Install via `bun add @godspeedai/cognate-provider-wire` when building custom model providers.

Requires Bun >=1.4.0. `sendJson` posts a JSON request while preserving the caller's abort signal, `requestSignal` composes timeout and cancellation, `readSSE` yields framed SSE events, and `httpError` maps HTTP status to typed provider failures. Error messages do not echo upstream payloads or credentials.

SSE framing is not a complete provider-specific protocol: callers must validate lifecycle completion before settling outcomes. Network authentication belongs to a separate credential source.

License: Apache-2.0.
