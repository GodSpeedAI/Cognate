# reference — pinned reference boot and mock plumbing

## Overview
Everything needed to run the pinned CopilotKit reference without a paid model endpoint, plus the harness that drives it. `harness.mjs` boots the reference against a fixture-backed mock, drives a named journey headlessly, captures screenshots and a model-request sidecar, and tears down only what it spawned. The reference source itself is never edited.

## Interface
- `REF`, `EXAMPLE`, `NEXT` — the pinned reference checkout, the selected LangGraph-JS example, and its Next binary `[harness.mjs:REF]`
- `FIXTURES`, `PORTS` — the fixture directories the mock loads and the ui/agent/mock/injector ports `[harness.mjs:FIXTURES]`, `[harness.mjs:PORTS]`
- `boot`, `down`, `status`, `run`, `heal`, `shots` — the harness subcommands, dispatched on `argv[0]` `[harness.mjs:cmd]`
- `aimock-server.mjs` — programmatic LLMock server that loads fixture directories and starts it `[aimock-server.mjs:llmock]`
- `mock-context-injector.mjs` — transparent proxy that adds the aimock fixture-column header and archives raw request bodies `[mock-context-injector.mjs:RAWDIR]`
- `run-reference-mock.sh` — shell driver with `cold-install`, `preflight`, `mock`, `start`, `probe`, `stop` modes `[run-reference-mock.sh:case]`

## Invariants
- The reference application is never modified; the fixture-selecting header is added by a proxy instead `[mock-context-injector.mjs:1]`
- `aimock-server.mjs` strips trailing `App Context:` developer/system messages for matching only, so recorded fixtures replay in order `[aimock-server.mjs:requestTransform]`
- Streaming chunk size is raised to 9999 because llmock's default slices by UTF-16 code units and splits surrogate pairs `[aimock-server.mjs:llmock]`
- The mock server exits with a usage error when no fixture directory is supplied `[aimock-server.mjs:fixtureDirs]`
- The injector exits with code 2 when listen port, mock port or context is missing `[mock-context-injector.mjs:1]`
- The injector writes an unpadded sequence-numbered raw archive per request, and reports misses as a separate outcome `[mock-context-injector.mjs:RAWDIR]`
- The shell driver refuses to proceed when `node`, `npm`, `curl` or `pnpm` is missing, when the reference checkout is absent, or when the mock binaries are not executable `[run-reference-mock.sh:need]`
- The shell driver asserts the aimock CLI exposes `--config` before using it, so a wrong CLI aborts early `[run-reference-mock.sh:step0_preflight]`
- The shell driver pins provenance from `reference-manifest.json` and explicitly notes the extracted tree has no `.git` `[run-reference-mock.sh:step0_preflight]`
- Mock probes run with `OPENAI_API_KEY` unset, so a paid key cannot leak into a capture `[run-reference-mock.sh:probe_mock]`
- Teardown kills only recorded process groups, never by pattern matching, so the harness cannot kill itself `[harness.mjs:down]`

## Side Effects
- Writes a pid file, a request sidecar at `logs/requests.jsonl` and raw request archives under `logs/raw/` `[harness.mjs:REQUESTS]`, `[harness.mjs:RAWDIR]`
- Writes screenshots into `reference/screenshots/` `[harness.mjs:SHOTS]`
- Binds ui 3000, agent 8123, mock 4012, injector 13361 `[harness.mjs:PORTS]`
- The shell driver writes state and log files under `/tmp/ck-ref-mock` `[run-reference-mock.sh:STATE]`
- The shell driver starts and stops `llmock` and `next dev --turbopack` processes `[run-reference-mock.sh:start_mock]`, `[run-reference-mock.sh:stop_all]`

## Verification
- Run: `bun validation/reconstructions/copilot/reference/harness.mjs status`
- Run: `bash validation/reconstructions/copilot/reference/run-reference-mock.sh preflight`
