# DeepSeek Harness — runtime launch & deterministic provider notes

Pinned commit `477b4f420553e8a52c2fbccc464d7561b239c443` (`@deepseek-ai/dsh-root` 0.1.7-rc.2), captured 2026-09-26.

## 1. Launch recipe (verified working end-to-end)

```sh
cd /home/sprime01/projects/cognate/.tmp/ref/deepseek-harness
pnpm install --frozen-lockfile      # ~2m47s
pnpm run build                      # native addon + host/client libs + web frontend
DSH_HOME=/home/sprime01/projects/cognate/.tmp/ref/dsh-home \
  pnpm dsh web --no-open --port 3080
```

`pnpm dsh web` = `node --import tsx/esm apps/cli/src/bin.ts web` (see root `package.json` `"dsh"` script). `--no-open` suppresses the OS browser launch; `--port` overrides the default `3080`.

On start it prints exactly one line to stdout:

```
dsh web: http://127.0.0.1:3080/?token=<random>
```

Visiting that URL establishes a session (cookie-backed); a bare request to `/` without the token (or without the cookie from a prior visit) returns 68 bytes of plain text: `dsh web authentication required; reopen the URL printed by dsh web.` A stateless `fetch`/`curl` won't authenticate a later plain request unless it preserves the cookie; a real browser navigating to the token URL works and lands on the clean root URL. Verified with a Playwright headless Chromium screenshot (title "DSH Local Build") saved to `reference/screenshots/00-smoke.png`.

Two child node processes are spawned (pnpm wrapper + actual server); both must be killed to fully stop it (`kill <wrapper_pid> <child_pid>`, then `-9` if needed).

## 2. Host isolation

- `DSH_HOME` env var fully relocates state — nothing was written to the real `$HOME` in this run.
- Contents written under `$DSH_HOME`: `.anonymous-user-id`, `.credentials.yaml`, `storages/workspace.json`, `profiles/web/{cordis.yml,cordis.patch.yml,package.json,pnpm-workspace.yaml}`.
- Profile name defaults to `web` for `dsh web` launches, so the live, hand-editable config file is `$DSH_HOME/profiles/web/cordis.patch.yml`. The adapters re-read this file per-request — no restart needed after an edit.
- Settings UI's "Open configuration file" button opens this same file (only works when browser and server share a machine).

## 3. Gotchas hit during setup

- **`nub` pnpm shim**: `~/.nub/shims/pnpm` refuses to run when invoked from a cwd containing a `bun.lock` (e.g. the cognate repo root). It works fine when run from inside the deepseek-harness clone (its own `pnpm-lock.yaml`, no bun lockfile). `npx -y pnpm@11.7.0` is a working fallback from any cwd.
- **`corepack`** on this host resolves to a Windows path (`/mnt/c/.../corepack`) with CRLF line endings — `bad interpreter` error. Not needed; ignore it.
- **Playwright**: the repo pins `playwright@1.61.1` (and an alpha `1.63.0`) but only inside the pnpm virtual store (`node_modules/.pnpm/playwright@1.61.1/node_modules/playwright`), not hoisted to root `node_modules` — a plain `import 'playwright'` fails from a script outside that resolution scope; import via the full store path instead. Also, `playwright@1.61.1`'s expected bundled Chromium revision (`chromium_headless_shell-1228`) is not the one cached on this host (`chromium-1243`); launch with an explicit `executablePath` pointing at `~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome` and `args: ['--no-sandbox']`.

## 4. Deterministic / mock model server (already exists in the repo — no need to build one from scratch)

`packages/test-support/llm-mock-server` (`@deepseek-ai/dsh-llm-mock-server`), run via `pnpm run mock:llm` (root script: `node --import tsx packages/test-support/llm-mock-server/src/bin.ts`).

- **Protocol**: an **Anthropic Messages-compatible** HTTP/SSE endpoint — the repo's README calls it "a scriptable Messages-compatible HTTP/SSE endpoint". It serves under a `/v1` root; the DeepSeek adapter (and any client) hits `POST /v1/messages`. This maps directly onto the `anthropic-messages` protocol option in the Web UI's Settings → Models → Custom model API picker (the other two options are `openai-completions` and `openai-responses`, stored verbatim under those ids in `cordis.patch.yml`).
- **Scenario selection**: NOT by keyword in the last user message. It is scripted by CLI flags: `--sequence <behavior1,behavior2,...>` consumes one scripted behavior per accepted request (in order); `--repeat-last` repeats the final entry once the list is exhausted (otherwise an exhausted script returns a structured 500 `script_exhausted`). `--sequence random` draws from a weighted table (`--random-weights 'success=60,slow_success=10,connection_reset=5,stream_disconnect=5,partial_disconnect=10,empty=5,server_error=5'`, `--seed <n>` for reproducibility — omitting `--seed` auto-generates and prints one in the `ready` record).
- Known behaviors: `success`, `slow_success`, `connection_reset`, `stream_disconnect`, `partial_disconnect`, `empty`, `server_error`, `script_exhausted` (auto), plus rate-limit/429/5xx and malformed-JSON variants mentioned in the default stress profile. `connection_refused` is deliberately excluded (a bound handler can't produce a true refusal).
- Auth: `--api-key <key>` sets the key the mock expects; point the adapter at it with `DEEPSEEK_API_KEY=<key>` / `DEEPSEEK_BASE_URL=http://127.0.0.1:<port>/v1`.
- Output: JSONL to stdout — a `ready` record (carries the `/v1` base URL and random seed), then one request/result record per call naming both the scripted and concrete behavior. No installable binary; run from source only (`startMockLlmServer` is also importable directly for in-process test use, returning captured requests for assertions).
- **Recommendation for our deterministic scenario server**: implement the **Anthropic Messages wire protocol** (`POST /v1/messages`, SSE with `content_block_start`/`content_block_delta`/`content_block_stop`/`message_delta`/`message_stop` events, `tool_use` content blocks for tool calls) since (a) it's the protocol the reference's own mock server already speaks, (b) it's one of the three first-class protocols the Web UI's Custom Model API supports natively (`anthropic-messages`), and (c) it avoids pi-ai's OpenAI-shape quirks (`developer` role, `max_completion_tokens` field mapping) documented as sources of gateway incompatibility. For scenario selection keyed off the conversation, extend the existing script/sequence model rather than reinvent it: match the last user message against a keyword→behavior/fixture table, falling back to the CLI `--sequence` script for anything unmatched.

## 5. Custom provider configuration (Web UI)

Settings → Models → switch a provider card to **Custom model API**. Fields: lowercase Provider ID (permanent — used in saved sessions/credentials; rename = add new + delete old), display name, base URL, **API protocol** (`OpenAI Chat Completions` / `OpenAI Responses` / `Anthropic Messages`, i.e. `openai-completions`/`openai-responses`/`anthropic-messages` in YAML), API key, and ≥1 model (id, display name, context window, max output tokens, input types). All of this is persisted to `$DSH_HOME/profiles/<profile>/cordis.patch.yml`; advanced fields (reasoning-effort levels, request-compatibility switches like `supportsDeveloperRole`/`maxTokensField`/`thinkingFormat`, headers, timeouts, retries) are YAML-only, documented per-field in the generated `docs/config-catalog.md` under `PiAiCompatProfile`.

## 6. Built-in tool inventory (from `docs/tool-catalog.md`, the generated/authoritative catalog; also cross-checked against per-package READMEs)

| Tool(s) | Package | Arguments (key fields) | Approval / guard behavior |
|---|---|---|---|
| `read`, `read_image` | `dsh-tool-fs` | `file_path`, `offset?`, `limit?` (read); `file_path` (read_image) | Read-only, no approval needed |
| `write`, `edit` | `dsh-tool-fs` | `write`: `file_path`, `content`; `edit`: `file_path`, `old_string`, `new_string`, `replace_all?` | Guarded by an "observation policy": overwriting an existing file with `write`, or any `edit`, requires a prior `read` of the *unchanged* file version (stale/unread → structured `fs_not_observed`/`fs_stale_version` error, not a user prompt); pure file creation via `write` has no such gate |
| `str_replace_editor` (view/create/str_replace/insert/undo_edit-style commands) | `dsh-tool-str-replace-editor` | command + path + command-specific fields | Same read-before-mutation family as fs; can itself serve as the "observation" step |
| `bash` (+ `run_in_background`, `job_output`, `job_kill`) | `dsh-tool-bash` | `command`, `workdir?`, `run_in_background?`, plus job-control args | Runs under a file/network sandbox; a denied operation returns `[sandbox: file access denied under <mode> mode]` (do-not-retry policy denial). Escalating to wider `sandbox_permissions` requires a `justification` string **and explicit user approval** (the `ask` `PreToolDecision` kind — approval service must return `allowed-once`, otherwise denied) |
| `pwsh`, persistent variants | `dsh-tool-pwsh(-persistent)`, `dsh-tool-bash-persistent` | similar to bash | Same sandbox/approval model |
| `todo_write` | `dsh-tool-todo` | `todos: [{content, status: pending\|in_progress\|completed}]` (full-list replace) | No approval; session-owned state only |
| `update_goal`, `get_goal` | `dsh-tool-goal` | goal text / round-tracking fields (`max_goal_rounds` config) | No approval; planning aid |
| `exit_plan_mode` | `dsh-plan-mode` | plan text | Only callable while in plan mode; **requires explicit user approval** (approve, or reject with feedback to keep planning) before the agent may leave plan mode |
| `ask_user_question` | `dsh-tool-ask-user` | question/options fields | Inherently a user-interaction tool (blocks for a reply, not a destructive-action approval) |
| subagent start/delegate (+ `list_subagent_models`) | `dsh-tool-subagent`, `dsh-tool-subagent-control` | `provider?`, `model?`, `reasoning_effort?` (only when `modelSelectionSettings: true`); messaging/interrupt/list tools for continuable children | Model/route selection is preflight-validated by the live LLM adapter; ACP/Codex/Claude Code backends reject `modelSelectionSettings` rather than ignore it. Delegated work defaults to background/continuable execution |
| `fs_search` (grep/glob-style) | `dsh-tool-fs-search` | pattern/path args | Read-only |
| `terminal` | `dsh-tool-terminal` | — | interactive terminal surface |
| `lsp` | `dsh-tool-lsp` | — | language-server queries |
| `web` (fetch/search) | `dsh-tool-web` | url/query | network egress, may be sandbox-gated |
| `present` | `dsh-tool-present` | deliverable payload | surfaces a deliverable to the user |
| `workflow`/`ralph` | `dsh-tool-workflow`, `dsh-tool-ralph` | workflow-specific | orchestration helpers |

General approval architecture (`packages/core/tools`, docs on the `tools/pre-execute` waterfall): every tool call passes through a `PreToolDecision` of `allow` / `deny` / `cancel` / `ask`. `ask` only proceeds if an approval service returns `allowed-once`; otherwise it is denied. This is the single mechanism behind both the bash sandbox-escalation prompt and the plan-mode exit gate — there is no separate global "approval allowlist" file found under `packages/core/tools` (searched for `requiresApproval`/`approvalMode` literals — no hits; the mechanism is the typed waterfall above, configured per-tool/per-policy plugin, not a flat config key).

## 7. Reasoning / streaming format notes

Not directly inspected in the mock server's wire bytes this session (time-boxed), but per `docs/user/guide/providers.md` "Request compatibility" section: reasoning-capable models route through `pi-ai`, whose behavior varies by detected endpoint shape — e.g. `thinkingFormat: deepseek` compat switch exists specifically for DeepSeek's reasoning-content shape, and a model's system prompt is sent as `role: "developer"` for OpenAI-shaped reasoning models (many gateways reject this) with output cap sent as `max_completion_tokens`. This confirms a `reasoning_content`/thinking-format concept exists in the adapter layer but the exact per-protocol JSON field names weren't captured — recommend a follow-up read of `packages/llm/llm-pi-ai/README.md` and `packages/llm/llm-deepseek/README.md` before implementing the scenario server's reasoning-block emission.
