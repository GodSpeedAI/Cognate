# How to: add a protocol adapter

Give an existing or new `RuntimeService` a new wire surface, without letting the protocol define
what anything means.

**Goal.** A new RPC method over Connect, end to end: schema, generation, service contract,
server mapping, client mapping, tests.

**Prerequisites.** A working `RuntimeService` (the in-process one is fine).

**Note on scope.** If you only want to *consume* an existing service over a new transport, stop at
step 3 — implement the `RuntimeService` interface over your transport and run
`runtime-api/conformance`. That is the whole requirement for transport replaceability
(`CG-WIR-003`). Steps 4–6 are for adding a *new operation*.

## 1. Decide what you are adding

Ask the design rule first: is this a genuinely new primitive, or a projection of something the
service already models? If it is a projection, add it here. If it needs a new kernel concept, that
is a much larger decision (see [../explanation/why-adapters.md](../explanation/why-adapters.md)).

## 2. Extend the service contract

`packages/runtime-api/src/types.ts` — add the method to `RuntimeService`, with request/response
shapes that are transport-independent (JSON values, not protobuf messages):

```ts
listOrders(caller: Caller, request: { readonly agent?: string }): Promise<readonly RunView[]>;
```

`packages/runtime-api/AGENTS.md` states the consequence: a request/response shape change is a
contract revision that must update `runtime-bun`, `protocol-connect` (proto **and** mapping),
`client`, and the conformance kit **in one change**. Do it in one change.

## 3. Implement it in the reference runtime

`packages/runtime-bun/src/service.ts` — authorize with `ActionPolicy` if it is a state-changing
action, enforce tenancy (a foreign-tenant id is `not_found`, never `permission_denied`), do the
work, and map failures to `ServiceError` codes. Add the case to
`packages/runtime-api/src/conformance.ts` so every implementation must satisfy it.

## 4. Extend the schema

`proto/cognate/v1/*.proto` — add the message and the `rpc` to `RuntimeService`. Then:

```bash
bun --cwd packages/proto run generate      # regenerates packages/proto/src/gen/**
bun test ./packages/proto                 # codegen determinism
```

Never hand-edit `packages/proto/src/gen/**`. `packages/proto/test/codegen.test.ts` requires two
fresh generations *and* the committed output to be byte-for-byte identical.

## 5. Map it in both directions

`packages/protocol-connect/src/index.ts`:

- **server** — add the handler in `registerRuntimeService`. Identity still comes from
  `authenticate(headers)`, never from the body. Depth-check any `google.protobuf.Value` input the
  way `maxJsonDepth` does for the existing methods.
- **client** — add the method to `createRemoteRuntimeService`; round-trip `ServiceError` codes via
  the exported `errorCodes` table.

## 6. Prove it against the same kit

```ts
// packages/protocol-connect/test/service.test.ts already runs runtimeServiceConformance
// over both JSON and binary encodings. Your new case is covered for free once you
// added it to the kit.
bun test ./packages/runtime-api ./packages/protocol-connect ./packages/protocol-connect-bun
```

Then wire the client method (`packages/client/src/index.ts`) and, if a UI surface needs it, a hook
in `packages/react/src/index.tsx`.

## 7. For a non-Connect protocol

The shape generalizes:

1. map `RuntimeService` methods onto the protocol's own message types — never the reverse;
2. establish the caller from the transport's authenticator, or document explicitly that the
   protocol carries no identity (then require the caller to be supplied out of band);
3. translate `ServiceError` codes to the protocol's error type, and never report a partial success
   as success;
4. for anything the protocol cannot express, emit an explicit "unsupported" signal rather than a
   guess — the AG-UI adapter's `CUSTOM cognate.unsupported_interaction` is the pattern;
5. add a compatibility matrix row per protocol event kind if the protocol is event-shaped.

Examples to copy: `packages/mcp/src/index.ts` (tools over an authorized service),
`packages/a2a/src/index.ts` (tasks mapped onto runs and continuations),
`packages/ag-ui/src/index.ts` (a full outbound matrix plus inbound actions).

## 8. Register it in the evidence

```bash
just gate <the requirement id you are proving>
just verify
```

If the change satisfies a ledger requirement, update
[requirements/ledger.yaml](../../requirements/ledger.yaml) (`gate.run`, `gate.proof_paths`,
`evidence`) and append a status snapshot per [AGENTS.md](../../.agents/AGENTS.md).

## Common failure symptoms

| Symptom | Cause | Fix |
|---|---|---|
| generated code differs from committed | hand-edited, or a stale generator | regenerate; do not edit |
| `permission_denied` where you expected success | the caller was not established from headers | the authenticator, not the body |
| conformance fails only on the remote client | the error mapping or the JSON↔`Value` conversion differs | run both encodings; check `errorCodes` |
| streaming methods rejected | DEBT-004: no HTTP/2 path proven | keep to unary and server-streaming |
| a consumer breaks on a new field | a shape change without a contract revision | change all five packages together |

## Related

- [../subsystems/wire-and-protocols.md](../subsystems/wire-and-protocols.md) — the current surface.
- [../protocols.md](../protocols.md) — canonical page per protocol.
- [../explanation/why-adapters.md](../explanation/why-adapters.md) — the boundary rules.
- [../reference/architecture-tests.md](../reference/capability-and-architecture-contracts.md) — the guards you must not
  break.

## Source trail

- `proto/cognate/v1/*.proto`, `packages/proto/scripts/generate.ts`,
  `packages/proto/test/codegen.test.ts`.
- `packages/runtime-api/src/types.ts`, `src/conformance.ts`, `AGENTS.md`.
- `packages/protocol-connect/src/index.ts` — both mapping directions.
- `packages/protocol-connect/test/service.test.ts` — the shared kit over both encodings.
- [decisions/ADR-0003-wire-connect-protobuf.md](../decisions/ADR-0003-wire-connect-protobuf.md).
