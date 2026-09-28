# Configuration reference

Everything that can be changed without editing code.

## Environment variables

| Variable | Read by | Default | Effect |
|---|---|---|---|
| `PORT` | `cognate/src/server.ts` (`import.meta.main`) | `3180` | The port `Bun.serve` binds. Tests pass `0` directly to `startServer` instead, which is not this variable. |
| `COGNATE_HARNESS_HOME` | same | `<cognate>/.data` | The data directory. Everything durable lives under it: `app.sqlite` (+ `-wal`/`-shm`) and `secrets.json`. **Changing it is a fresh install** — the first-run dialogs reappear, no workspace is selected, no model is configured. |
| `MODEL_RETRY_BACKOFF_MS` | `cognate/src/agents/agentCoding.ts` (`retryBackoffMs`) | `300` | Milliseconds of backoff between `model.generate` attempts. Must be a finite number ≥ 0 or the default is used. Affects only pacing, never the retry count (always 5). The test suite sets 10–150 per test. |
| `MOCK_MODEL_PORT` | `fixtures/mock-model/server.ts` | `4010` | Port for the mock model server. |
| `MOCK_CHUNK_DELAY_MS` | same | `40` | Delay between streamed chunks. Set to 0 for the fastest possible streaming. |

`PORT` and `COGNATE_HARNESS_HOME` are read **only** in the `import.meta.main` block, so importing
`startServer` (as every test does) is unaffected by them. `MODEL_RETRY_BACKOFF_MS` is read per backoff
step, so it can be changed at runtime — which is what the tests do.

## Package scripts — `cognate/package.json`

| Script | Command | Notes |
|---|---|---|
| `dev` | `PORT=3180 bun src/server.ts` | The normal way to run it. |
| `start` | `bun src/server.ts` | Same, without the port default. |
| `test` | `bun test test` | The 21 journey/integration tests. |
| `typecheck` | `tsc -p tsconfig.json` | This app's own tsconfig; it extends the repository root's. |

`cognate/tsconfig.json` is a separate project so the app's strictness is enforced against the app
alone.

## HTTP surface — `cognate/src/server.ts`

| Route | Method | Response |
|---|---|---|
| `/health` | GET | `{"ok":true,"semantic":{"objects":<n>,"digest":"sha256:…"}}` |
| `/cognate.v1.RuntimeService/*` | POST | Connect RPC. Exact-path matched against a map built at boot. |
| `/app.js` | GET | The browser bundle, built by `Bun.build` at boot. |
| `/app.css` | GET | `cognate/src/ui/app.css`, read at boot. |
| `/astryx.css` | GET | `stylesheetPaths()[0]` from `@cognate/ui-astryx/styles`. |
| `/theme.css` | GET | `stylesheetPaths()[1]`. |
| `/` | GET | The inline HTML shell. |
| anything else | any | `404 not found` |

The server binds `127.0.0.1` only, with `idleTimeout: 0`.

## Generated and ignored paths

| Path | What | Git |
|---|---|---|
| `cognate/.generated/entry.tsx` | The browser entry point, **rewritten on every boot** from a template. Its content is deterministic for a given tenant/actor. | ignored |
| `cognate/.data/` | The default `COGNATE_HARNESS_HOME` | ignored |
| `*.sqlite`, `*.sqlite-journal` | Store files | ignored |
| `secrets.json` | Credentials, mode 0600 | ignored |

`cognate/cognate.config.ts` declares `{profile: "harness", instructions: "…"}`. **It is not consumed**
— `src/server.ts` composes its own runtime. The file is kept for shape parity with the
`cognate create --profile harness` starter and as a documented place for app metadata.

## Fixed identifiers

| Identifier | Value | Where | Why it is fixed |
|---|---|---|---|
| `LOCAL_OPERATOR` | `{tenant: "local", actor: {id: "operator", kind: "user"}}` | `server.ts:41` | The single-operator assumption. The browser bundle embeds this tenant and actor id. |
| `SYSTEM_CALLER` | `{tenant: "local", actor: {id: "system", kind: "system"}}` | `server.ts:42` | Starts `agent.config` runs and child subagent runs. |
| Namespace | `deepseek-harness.interaction` | `domain/index.ts` | The IDM's own namespace. |
| `AGENT_CODING` | `"agent.coding"` | `agentCoding.ts:25` | Used by the UI, the child-run spawn, and the projection filters. |
| `AGENT_CONFIG` | `"agent.config"` | `agentConfig.ts:16` | The durable-record emitter for operator actions. |
| Correlation prefixes | `session:`, `subagent:` | projections and agent | Routing. `sessions.ts` filters on the first; `subagents.ts` parses the second. |
| `maxJsonDepth` | `32` | `server.ts:240` | Connect request parsing. |

## Limits and budgets

| Limit | Value | Where | Consequence when hit |
|---|---|---|---|
| Tool steps per turn | 20 | `agentCoding.ts:36` | The turn ends with `"Reached the tool-call step limit for this turn."` |
| Model retries per call | 5 (6 attempts) | `agentCoding.ts:42` | `turn.failed`, run ends `failed`. |
| Subprocess timeout | 30,000 ms | `tools.ts:14` | The process is killed; `timedOut: true` in the result. |
| Subprocess output cap | 20,000 chars per stream | `tools.ts:13` | Truncated with a `…(truncated)` marker. |
| Provider mount timeout | 5,000 ms | `providerRegistry.ts:44` | `swap` gives up; the run fails on its next model call. |
| Connect JSON depth | 32 | `server.ts:240` | Deep payloads rejected. |
| Session title | 80 chars | `sessions.ts:15` | Truncated with `…`. |
| Subagent `desc` | 40 chars | `subagents.ts:36` | Truncated for the tree row. |
| Plan heading fallback | 80 chars | `planGate.ts:31` | Used only when the plan has no markdown heading. |

The app never sets an idempotency-key retention window, so that lifetime is whatever the runtime
default is — not something this repository controls or documents.

## Configuration that looks like configuration but is not

| Thing | Reality |
|---|---|
| The composer's access-mode dropdown | Present and inert. `approvalGate`'s `mode` defaults to `"read-only"`. |
| The composer's model dropdown | Present and inert; there is one live provider. |
| The Settings "API protocol" select | Offers three labels, but the backend always receives the literal `"openai-compatible"`. |
| The Models sub-list | Supports several rows; only the first is wired to `model.configure`'s single `model` field. |
| "Fetch available models" | Present, disabled; no provider-introspection capability exists. |
| "Delete" on a provider | Present, disabled; no unconfigure capability exists. |
| The composer's stats footer | Always renders zeros. No turn/step/token/context accounting is implemented. |

Each of these is catalogued in [deviations.md](deviations.md).

## Environment for the validation harness

| Suite | Needs |
|---|---|
| `cd cognate && bun test test` | nothing but `bun` |
| `cd tests && bun run journeys:cognate` | `bun`, Playwright, this app; **no reference** |
| `cd tests && bun run journeys` | the above, plus the pinned reference checkout and its `pnpm install` |
| `cd tests && bun run capture/…` | the mock model on 4010, Playwright; the reference side also needs the reference running |
| `bun test tests/architecture` | `git` (criteria 1 and 4 diff against `main`); a git repo with a `main` branch |
| `tests/architecture/no-copied-source.test.ts` | the reference checkout present, or it skips |
| `bash tests/architecture/reference-removed.sh` | minutes: it reinstalls and rebuilds the workspace |

`SYSTEM=reference|cognate` selects the driver for the journey suite; any other value throws.

## Related

- [capabilities.md](capabilities.md) — the contract set
- [events.md](events.md) — what gets recorded
- [tools.md](tools.md) — the agent's tool surface
- [../operations/troubleshooting.md](../operations/troubleshooting.md) — symptoms and causes
- [../how-to/run-parity-capture.md](../how-to/run-parity-capture.md) — capture prerequisites
