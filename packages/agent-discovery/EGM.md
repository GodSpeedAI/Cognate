# agent-discovery

## Overview

Read-only inventory of installed agent CLIs, their configuration roots, skills, extensions, hooks, and MCP server definitions, with explicit provenance and an `unverified` list for anything presence cannot prove `[src/index.ts:inspectAgent]`. Hook discovery reuses the shared hook IR rather than a private parser. It depends on `@godspeedai/cognate-hook-interoperability` for hook IR mapping and parsing `[package.json:dependencies]`, and ships a `cognate-agents` bin entry pointing at `./src/bin.ts` `[package.json:bin]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — registry, inspection, MCP definition parsing, and the allowlisted version probe `[src/index.ts:discoverAgents]`
- test/ — `discovery.test.ts` (not a child contract)
- No child `EGM.md` exists under this package.

## Global Invariants

- Hooks discovered with any unresolved item are reported as `discovery: "partial"`, never `complete` `[src/index.ts:discoverHooks]`
- Only allowlisted two-token version commands are executable; everything else is refused as evidence `[src/probes.ts:probeAllowed]`
- Executables run with `shell: false`, so no shell expansion happens during a version probe `[src/probes.ts:runProbe]`
- Agent status is derived from the pair (executable present, config present) into exactly four values `[src/index.ts:inspectAgent]`
- MCP servers are recorded as inspectable evidence only (`discoverMcpServers` parses configuration text) and are never dialed `[src/mcp.ts:discoverMcpServers]`
- Every environment carries the sentence that version, session, authentication, active plugins, and capability are not inferred from presence `[src/index.ts:inspectAgent]`

## Global Side Effects

- Filesystem reads only: `access`, `readdir`, `readFile`, `stat` under the supplied home and project roots `[src/index.ts:listNames]`
- Subprocess execution limited to allowlisted `--version` probes with a default 5000 ms timeout `[src/probes.ts:probeVersion]`
- The bin writes a JSON report to stdout `[src/bin.ts:discoverAgents]`

## Verification

- Run: `cd packages/agent-discovery && bun test`
