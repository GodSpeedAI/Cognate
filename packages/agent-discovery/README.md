# @godspeedai/cognate-agent-discovery

Read-only, evidence-based inspection of supported agent CLIs. Discovers executable paths, configuration roots, skills, extensions and hook definitions without launching executables or executing hooks. Separates executable presence, configuration, effective runtime integration, authentication and demonstrated capability.

Call `discoverAgents({home, projectRoot, path})` in the relevant execution world (local, WSL, SSH). Results reflect **that world only**. The registry is extensible and independently modeled using skills.sh's MIT-licensed agent discovery approach as design inspiration.

Static declarative hook sources are inspected for Claude, Codex and Gemini; Cline script hooks are inventoried inertly. OpenCode and Pi have dynamic extensions, so absence of static hooks is explicitly unresolved. No credentials, file contents, or executable command output are returned.

Conformance: `bun test packages/agent-discovery/test`.

License: Apache-2.0.
