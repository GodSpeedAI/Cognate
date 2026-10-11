# @godspeedai/cognate-agent-discovery

Read-only, evidence-based inspection of supported agent CLIs. Discovers executable paths, configuration roots, skills, extensions, MCP server definitions and hook definitions without launching executables or executing hooks. Separates executable presence, configuration, effective runtime integration, authentication and demonstrated capability.

Call `discoverAgents({home, projectRoot, path})` in the relevant execution world (local, WSL, SSH). Results reflect **that world only**. The registry is extensible and independently modeled using skills.sh's MIT-licensed agent discovery approach as design inspiration.

Static declarative hook sources are inspected for Claude (user, project, local, managed settings, and plugin-cache hooks) and Codex/Gemini declarative settings; Cline script hooks are inventoried inertly. OpenCode and Pi have dynamic extensions, so absence of static hooks is explicitly unresolved. MCP definitions are parsed from each CLI's documented configuration files (Claude `.claude.json`/`.mcp.json`/plugin caches, Codex `config.toml`, Gemini settings, OpenCode config, Cline global settings) and recorded as inert evidence.

`probeVersion(harness, executablePath)` is the only executable probe: it runs a per-harness allowlisted `--version` (no shell, no other arguments ever) and reports the first output line as evidence. Probe failure is recorded as evidence, never an error and never a downgrade of the passive result. No credentials, file contents, or arbitrary command output are returned.

Conformance: `bun test packages/agent-discovery/test`.

License: Apache-2.0.
