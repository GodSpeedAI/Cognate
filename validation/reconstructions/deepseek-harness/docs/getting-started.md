# Getting started

## Requirements

| Need | Why | Verified with |
|---|---|---|
| `bun` 1.4.0 | the app, the tests, the fixtures, and the harness all run under Bun | this run: `bun 1.4.0` |
| A browser | the UI is a bundled React app | any Chromium-based browser |
| `git` | the fixture workspace git-inits itself; two architectural criteria diff against `main` | `fixtures/workspace/make-workspace.ts` |
| A model endpoint | `agent.coding` calls `model.generate` | a real provider, or the repository's mock (below) |

The app's dependencies are already installed in `cognate/node_modules`. If they are not, `bun install`
from the repository root restores them.

## Run it

### With the deterministic mock (no API key needed)

```bash
cd validation/reconstructions/deepseek-harness

# terminal 1 — the model provider
bun fixtures/mock-model/server.ts

# terminal 2 — a workspace for the agent to work in
bun fixtures/workspace/make-workspace.ts /tmp/cg-ws

# terminal 3 — the app
cd cognate
PORT=3180 COGNATE_HARNESS_HOME=/tmp/cg-home bun run dev
```

Open <http://127.0.0.1:3180/>. The server prints three lines worth reading:

```
[domain] loaded 51 semantic objects (digest sha256:43e412c9…) from …/cognate/.sea/interaction/interaction-model.sea
[deepseek-harness] listening on http://127.0.0.1:3180 (home: /tmp/cg-home)
[deepseek-harness] dev auth: Authorization: Bearer local:operator
```

Then follow [tutorials/first-session.md](tutorials/first-session.md), which walks the whole thing:
dismissing the first-run dialogs, configuring the model at `http://127.0.0.1:4010/v1`, choosing the
workspace, running a turn that really edits a file, restarting the server, and hitting an approval
gate.

### With a real provider

In Settings → Models → **+ Add model provider** → **Custom model API**, enter a provider id, a base
URL ending in `/v1` for an OpenAI-compatible endpoint, the protocol, your API key, and a model id. The
key is written to a `0600` file and is never shown again.

**Display name is required**, and **only the first Models row is actually used** — the backend holds
one live provider configuration. See [reference/configuration.md](reference/configuration.md#configuration-that-looks-like-configuration-but-is-not).

## Verify it

```bash
cd cognate
bun run typecheck     # this app's own tsconfig project
bun test test         # 21 journey/integration tests
```

Last recorded result for `bun test test`: **21 tests across 11 files, 21 pass, 0 fail, 123
`expect()` calls, ~26s.** Each test boots a real server on port 0 with a temp home and its own mock
model process, so the suite takes about half a minute and needs no network.

Check the running app's health:

```bash
curl -s http://127.0.0.1:3180/health
# {"ok":true,"semantic":{"objects":51,"digest":"sha256:43e412c9…"}}
```

## The other things you can run

| Command | What it is | Needs the pinned reference? |
|---|---|---|
| `cd tests && bun run journeys:cognate` | the Playwright journeys against this app | no |
| `cd tests && bun run journeys` | the same journeys against both systems | yes |
| `bun test tests/architecture` | nine criteria proving the app is independent of the reference | mostly no |
| `cd tests && bun run visual/compare.ts` | screenshot triptychs — evidence, not a gate | yes, to diff |

→ [operations/testing.md](operations/testing.md) for what each suite proves, and
[how-to/run-parity-capture.md](how-to/run-parity-capture.md) for the capture workflow.

## Where your data lives

Everything durable is under `COGNATE_HARNESS_HOME`:

```
$COGNATE_HARNESS_HOME/
  app.sqlite          the event log, runs, continuations, and projection state
  app.sqlite-wal      (SQLite write-ahead log)
  secrets.json        credentials, mode 0600
```

Unset, it is `cognate/.data` — git-ignored. **Changing it is a fresh install**: the first-run dialogs
reappear, no workspace is selected, and no model is configured. Use it to get a clean slate, and
understand that a "clean slate" is a new directory rather than a command.

## The two environment variables that matter

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `3180` | the port the server binds (loopback only) |
| `COGNATE_HARNESS_HOME` | `cognate/.data` | the data directory |

Plus one that only affects retries: `MODEL_RETRY_BACKOFF_MS` (default 300) sets the pause between
`model.generate` attempts. It never changes the retry count, which is always 5.
→ [reference/configuration.md](reference/configuration.md).

## What to read next

| If you want | Read |
|---|---|
| to actually use it | [tutorials/first-session.md](tutorials/first-session.md) |
| to understand it | [concepts/mental-model.md](concepts/mental-model.md), then [architecture.md](architecture.md) |
| the vocabulary | [concepts/glossary.md](concepts/glossary.md) |
| to change it | [how-to/add-a-capability.md](how-to/add-a-capability.md) |
| why it is built this way | [explanation/](explanation/) |
| exact contracts | [reference/](reference/) |
| to debug it | [operations/troubleshooting.md](operations/troubleshooting.md) |

## Conventions to know before you edit

- **Bun and TypeScript.** Runtime packages, Bun built-ins, ESM with explicit `.ts` extensions on
  relative imports.
- **Comments carry the reasoning.** The source comments explain *why* a choice was made and cite the
  evidence. When you change a decision, update the comment that records it — several of them are the
  only place a rationale survives.
- **Derived state, not stored state.** If a feature's state can be derived from the event log, derive
  it. That is the architectural invariant, and violating it is how the durability tests fail.
- **No I/O in `src/domain/` or `src/projections/`.** They are pure, which is what makes them
  replay-safe.
- **The `.sea` model is an input.** Parsed at boot; its digest is logged. Editing it changes the boot
  output and `/health`.
- **The visual system is independent.** `cognate/DESIGN.md` plus the `:root` tokens in
  `cognate/src/ui/app.css`. Pixel parity with the reference was retired on 2026-09-27; do not treat
  the diffs as a target.

## Related

- [README.md](README.md) — the documentation home
- [tutorials/first-session.md](tutorials/first-session.md) — the guided walkthrough
- [operations/testing.md](operations/testing.md) — the suites
- [reference/configuration.md](reference/configuration.md) — the full configuration surface
- [architecture.md](architecture.md) — where everything lives
