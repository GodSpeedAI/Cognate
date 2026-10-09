# @godspeedai/cognate-mcp

Expose your Cognate application's capabilities as tools for AI assistants, over the Model
Context Protocol (MCP). Each capability becomes an MCP tool whose calls run through the
runtime's normal authorization path, so an assistant can do exactly what its authenticated
caller is allowed to do — and nothing more.

**When to use this package:** you run a Cognate runtime and want MCP clients (IDEs, agent
hosts, custom assistants) to invoke its capabilities safely. Authorization is per connection:
every tool call is invoked as the caller you bind to the server.

## Installation

```sh
bun add @godspeedai/cognate-mcp
```

Requires [Bun](https://bun.sh) >= 1.4.0. Built on the external
[`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
(pinned at `1.30.1`, installed automatically), which speaks the Model Context Protocol.
A [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun)
runtime provides the capabilities being exposed. The SDK ships Bun-native TypeScript source,
so add `@types/bun` and `@types/node` as dev dependencies when typechecking your project.

## Quick start

```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";
import { createMcpServer } from "@godspeedai/cognate-mcp";

const runtime = await createRuntime({
  store: "./app.sqlite",
  // ... agents, components (the capability implementations), policy
});

const server = createMcpServer({
  service: runtime.service,
  // Every tool call on this connection is authorized as this caller:
  caller: { actor: { id: "alice", kind: "agent" }, tenant: "tenant-a" },
  tools: [
    {
      capability: "billing.quote",            // the runtime capability to expose
      description: "Quote a refund total",
      inputSchema: {
        type: "object",
        properties: { amount: { type: "number" } },
        required: ["amount"],
      },
      // name: "billing_quote" is the default: the capability id with dots replaced
    },
  ],
});

// Connect to any MCP transport — stdio as here, in-memory, or your own.
await server.connect(new StdioServerTransport());
```

An MCP client listing tools sees one tool per binding with its JSON Schema; calling it
invokes the capability through `RuntimeService.invoke` as the bound caller, so kernel policy,
tenancy, and audit apply unchanged. A denied or failed invocation returns an MCP tool error
(`isError: true`) carrying the service error code and message — never a partial result.

## Behavior details

- **Tool names** default to the capability id with `.` → `_` (`billing.quote` becomes
  `billing_quote`); override with the binding's `name`.
- **Input schemas** are translated from JSON Schema to the validator form the MCP SDK
  requires: `string`, `number`, `integer`, `boolean`, `array`, and nested `object` are
  mapped; anything unrecognized falls back to a permissive validator rather than rejecting
  the binding.
- **Results** are returned as a JSON string in a single text content block.
- The returned object is the standard MCP SDK server, so everything the SDK documents about
  transports and clients applies.

## Limitations

- One caller per server: create one `createMcpServer` per authenticated caller (per MCP
  connection), not one shared across users.
- Only JSON-Schema subsets that translate cleanly are validated strictly; exotic schema
  keywords are treated as permissive.
- The adapter exposes capabilities; it does not create them. Define components and policy in
  the runtime first.

## Related packages

- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) —
  the reference runtime whose `RuntimeService` this adapter exposes.
- [`@godspeedai/cognate-runtime-api`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-api) —
  the `RuntimeService`, `Caller`, and `ServiceError` types used here.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella;
  the easiest way to get a runtime to expose.
- [`@godspeedai/cognate-cli`](https://www.npmjs.com/package/@godspeedai/cognate-cli) — the
  `cognate` command-line tooling for running and inspecting apps.

## License

Apache-2.0
