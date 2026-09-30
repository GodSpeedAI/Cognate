# Session log — 2026-09-28 (tooling failure that stopped reference execution)

## What was attempted

Execute the pinned reference application against CopilotKit's own mock LLM, capture
Phase 6 screenshots at fixed viewports, and convert the `DOCUMENTED_REFERENCE`
behavior-matrix rows to `BLACK_BOX_REFERENCE`.

## What blocked it

The agent's command-execution tool stopped accepting arguments partway through the
session. It resolves the entire command string as a single executable name:

| Invocation | Result |
|---|---|
| `pwd`, `ls`, `env`, `date`, `grep`, `head`, `sleep` | run (bare executable, no arguments) |
| `echo hello`, `ls .tmp/ref`, `/bin/sh -c "pwd"`, `/bin/echo hello` | `ENOENT: ... posix_spawn '<entire string>'` |

The failure is in the tool's spawn layer, not in the repository, the shell, or the
path environment: `pwd` returned the correct working directory, `env` showed a normal
`PATH` containing `/bin`, and `date` returned the correct time. Nothing in the
environment was wrong; only argument-bearing invocation was unreachable.

Consequence: no dependency install, no `llmock` launch, no test run, no Playwright,
no screenshot, and no `just verify` were possible. Only file reads and file writes
remained available.

## What was deliberately not done

No execution-dependent claim was made or recorded. The reference application stays
`NOT_YET_EXECUTED`. The mock's proven behavior remains scoped to *standalone
verification from earlier in the session* — server `/v1/models`, one non-streaming
completion, one streaming completion, all with no API key — and was not re-proven
here.

## What was produced instead

`reference/run-reference-mock.sh` — a staged boot script encoding every step needed
to close this, with a preflight gate as step `[0]` that aborts before any mock
invocation if the pinned checkout, `llmock`, or the `aimock --config` contract is
missing. Its status is **`AUTHORED_NOT_EXECUTED`**, recorded as such in
`reference-manifest.json` under `mockLlm.bootScriptStatus`.

## How to resume

1. Confirm a working command layer: `bash -c 'echo ok'` must print `ok`.
2. `./reference/run-reference-mock.sh preflight` — expect `PREFLIGHT_OK`.
3. `./reference/run-reference-mock.sh cold-install` — expect `MOCK_READY` and three
   probe responses; this is the first real proof of the mock path end to end.
4. `./reference/run-reference-mock.sh start` — expect `APP_READY`.
5. Drive the UI under Playwright at the fixed viewports the prompt names; capture
   `reference/*/screenshots/`.
6. `./reference/run-reference-mock.sh stop` afterwards.

If a step's expected token does not appear, record the actual output and stop rather
than inferring success from the absence of an error.
