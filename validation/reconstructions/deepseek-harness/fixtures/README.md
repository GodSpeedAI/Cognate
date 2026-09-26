# T1 fixtures — mock model + workspace

Deterministic fixtures shared by the reference (DeepSeek Harness) and the
Cognate reconstruction.

## Run

```sh
bun run mock-model/server.ts                     # port 4010 (default)
MOCK_MODEL_PORT=4099 MOCK_CHUNK_DELAY_MS=5 bun run mock-model/server.ts
bun test .                                        # unit tests
bun workspace/make-workspace.ts /tmp/my-fixture   # fresh workspace, deterministic SHA
```

`POST /__reset` clears the `retry` scenario's in-memory state.

## Scenarios

Pick with a `[[scenario:<name>]]` marker in the last user message. Step = count of trailing `tool`-role messages.

| scenario | flow |
|---|---|
| `plain` | streamed markdown reply (heading, list, code block) |
| `read` | `read(README.md)` -> summary |
| `edit` | `read` -> `edit` ("Hello"->"Howdy") -> summary |
| `shell` | `bash(git status --short)` -> `bash(ls)` -> summary |
| `multi` | read -> bash -> edit -> summary (Journey C) |
| `approval` | `run_code` w/ `sandbox_permissions`/`justification` -> reflects tool result |
| `plan` | `todo_write` -> `exit_plan_mode` -> reflects approval/feedback |
| `delegate` | `subagent(prompt has "[[scenario:child]]")` -> answer; child resolves via `child` |
| `error` | HTTP 500, OpenAI-style error JSON |
| `interrupt` | a few chunks, then 1/2s for up to 60s (stream-only) |
| `retry` | first request per history hash fails 500, later ones succeed |

Tool names/args (`read`, `edit`, `bash`, `todo_write`, `exit_plan_mode`,
`run_code`, `subagent`) match the reference's `docs/tool-catalog.md`.

## Pointing a system at the server

Base URL `http://127.0.0.1:4010/v1` — the reference's `openai-completions` protocol appends `/chat/completions` to `baseUrl` (its OpenAI SDK client). DeepSeek Harness: Settings -> Models -> Custom model API -> `OpenAI Chat Completions`. Cognate reconstruction: point its provider config at the same base URL/protocol.
