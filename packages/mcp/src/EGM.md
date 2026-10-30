# mcp / src — MCP tool adapter

## Overview

Exposes runtime capabilities as MCP tools, authorized per authenticated caller `[index.ts:createMcpServer]`. Because the MCP SDK's `registerTool` accepts only a raw zod shape, bindings that advertise plain JSON Schema are translated into zod before registration `[index.ts:jsonSchemaToZod]`. The module's only export is `createMcpServer` plus the `McpAdapterOptions` and `McpToolBinding` types `[index.ts:McpAdapterOptions]`.

## Interface

- `createMcpServer` — builds an SDK `McpServer` whose tools call `RuntimeService.invoke` `[index.ts:createMcpServer]`
- `McpToolBinding` — capability id, optional tool name, description, and JSON Schema input `[index.ts:McpToolBinding]`
- `McpAdapterOptions` — service, caller, tools, and optional server name/version `[index.ts:McpAdapterOptions]`
- `jsonSchemaToZod` — internal schema translator covering string, number, integer, boolean, array, object `[index.ts:jsonSchemaToZod]`
- `objectShape` — internal builder applying `required` as optionality `[index.ts:objectShape]`

## Invariants

- Every tool call is invoked as the single configured caller, never a per-request identity `[index.ts:McpAdapterOptions]`
- A binding without a name derives the tool name by replacing `.` with `_` in the capability id `[index.ts:createMcpServer]`
- Unsupported schema shapes fall back to `z.unknown()` instead of rejecting the binding `[index.ts:jsonSchemaToZod]`
- A `ServiceError` from invocation returns `isError: true` with `${code}: ${message}` and never partial success `[index.ts:createMcpServer]`
- Any other thrown error is rethrown rather than converted to a tool error `[index.ts:createMcpServer]`
- Server defaults are name `cognate` and version `0.0.0` `[index.ts:createMcpServer]`

## Side Effects

- Tool invocation performs runtime capability calls through the injected `RuntimeService` `[index.ts:createMcpServer]`
- JSON serialization of each successful output into a text content block `[index.ts:createMcpServer]`

## Verification

- Run: `cd packages/mcp && bun test`
