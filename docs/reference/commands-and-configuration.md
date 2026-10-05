# Reference: commands, configuration, and environment

Everything invocable in this repository. Commands are listed with what they actually run; the
authoritative definitions are `justfile` and `package.json`.

## `just` recipes

Run `just --list` for prerequisites.

| Recipe | Command | What it does |
|---|---|---|
| `just setup` | `bun --version`, `just --version` | print tool versions |
| `just status` | `tail -n 1 .agents/CURRENT_STATUS.yaml` | the latest status snapshot |
| `just check` | `bun run check` | substrate check: ledger version, spec digests, evidence and proof paths, status agreement |
| `just typecheck` | `bun run typecheck` | `tsc -p tsconfig.json` over packages, profiles, tests, scripts |
| `just test` | `bun run test` | every workspace test, including RED contracts for unimplemented requirements |
| `just verify` | `check` + `typecheck` + `bun test ./tests/proof-routing.test.ts` + `bun scripts/gate.ts --implemented` | the regression baseline |
| `just gate <ID>` | `bun scripts/gate.ts <ID>` | one requirement's proof gate; an unmet gate exits 1 |
| `just gates` | `bun scripts/gate.ts --all` | every gate with PASS/FAIL and status drift; non-zero while any is unmet |
| `just setup-realitytrace` | `cargo install realitytrace --version 0.3.0 --locked --root .tmp/realitytrace` | install the pinned RealityTrace CLI used by `AK-006` and `CG-RT-002` |

`just verify` proves the checked-in substrate, not a deployable build. `just build` and
`just dev` from the root are not recipes; `bun dev` runs `cognate dev` **inside a generated app**.

## `package.json` scripts

| Script | Command | Notes |
|---|---|---|
| `check` | `bun scripts/check-substrate.ts` | |
| `test` | `bun test ./compatibility/phase0/sqlite.test.ts ./tests ./packages ./profiles` | |
| `verify` | `bun run check && bun run test` | |
| `typecheck` | `tsc -p tsconfig.json` | |
| `test:properties` | `bun test ./tests/properties` | fast-check invariants |
| `test:e2e` | `cd tests/e2e && bun x playwright test -c playwright.config.ts` | the §36 journey |
| `example:<name>` | `bun examples/<name>/index.ts` | 15 examples: `copilot`, `autonomous-harness`, `human-approval`, `generative-ui`, `shared-state`, `artifact-workbench`, `multi-agent`, `cognitive-memory`, `rvf-branching`, `capability-hot-swap`, `domainforge`, `realitytrace`, `ag-ui`, `mcp`, `connect` |

## `cognate` CLI

`packages/cli/src/bin.ts`.

```text
cognate create <dir> --profile copilot|harness --source <path> [--with a,b]
cognate dev [--port N]
```

### `cognate create`

| Flag | Required | Default | Meaning |
|---|---|---|---|
| `<dir>` | yes | — | target directory (created if absent) |
| `--profile` | yes | — | `copilot` or `harness`; anything else exits 1 |
| `--source` | yes | — | path to a Cognate checkout; exits 1 without it (DEBT-016) |
| `--with` | no | — | comma-separated extras; unsupported ones are reported, never imported |

Output: `unsupported: <name> (<reason>)` lines, then
`created <dir> (vendored <n> package(s))`.

Behavior: copies `templates/starter/common` then `templates/starter/<profile>`; computes the
transitive `@cognate/*` closure from the profile roots
(`@cognate/cli`, `@cognate/profile-<profile>`, `@cognate/domainforge`, `@cognate/provider-local`);
`bun pm pack`s each into `.cognate/vendor/`; rewrites `package.json` so each closure member is a
`file:./.cognate/vendor/<tarball>` dependency **and** an `overrides` entry.

Known unsupported `--with` name: `sona`, with the reason from
[ADR-0005](../decisions/ADR-0005-adaptive-ranking-sona.md).

### `cognate dev`

| Flag | Required | Default | Meaning |
|---|---|---|---|
| `--port` | no | `3000` | the port the outer `Bun.serve` binds |

Requires `cognate.config.ts` in the current directory:

```ts
export default { profile: "copilot" | "harness", instructions?: string };
```

Routes:

| Route | Copilot | Harness |
|---|---|---|
| `GET /health` | `{ ok, semantic: { objects, digest }, agents, components }` | same |
| `/cognate.v1.RuntimeService/*` | proxied to the internal Connect server | same |
| `POST /agui` | the AG-UI handler (SSE) | — |
| `GET /` | the Astryx chat shell (HTML) | the health JSON |
| `GET /app.js` | the `Bun.build` browser bundle | — |
| `GET /astryx.css`, `/theme.css` | Astryx stylesheets | — |
| anything else | `404 not found` | `404 not found` |

State lives at `.cognate/app.sqlite`; the generated browser entry at `.cognate/entry.tsx`.

Dev authentication: `Authorization: Bearer <tenant>:<principalId>` via
`devTokenAuthenticator`. **Dev only** — it is not an authenticator.

## Environment variables

| Variable | Used by | Meaning |
|---|---|---|
| `COGNATE_LEDGER` | `scripts/gate.ts` | alternate ledger path (default `requirements/ledger.yaml`) |
| `SXR_BIN` | RealityTrace tests and `examples/realitytrace` | path to the RealityTrace binary; the pinned default is `.tmp/realitytrace/…` |
| `COGNATE_E2E_DB` | `tests/e2e/{global-setup,verify}.ts` | the SQLite file the E2E app writes and the verifier reads |
| `COGNATE_E2E_DIR` | `tests/e2e/global-setup.ts` | the app directory the E2E server runs in |
| `COGNATE_E2E_PORT` | `tests/e2e` | base URL port (default `43917`) |
| `COGNATE_EXAMPLE_CI` | set by `tests/examples.test.ts` for `bun run example:<name>` | marks a non-interactive example run; no example currently branches on it |
| `COGNATE_TEST_SECRET` | `tests/integration/secrets.test.ts` | a value that must never appear in an event, artifact, or index |

## Runtime configuration

`createRuntime(options)` — the composition surface.

| Option | Type | Default | Notes |
|---|---|---|---|
| `store` | `string \| { store: DurableStore }` | — | a path, `":memory:"`, or a store you own (then you close it) |
| `policy` | `Policy` | — | kernel invocation policy; `denyAll` if you omit it in spirit, but pass it explicitly |
| `actions` | `ActionPolicy` | — | service-level allow/deny over run/continuation/state actions |
| `agents` | `readonly AgentDefinition[]` | — | registered by `id` |
| `components` | `readonly Component[]` | `[]` | mounted in the root scope; activation failures do not stop startup |
| `cognition` | `CognitionOptions` | — | `{ index, embedder, extract?, persistent }`; `persistent: false` triggers a clear + rebuild at startup |
| `projections` | `{ projection, public }[]` | `[]` | `public` projections are readable via `readProjection` and must key `<tenant>/<key>` |
| `outboxFor` | `(event: PendingEvent) => OutboxIntent[]` | `() => []` | extra intents committed atomically with each run event; `eventId` is pre-assigned |
| `tickMs` | `number` | `10` | the background loop interval |
| `system` | `Principal` | `{ id: "system", kind: "system" }` | the kernel's principal |

## Tooling versions

| Tool | Version | Where |
|---|---|---|
| Bun | `1.4.0` (`packageManager`) | runtime, test runner, bundler, SQLite |
| TypeScript | `7.0.2` | devDependency |
| React / React DOM | `19.3.0` | peer dependency of `react`, `ui-astryx`, both profiles |
| fast-check | `4.10.2` | `tests/properties` |
| Playwright | `1.63.0` | `tests/e2e` |
| happy-dom | `20.14.5` | DOM in component tests |

Upstream engine pins (exact): `cordis@4.0.0-rc.10`, `@godspeedai/domainforge@0.18.2`,
`@ruvector/core@0.1.32`, `@ruvector/rvf@0.3.4`, `@ag-ui/*@1.0.0`, `@connectrpc/*@2.2.0`,
`@bufbuild/protobuf@2.15.0`, `@modelcontextprotocol/sdk@1.30.1`, `@a2a-js/sdk@1.2.1`,
`@astryxdesign/*@0.6.3`, `zod@3.25.76`.

## Source trail

- `justfile`, `package.json` — the authoritative command definitions.
- `packages/cli/src/bin.ts`, `packages/cli/src/index.ts` — the CLI.
- `packages/runtime-bun/src/index.ts` — `RuntimeOptions`.
- `packages/protocol-connect-bun/src/index.ts` — dev auth and the transport.
- `tests/e2e/global-setup.ts`, `verify.ts`, `playwright.config.ts` — the E2E variables.
- `scripts/gate.ts` — `COGNATE_LEDGER`.
- [how-to/verify-a-change.md](../how-to/verify-a-change.md) — how to use these.

## Related

- [verification.md](verification.md) — the ledger and evidence model.
- [events-and-stores.md](events-and-stores.md) — the data the runtime writes.
- [../getting-started.md](../getting-started.md) — the short path.
