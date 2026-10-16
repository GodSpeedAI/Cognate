# Tutorial: start an application from a checkout

Generate a real Cognate app with the CLI, run it, and see the same durable runtime you built by
hand in the previous tutorial — with UI, Connect, and AG-UI attached.

**Prerequisites.** Bun 1.4.x and a clone of this repository. The SDK packages are on npm, but
`create` still needs a checkout for `--source` ([DEBT-016](../../.agents/DEBT.md)), so every command below uses a local checkout.

**Time.** About ten minutes, most of it `bun install`.

## 1. Generate an app

```bash
cd /path/to/cognate
bun cognate/packages/cli/src/bin.ts create my-app --profile copilot --source .
```

`--source .` is required and is not a workaround: the CLI packs the `@godspeedai/*` packages your
profile needs out of the checkout and vendors them into `my-app/.cognate/vendor/`, pinning each
as a `file:` dependency with a matching `overrides` entry.

Expected output ends with something like:

```text
created /path/to/my-app (vendored 12 package(s))
```

The generated layout:

```text
my-app/
├── domain/example.sea          # your semantic model
├── src/
│   ├── agents/                 # AgentDefinition.run(input, ctx)
│   ├── capabilities/           # components that provide capabilities
│   ├── components/             # composition
│   ├── projections/            # derived read models
│   └── ui/                     # client components
├── test/app.test.ts
├── cognate.config.ts
└── package.json
```

## 2. Install

```bash
cd my-app
bun install
```

Because every vendored package is pinned by `file:` + `overrides`, the `workspace:*` specifiers
inside the packed tarballs resolve to the vendored copies rather than failing.

## 3. Run the development server

```bash
bun dev
```

Expected:

```text
listening on http://127.0.0.1:3000
```

Check that the semantic model actually loaded:

```bash
curl -s http://127.0.0.1:3000/health | jq
```

```json
{
  "ok": true,
  "semantic": { "objects": 4, "digest": "sha256:…" },
  "agents": ["agent.copilot"],
  "components": ["…"]
}
```

`objects: 4` is what the starter's `domain/example.sea` actually yields: two `Entity` declarations, one
`Resource`, and one `Flow`.

`digest` is a combined hash over the per-file source digests of `domain/*.sea`. Change
`example.sea` and restart: the digest changes. That is how you know the semantics your runtime
saw are pinned to specific source.

## 4. Use it

Open <http://127.0.0.1:3000/> in a browser. The page is an Astryx shell with a chat panel wired to
`agent.copilot`. Type a message and press Enter.

Behind that page:

- the browser bundle (`/app.js`) was built by `cognate dev` with `Bun.build`;
- it creates a `createClient` over a Connect transport with a dev token;
- the panel calls `client.startRun`; the model's text streams back as `message.delta` events;
- tools, approval cards, artifacts, and generative UI are the same run, projected differently.

`curl` the service directly if you want to see the wire:

```bash
curl -s -X POST http://127.0.0.1:3000/cognate.v1.RuntimeService/StartRun \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer tenant-a:alice' \
  -d '{"agent":"agent.copilot","input":{"message":"hello"},"idempotencyKey":"k1"}' | jq
```

The `authorization` header is how the caller is established. It is never read from the body.

## 5. Prove the state is durable

```bash
ls -la .cognate/app.sqlite
sqlite3 .cognate/app.sqlite \
  "SELECT event_type FROM events WHERE stream_id LIKE 'run-%' ORDER BY position;" 2>/dev/null \
  || bun -e 'const {Database}=require("bun:sqlite");const db=new Database(".cognate/app.sqlite",{readonly:true});
     for (const r of db.query("SELECT event_type FROM events WHERE run_id IS NOT NULL ORDER BY position").all()) console.log(r.event_type);'
```

Stop the server with Ctrl-C, start it again, and the run is still there. Everything the UI showed
was a fold over these events.

## 6. The harness profile

```bash
cd /path/to/cognate
bun cognate/packages/cli/src/bin.ts create my-harness --profile harness --source .
cd my-harness && bun install && bun dev
```

The harness serves the same `/health` and the same Connect service, but `/` returns the health
JSON rather than a chat UI — there is no browser surface in that profile. Use it to drive
`Harness.send(sessionId, message)`, `Harness.schedule(...)`, dynamic tools, and subagents. See
[subsystems/application-composition](../subsystems/application-composition.md) for what it
composes.

## 7. Make it yours

Three edits, in the order that pays off:

1. `domain/example.sea` — add an `Entity` and a `Flow`. Restart and check `/health` for a new
   object count and digest. This is the semantic layer; nothing framework-specific belongs here
   (spec §3.1).
2. `src/agents/` — write an `AgentDefinition` and register it. The agent's id becomes a capability
   id (`agent.<name>`), which is how the UI and the protocols address it.
3. `src/capabilities/` — add a component that `provides` a capability your agent `invoke`s, and
   mount it via the profile registry.

## Troubleshooting this tutorial

| Symptom | Cause | Fix |
|---|---|---|
| `cognate create: --source is required` | you omitted `--source` | pass the Cognate checkout path |
| `cannot find source package "…" under --source` | `--source` is not a full checkout | point it at the repository root |
| the browser shows "not found" for `/` | you are on the harness profile | use `--profile copilot` |
| `/health` reports 0 objects | `domain/` is empty or has no `.sea` files | add a file; the loader only reads `*.sea` |
| `bun install` fails on a vendored package | a stale `.cognate/vendor` | delete `.cognate/vendor` and re-run `create` |
| Connect returns `unauthenticated` | the `Bearer` token is missing or malformed | `Bearer <tenant>:<user>` (dev only) |

## Next

- [how-to: add a capability](../how-to/add-a-capability.md) — the main extension move.
- [reference: commands and configuration](../reference/commands-and-configuration.md) — every
  flag, route, and environment variable.
- [troubleshooting](../troubleshooting.md).

## Source trail

- `packages/cli/src/bin.ts`, `packages/cli/src/index.ts` — `create` and `dev`.
- `packages/cli/templates/starter/` — the generated tree.
- `tests/integration/cli-create.test.ts` — generate → install → test → dev → restart, both
  profiles.
- `profiles/copilot/src/index.tsx` — what the copilot profile composes.
- `.agents/evidence/m9-profiles.md` — the recorded proof.
