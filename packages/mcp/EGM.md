# mcp — runtime capabilities as MCP tools

## Overview

`package.json` declares `@godspeedai/cognate-mcp`, the MCP adapter that exposes runtime capabilities as MCP tools through the runtime's own authorization path. The `exports` map has a single entry, `.`, resolving to `./src/index.ts`. Source lives entirely in `src/`, which is the only published directory.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — `createMcpServer`, the JSON-Schema-to-zod bridge, and the tool binding types

## Global Invariants

- The package depends on `@godspeedai/cognate-runtime-api` for `RuntimeService` and `@modelcontextprotocol/sdk` for the transport, so no MCP type reaches a framework contract `[packages/mcp/package.json:dependencies]`
- `@godspeedai/cognate-runtime-bun` is a dev-only dependency, so the shipped adapter never owns a runtime `[packages/mcp/package.json:devDependencies]`
- `zod` is pinned exactly at `3.25.76`, matching the SDK's expected validator version `[packages/mcp/package.json:dependencies]`

## Global Side Effects

- None at package load; tool invocation effects belong to the injected runtime service `[packages/mcp/package.json:exports]`

## Verification

- Run: `cd packages/mcp && bun test`
