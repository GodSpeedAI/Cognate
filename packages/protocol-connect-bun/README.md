# @cognate/protocol-connect-bun

Serves the Connect runtime service on `Bun.serve` and provides a fetch transport.

- `serveRuntime({ service, authenticate, port, limits })` — unauthenticated → HTTP 401 `unauthenticated`; bodies over `maxBodyBytes` → `resource_exhausted`; JSON deeper than `maxJsonDepth` → `invalid_argument`; unary calls bounded by `defaultDeadlineMs` → `deadline_exceeded` (CG-WIR-004).
- `connectTransport(baseUrl, { useBinaryFormat })` — connect-web fetch transport, usable from Bun and browsers.
- `devTokenAuthenticator` / `devToken` — `Bearer <tenant>:<principal>`; development only, not an authentication system.

Supported modes over HTTP/1.1: unary, server streaming (DEBT-004). Proof of second-process control: `tests/integration/second-process.test.ts` (CG-WIR-002).
