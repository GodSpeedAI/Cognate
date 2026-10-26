# External reconnaissance (read-only), as of 2026-10-15

All checks were read-only. No repo was modified and nothing was installed globally.

## 1. skills.sh listing and install behavior

- **Cognate skill is listed.** `https://www.skills.sh/godspeedai/cognate/building-with-cognate@2026-10-15` returned 200, title "building-with-cognate — godspeedai/cognate".
  - Command: `ctx_execute` fetch of that URL.
- **Repo page 404s.** `https://www.skills.sh/godspeedai/cognate@2026-10-15` returned 404. Mixed-case `https://skills.sh/GodSpeedAI/Cognate` redirects to the lowercase path and also 404s. Only the per-skill page exists.
- **URL pattern.** Lowercase `owner/repo`, then skill name: `https://skills.sh/<owner>/<repo>/<skill>`. Examples from the leaderboard at `https://www.skills.sh/@2026-10-15`: `/vercel-labs/skills/find-skills`, `/mattpocock/skills/tdd`, `/anthropics/skills/frontend-design`. Agent pages use `/agent/<name>`.
  - Placeholder to use: `https://skills.sh/godspeedai/cognate/building-with-cognate`.
- **`npx skills add <owner>/<repo>` without a skills.sh listing.** The vercel-labs/skills README at `https://raw.githubusercontent.com/vercel-labs/skills/main/README.md@2026-10-15` documents GitHub shorthand (`npx skills add acme/private-skills`, line 66), full URLs, and any git URL (lines 37-73). The README says to "Discover skills at skills.sh" (line 277), which is discovery, not a prerequisite. My inference: the install path does not need a skills.sh listing. I did not run the install command, so this is documented behavior, not a test.

## 2. DomainForge CLI distribution

| Channel | Finding | Source |
|---|---|---|
| crates.io `domainforge` | Does not exist (404). | `https://crates.io/api/v1/crates/domainforge@2026-10-15` |
| crates.io `domainforge-core` | 0.21.1, features include `cli`. | `https://crates.io/api/v1/crates/domainforge-core@2026-10-15` |
| Cargo bin | `[[bin]] name="domainforge" required-features=["cli"]` in `domainforge-core/Cargo.toml`. | `https://raw.githubusercontent.com/GodSpeedAI/DomainForge/main/domainforge-core/Cargo.toml@2026-10-15` |
| PyPI `domainforge` 0.21.1 | Wheel (cp312 manylinux x86_64) contains only dist-info METADATA and WHEEL, no `entry_points.txt`, so no `domainforge` console script. Python library only. | `https://pypi.org/pypi/domainforge/json@2026-10-15`; wheel inspected in a scratch dir with `python3 -I` |
| npm `@godspeedai/domainforge` 0.21.1 | No `bin` field. `main: index.js`, description "TypeScript bindings for the SEA DSL". Library, not CLI. | `https://registry.npmjs.org/@godspeedai%2fdomainforge@2026-10-15` |
| GitHub releases | v0.21.1 (2026-10-15) has 0 assets. No prebuilt binaries. | `https://api.github.com/repos/GodSpeedAI/DomainForge/releases/tags/v0.21.1@2026-10-15` |

- **Simplest route (from README, line 156):** `cargo install domainforge-core --features cli`, then `domainforge --version`. This needs a Rust toolchain, but it pulls from crates.io and does not require cloning the repo. I read the Cargo.toml; I did not run the install.
- **README is misleading.** It also says `npm install -g @godspeedai/domainforge`, but that package has no bin, so it will not provide a `domainforge` command.
- **Missing:** prebuilt release binaries on GitHub, a `bin` in the npm package, a Python console script, and a crates.io `domainforge` crate name.

## 3. Agent-Native (framework)

Identified as **Agent-Native by Builder.io**. Repo: `https://github.com/BuilderIO/agent-native` (from `https://www.agent-native.com/about@2026-10-15`). npm: `@agent-native/core`.

Public claims:
- Shared actions: one action serves UI, agent, HTTP, MCP, A2A, and CLI.
- Agent runtime: chat, tools, skills, memory, jobs, observability, and handoffs.
- Agent-modifiable apps: an agent with granted workspace access and write tooling can modify the app's own source.
- Backend-agnostic, Drizzle SQL, Nitro host, MIT license.

Key quotes:
- "Agent-Native is an open-source framework for building applications where AI agents and user interfaces share the same actions, data, and application state." (`https://www.agent-native.com/about@2026-10-15`)
- "A single action can power a UI control, an agent tool, an HTTP endpoint, an MCP or A2A capability, a CLI command, and an auditable workflow." (same URL)
- "Don't pick between apps or agents. Agent-Native apps are both." (`https://cdn.jsdelivr.net/npm/@agent-native/core@0.124.6/README.md@2026-10-15`)

Implication: "agents act on the same actions and state as the UI" and "agent-modifiable app source" are claimed by Agent-Native. Cognate should not claim these as unique. Its differentiator needs to be narrower (for example, the semantic/DSL layer from DomainForge).

## 4. npm versions and timestamps

Command: `npm view @godspeedai/cognate-cli time --json | tail -n 6`
- 0.2.0: 2026-10-11T21:43:36.768Z
- 0.3.0: 2026-10-12T19:57:06.759Z
- 0.4.0: 2026-10-15T00:02:55.123Z
- 0.5.0: 2026-10-15T13:34:38.751Z

Command: `npm view @godspeedai/cognate-store-sqlite version`
- Output: `0.5.0`
- Dist-tag `latest` is also 0.5.0 (`npm view @godspeedai/cognate-store-sqlite dist-tags --json`).
- Command: `npm view @godspeedai/cognate-store-sqlite time --json | tail -n 4`
  - 0.4.0: 2026-10-15T00:26:44.903Z
  - 0.5.0: 2026-10-15T13:46:33.304Z (publish time of latest)

npm printed "Unknown user config trust-policy-exclude" on every call. This is a local npm config warning and was not investigated.

## Orchestrator correction (2026-10-15)
Item 1 is wrong about the listing: `https://www.skills.sh/godspeedai/cognate/building-with-cognate` returns HTTP 200 but its body is a soft 404 ("building-with-cognate isn't available in this repository"), fetched via ctx_fetch_and_index @2026-10-15. The skill is NOT listed on skills.sh. The URL pattern `skills.sh/<owner>/<repo>/<skill>` (lowercase) is used for the placeholder link.
