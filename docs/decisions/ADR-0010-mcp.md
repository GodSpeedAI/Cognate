# ADR-0010: Model Context Protocol (MCP) as an optional interoperability adapter

## Status

Accepted (Phase 0 characterization complete; no adapter code built yet).

## Context

Spec §6 lists MCP among the optional protocols alongside AG-UI, A2A,
WebSocket, SSE, raw HTTP, and gRPC compatibility adapters — all explicitly
*optional*, not part of the deterministic kernel. §38 pins
`@modelcontextprotocol/sdk` under "Optional interoperability." Before
adopting it, we needed to prove the SDK's server/client/tool-call
round-trip actually works under Bun 1.4.0
(`.agents/plans/build-v0.md` Phase 0 discipline).

## Decision

Adopt `@modelcontextprotocol/sdk@1.30.1` as the pinned MCP dependency for
a future `packages/mcp` adapter, based on the passing fixture at
`compatibility/phase0/mcp/` (evidence: `.agents/evidence/phase0-mcp.md`).

Key findings that inform adapter design:

1. **Import surface is subpath-only.** There is no useful root
   (`"."`) export for server/client construction; the adapter must import
   from `@modelcontextprotocol/sdk/server/mcp.js`,
   `@modelcontextprotocol/sdk/client/index.js`, and (for testing or
   in-process composition) `@modelcontextprotocol/sdk/inMemory.js`.
2. **Tool registration uses `registerTool` with a raw zod shape**, not a
   `z.object(...)` instance, for `inputSchema`. The older `server.tool(...)`
   overloads are deprecated in 1.30.1's types; the adapter should use
   `registerTool` from the start rather than building on a deprecated API.
3. **Server-side validation failures are not thrown exceptions.** A tool
   call with arguments that fail the declared zod shape returns a normal
   (non-rejected) result with `isError: true` and an MCP error code
   embedded in the text content, not a rejected promise. Any Cognate code
   that bridges MCP tool calls to its own capability/effect model must
   check `result.isError` explicitly — a bare `try/catch` around
   `callTool` will not observe a schema violation.
4. **In-memory transport is sufficient to prove the tool contract** (list
   + call) without standing up a real process boundary, which keeps the
   adapter's own test suite fast; real stdio/HTTP transports remain
   unverified and are a follow-up fixture, not assumed to "just work"
   from this pass.

## Consequences

- A future `packages/mcp` adapter can proceed pinned to
  `@modelcontextprotocol/sdk@1.30.1`, subject to dependency maturity
  policy (§39): exact version pin, MCP types isolated behind the adapter
  boundary, no leakage into Cognate's own capability/tool model.
- The adapter's tool-call bridge must translate `isError: true` responses
  into whatever failure representation Cognate's effect/continuation
  model uses (reversible runtime effect failure, per §3.9), rather than
  relying on promise rejection.
- Real transport fixtures (stdio, HTTP/streamable) are deferred; tracked
  as an open question rather than silently assumed.

## Alternatives considered

- Deferring MCP entirely until a concrete consumer exists: rejected for
  Phase 0 purposes since the spec explicitly names it as a reference
  optional protocol and the SDK's Bun compatibility was cheap to verify
  now rather than later, following the same "characterize before adopt"
  discipline applied to AG-UI and Astryx.
