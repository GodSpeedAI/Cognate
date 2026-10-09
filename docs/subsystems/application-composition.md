# Subsystem: application composition — profiles, the CLI, and the starter

## Purpose

Let someone assemble a working application from the pieces without learning the kernel, and
generate a project that already works.

## Responsibilities

- `defineProfile` / `resolveProfile`: a named, ordered, validated selection of registered
  components, with nothing silently dropped.
- The two reference profiles, which demonstrate that a user-facing copilot and an autonomous agent
  harness are compositions of the same substrate.
- The `cognate` CLI: `create` (generate and vendor a starter) and `dev` (compose and serve).
- `templates/starter`, the small tree a new application starts from.

## Non-responsibilities

- A profile introduces **no kernel concept**. `CG-PRF-001`'s acceptance is that composition does
  not require a new primitive; the conformance of the kernel is unaffected by which profile is
  loaded.
- The CLI is not a build system. Packages ship TypeScript source executed directly by Bun; there
  is no compile step, and the only bundling is the browser entry `cognate dev` produces.
- `defineProfile` does not wire components to a runtime. It selects and validates names;
  `resolveProfile` maps them onto a caller-supplied registry.

## Position in the system

`@godspeedai/cognate-profile` depends on `kernel-api` for types only. `profiles/copilot` and
`profiles/harness` each depend on `runtime-bun`, `runtime-api`, `capabilities`, `kernel-api`,
`events`, `profile`, and a provider; copilot additionally depends on the whole presentation and
wire stack. `@godspeedai/cognate-cli` depends on both profiles, `domainforge`, `protocol-connect(+bun)`,
`client`, `react`, `ui-astryx`, and `provider-local`.

This is the top of the graph: nothing depends on `cli` or on a profile except `cli` itself and the
generated application.

## Core abstractions

- **`ProfileDefinition`** — `{ name, description, components, options }`, deep-frozen by
  `defineProfile`, which rejects an empty name, an empty component name, and duplicates.
- **`ComponentEntry<T>`** — `{ name, package, supported, reason?, contribute(options) }`.
  `supported: false` records a component whose compatibility gate failed, with the reason.
- **`ResolvedProfile<T>`** — `{ profile, contributions, unresolved }`. An unknown name resolves
  with reason `"unknown component"`; an unsupported entry resolves with its own reason; only
  supported entries have `contribute` called. **Every requested-but-missing component appears in
  `unresolved`** — that is the anti-silent-drop rule.
- **`CopilotApp`** — `{ runtime, agUi, close }`; `createCopilotApp(CopilotAppOptions)`.
- **`Harness`** — `{ runtime, storage, mount, send, session, schedule, close }`;
  `createHarness(HarnessOptions)`.
- **`CognateConfig`** — `{ profile: "copilot" | "harness", instructions? }`, the generated app's
  `cognate.config.ts`.

### Copilot internals worth knowing

`BackendTool` is `{ contract, description, inputSchema, handler, requiresApproval?, statePatch? }`.
`requiresApproval` pauses the run on a `human_approval` continuation before invoking — approval is
a flag on a tool, not a separate feature. `statePatch` emits RFC 6902 ops as `state.changed`.
`frontendTools` are offered to the model as tools and are served by the connected client through
`frontend_capability` continuations.

The agent loop is: model → tool calls → backend tools (optionally approved) or frontend tools →
model, streaming `message.delta`, publishing `state.changed`, and emitting `ui.render
{ component, props }` for generative UI.

### Harness internals worth knowing

`HarnessOptions.caller` (default `LOCAL_OPERATOR`) is the identity handlers see for
`send`/`session`/`schedule`. `storage.kv` keys are partitioned by `HandlerContext.tenant`, so the
caller's tenant — not a hardcoded one — scopes stored data. `subagent.start` derives its tenant
from the handler context rather than caller input. `sessions` group runs by correlation id
`session:<id>`, which is what `listRuns({ correlationId })` reads. The `sandbox` component scrubs
the environment and enforces a timeout and an output cap. `Harness.session(sessionId)` returns runs
oldest-first with status and output.

## Internal operation

`cognate create <dir> --profile copilot|harness --source <path> [--with a,b]`:

1. copy `templates/starter/common` then `templates/starter/<profile>` over the target;
2. index every `@godspeedai/*` package under `--source` by reading its `package.json` name;
3. walk `dependencies` breadth-first from the profile's root packages to compute the transitive
   closure (roots: `@godspeedai/cognate-cli`, `@godspeedai/cognate-profile-<profile>`, `@godspeedai/domainforge`,
   `@godspeedai/cognate-provider-local`);
4. `bun pm pack` each package into `.cognate/vendor/`;
5. rewrite the generated `package.json`: every closure member becomes a `file:` dependency **and**
   an `overrides` entry, so `workspace:*` inside the packed tarballs resolves outside the workspace;
6. report `--with` names it cannot wire as `unsupported: <name> (<reason>)`, and never import them.

Packing exists because nothing is published to a registry (DEBT-016). A `cognate create` without
`--source` exits 1.

`cognate dev [--port N]` (default 3000) does the composition described in
[startup-and-the-background-loop](../workflows/startup-and-the-background-loop.md), then serves:

| Route | Copilot | Harness |
|---|---|---|
| `GET /health` | `{ ok, semantic: { objects, digest }, agents, components }` | same |
| `/cognate.v1.RuntimeService/*` | proxied to the internal Connect server | same |
| `POST /agui` | the AG-UI handler | — |
| `GET /` | the Astryx chat shell | the health JSON |
| `GET /app.js`, `/astryx.css`, `/theme.css` | the bundled entry and stylesheets | — |

Dev authentication is `Bearer <tenant>:<principalId>` via `devTokenAuthenticator`, and the file
says so at the call site. It is not a production authenticator.

## State

`cognate create` writes a directory (starter tree, vendored tarballs, a rewritten
`package.json`). `cognate dev` writes `.cognate/app.sqlite`, `.cognate/entry.tsx` (the generated
browser entry, copilot only), and `node_modules` under the app. Neither command writes into the
Cognate checkout.

## Lifecycle

```text
cognate create ──► my-app/{domain,src,test,cognate.config.ts,package.json,.cognate/vendor/*}
my-app$ bun install
my-app$ bun dev ──► /health · Connect · /agui · /
```

`cognate dev` prints `listening on http://127.0.0.1:<port>` once bound. `DevServer.stop()` stops
both servers and closes the profile app.

## Failure modes

| Symptom | Cause | Recovery |
|---|---|---|
| `cognate create: --source is required` | packages are not published | pass a local checkout (DEBT-016) |
| `cannot find source package "X" under --source` | the checkout does not contain a package the closure needs | check `--source` points at a full Cognate checkout |
| `bun pm pack failed in <dir>` | the package manifest is unreadable or the directory is not a package | run it manually to see the error |
| `unsupported: sona (SONA was rejected…)` | a `--with` name with a known reason | informational; SONA stays rejected (ADR-0005) |
| `no cognate.config.ts in <dir>` | run `dev` outside an app | `cd` into the app |
| `failed to parse domain/<file>` | invalid `.sea` | the typed `SemanticError` is printed; fix the file |
| `failed to bundle the UI` | a browser-side import failed | the `Bun.build` logs are printed |
| harness `/` shows JSON | expected — harness has no UI profile | use `/health` |
| state lost between restarts | the app used `:memory:` | `cognate dev` uses `.cognate/app.sqlite`; check the path |

## Extension points

- **A new profile** — `defineProfile` + a `ComponentEntry[]` registry + a `create*` function that
  composes `runtime-bun`. Copy the shape of either reference profile.
- **A new component in a profile** — add a `ComponentEntry` and mount its component. Dynamic
  components (tools, skills, providers) are added at runtime with `harness.mount`, and disposing
  them deactivates dependents.
- **A new starter** — extend `templates/starter`, keeping it small: it is the first thing a user
  reads and edits.
- **A new `--with` extra** — add a `ComponentEntry`; unsupported names must keep reporting their
  reason rather than being dropped.

Not extension points: `templates/starter`'s internal layout beyond what `create` copies, the
vendoring mechanism (it exists because of DEBT-016), or the dev token format.

## Source trail

- `packages/profile/src/index.ts` — `defineProfile`, `ComponentEntry`, `resolveProfile`.
- `profiles/copilot/src/index.tsx` — `createCopilotApp`, `BackendTool`, `COPILOT_AGENT`,
  `copilotRegistry`, `GenerativeSurface`.
- `profiles/harness/src/index.ts` — `createHarness`, `Harness`, `HarnessOptions`, `LOOP_AGENT`,
  `harnessRegistry`, `toolComponent`, `providerComponent`, `spawnSubagent`.
- `packages/cli/src/bin.ts` — the two commands and their flags.
- `packages/cli/src/index.ts` — `create`, `dev`, `BROWSER_ENTRY`, `KNOWN_UNSUPPORTED`,
  `PROFILE_ROOTS`, `transitiveClosure`.
- `packages/cli/AGENTS.md` — the vendoring rule the implementation must keep.
- `templates/starter/` — the generated layout.
- `tests/integration/cli-create.test.ts` — generate → install → test → dev → restart, both profiles.
- [../extensions.md](../extensions.md) — providers, adapters, and profiles in one page.

## Related

- [../workflows/startup-and-the-background-loop.md](../workflows/startup-and-the-background-loop.md).
- [../how-to/start-an-app.md](../tutorials/start-an-app-from-a-checkout.md) — the guided path.
- [../reference/commands-and-configuration.md](../reference/commands-and-configuration.md) — every
  flag, route, and env var.
