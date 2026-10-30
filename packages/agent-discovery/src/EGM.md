# agent-discovery source

## Overview
Passive inspection of local agent CLI configuration, skills, extensions, hooks, and MCP server definitions (package description; [package.json:description]). Discovery is inert by construction: `index.ts` states that no subprocesses, shell evaluation, plugin imports, network requests, credential reads, or hook execution occur [src/index.ts:1]. `bin.ts` is the `cognate-agents` entry that prints the inventory as JSON [package.json:bin].

## Interface
- `AGENT_REGISTRY` — static per-harness command, config, skill, and extension roots [src/index.ts:AGENT_REGISTRY]
- `inspectAgent(def, options)` — returns one `AgentEnvironment` [src/index.ts:inspectAgent]
- `discoverAgents(options, registry?)` — inspects every registry entry, including undetected ones [src/index.ts:discoverAgents]
- `AgentDefinition`, `AgentEnvironment`, `DiscoveryOptions`, `discoverHooks` [src/index.ts:AgentEnvironment]
- `discoverMcpServers(id, home, project?)`, `parseCodexMcpTables(toml, sourcePath)`, `McpServerDefinition`, `McpInspection` [src/mcp.ts:discoverMcpServers]
- `probeVersion(harness, executablePath, timeoutMs?)`, `probeAllowed(command)`, `VersionProbe` [src/probes.ts:probeVersion]

## Invariants
- Status is derived only from presence: `executable_and_configured`, `executable_present`, `configured`, or `not_detected` [src/index.ts:inspectAgent]
- Presence never implies version, session, authentication, active plugins, or capability; those stay in `unverified` [src/index.ts:inspectAgent]
- Only exact, well-known configuration files are read; unknown layouts produce an unresolved note instead of a guess [src/mcp.ts:1]
- An MCP `command` argv is recorded as evidence and never executed [src/mcp.ts:McpServerDefinition]
- Hooks come back with `discovery: "partial"` whenever the resolver recorded unresolved items [src/index.ts:discoverHooks]
- `probeAllowed` accepts only a two-element command whose second element is an allowlisted `--version` argument [src/probes.ts:probeAllowed]
- A failed, timed-out, or unrecognizably-worded probe returns evidence text, never a guessed version [src/probes.ts:probeVersion]

## Side Effects
- Reads the filesystem under `home` and the project root via `node:fs/promises` [src/index.ts:inspectAgent]
- Builds candidate paths from `PATH` and, when configured, from `extraSkillRoots` [src/index.ts:DiscoveryOptions]
- Opt-in `execFile` probes with `shell: false` and a timeout, one allowlisted argument vector per harness [src/probes.ts:runProbe]
- Writes the JSON inventory to stdout as the `cognate-agents` CLI [src/bin.ts:1]

## Verification
- Run: `cd packages/agent-discovery && bun test`
