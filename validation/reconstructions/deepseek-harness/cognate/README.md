# DeepSeek Harness reconstruction — Cognate app (tranche T5, UI fidelity pass T5b)

A Cognate app that reconstructs the DeepSeek Harness Web UI's "first use" surface: configure a
model, choose a workspace, run a session, watch it stream. Model: `.sea/interaction/`. Method:
`.agents/skills/building-with-cognate/SKILL.md`.

## Run it

```bash
# from the repo root, after `bun install`
cd validation/reconstructions/deepseek-harness/cognate
bun run dev            # http://127.0.0.1:3180, data in ./.data (git-ignored)
bun test test          # this app's journey tests
bun run typecheck      # this app's own tsconfig (extends the repo root's)
```

`COGNATE_HARNESS_HOME` overrides the data directory (tests use isolated temp dirs); `PORT`
overrides the port. On start, the server prints a dev `Authorization: Bearer <tenant>:<actor>`
token — the same dev-token handoff `cognate dev` uses (`devTokenAuthenticator`); it is **not**
production auth.

## Why `createRuntime`, not `createHarness`

`@cognate/profile-harness`'s `createHarness` bundles its own opinions about sessions, storage, and
tools (`Harness.send`/`Harness.session`, a `storage.kv` capability, a fixed `agent.loop`) that don't
match this reconstruction's bespoke session model: one `agent.coding` run per turn correlated by
`session:<id>`, a custom `session.history` capability that folds prior runs instead of an
in-memory/`storage.kv` transcript, and a streaming `model.generate` provider that forwards deltas
through `HandlerContext.progress` (which `createHarness`'s `providerComponent` does not do — it only
calls `generate`). Reusing `createHarness` here would mean fighting its built-ins more than using
them, so this app hand-composes `createRuntime` directly, the same shape as `examples/*/index.ts`.
`streamingProviderComponent` (`src/components/modelProvider.ts`) is deliberately parallel to
`profile-harness`'s `providerComponent`, not a copy — see its doc comment.

## Why the Connect service is served in-process, not via a second `serveRuntime`

`packages/cli/src/index.ts`'s `dev()` runs `serveRuntime` on an internal `Bun.serve` and proxies to
it with `fetch()` from the outer server. Copying that pattern here, `internal.stop()` was observed
to hang forever after any invocation that returned a Connect error response reached the outer proxy
(reproduced in isolation while building this tranche; not yet filed as a framework issue — flagging
here since it affects any app copying the CLI's exact proxy shape). `src/server.ts` instead builds
the Connect fetch handler in-process with the same public APIs `serveRuntime` uses internally
(`createConnectRouter` + `registerRuntimeService` + `createFetchHandler`, all from
`@connectrpc/connect`/`@cognate/protocol-connect`) and serves it from the same `Bun.serve` as the UI
and CSS — genuinely one process, no proxy hop to hang.

## Domain wiring

`domain/index.ts` reads `.sea/interaction/interaction-model.sea` directly (no copy, no symlink —
see its top comment for why) via `loadSemanticProjection`, logs the object count and digest, and
fails fast on a parse error. `tranche5Bindings`/`bindTranche5` bind exactly the capabilities this
tranche publishes — see `BINDINGS.md`.

## Secrets

`$COGNATE_HARNESS_HOME/secrets.json`, mode `0600`. The only writer is `secret.put`
(`src/capabilities/secretPut.ts`); the only reader is `ProviderRegistry.swap` when building a live
provider. `model.configure` (`src/capabilities/modelConfigure.ts`) is invoked via `client.invoke` /
`RuntimeService.invoke`, which the framework does **not** record as an event — so the API key
argument never touches the durable event log. `test/J-CFG-model-provider.test.ts` scans the SQLite
`payloads`, `events.metadata`, `records`, and `projection_state` tables directly to prove it.

## Journeys covered (this tranche)

J-A-first-use (composer gating), J-CFG-model-provider (configure + hot-swap), J-WS-select (choose a
workspace), J-B-basic-session (one streamed turn, history into the next). Tests:
`test/J-CFG-model-provider.test.ts`, `test/J-WS-select.test.ts`, `test/J-B-basic-session.test.ts`,
`test/J-G-persistence.test.ts`.

## Known gaps vs. the reference product

- No tools (`read`/`bash`/`edit`), no approvals, no plan mode, no subagents, no cancel/retry — later
  tranches (T7–T11) per `.agents/plans/deepseek-harness-reconstruction.md`.
- The UI does not reproduce the reference's exact Astryx shell geometry (sidebar drag-resize,
  collapse breakpoints, right sidebar) — it is a minimal shell using `@cognate/react` hooks with the
  Astryx CSS loaded but not its component primitives, styled to the same rough proportions
  (`src/ui/app.css`). A full Astryx-shell rebuild is a larger UI-only follow-up.
- `renderMarkdown` (`src/ui/markdown.ts`) is a small hand-rolled subset (headings, lists, inline
  code/bold/links, fenced code blocks) — enough for the mock model's `plain` scenario, not the
  reference's full CJK/table/math/gallery markdown feature set (product-characterization.md §6).
- Session title generation uses a single-answer cadence (title = the session's first assistant
  answer, truncated — matches the reference's displayed sidebar label; see
  `src/projections/sessions.ts` and `DEVIATIONS.md`); the reference's `all-prompts` LLM re-titling
  cadence is not implemented.
- Composer stats ("`N turns N steps · N tok/s`", "`N% of context used`") are present but static
  (`0`) — no turn/step/token/context accounting is computed yet. See `DEVIATIONS.md`.

## UI fidelity pass (T5b)

`src/ui/App.tsx` / `src/ui/app.css` / `src/ui/icons.tsx` were rebuilt for structural + visual parity
with the pinned reference (light-by-default theme with a dark toggle, Cognate branding, sidebar
geometry from `product-characterization.md` §2, session header with Chat/Trajectory tabs, message
meta lines + code-block Wrap-lines/Copy controls, composer card with mode/model dropdowns and a
stats footer, a two-pane Settings > Models panel). Every reference control that is out of scope this
tranche is still present in the DOM/aria tree (disabled, reference accessible name) rather than
omitted — see `DEVIATIONS.md` for the full list and why.

### Parity capture (Cognate side)

`../tests/drivers/cognate.ts` implements the shared `Driver` interface
(`../tests/drivers/types.ts`) against this app; `../tests/capture/cognate.capture.ts` mirrors
`reference.capture.ts`'s checkpoint names/viewports/animation-disabling and writes
`../cognate/screenshots/<viewport>/NN-name.png` + `../cognate/observations/aria/*.txt`.
`../tests/visual/compare.ts` (pixelmatch + pngjs, pinned in `../tests/package.json`) diffs every
checkpoint present on both sides into `../diffs/<viewport>/NN-name.png` (reference | cognate | pixel
diff) plus `../diffs/summary.md`. Run:

```bash
# from validation/reconstructions/deepseek-harness/tests, with the mock model already running
# on 127.0.0.1:4010 (fixtures/mock-model/server.ts):
bun run capture/cognate.capture.ts desktop 1440 900 /tmp/cg-home-desktop 3182 /tmp/cg-ws-desktop
bun run capture/cognate.capture.ts laptop 1024 768 /tmp/cg-home-laptop 3183 /tmp/cg-ws-laptop
bun run visual/compare.ts
```

As of this pass (3 capture/compare/fix rounds): every checkpoint from `04-workspace-selected`
onward sits at 1.5-4% differing pixels (timestamps, static stats, and font-metric antialiasing
account for the remainder). `01-first-launch`/`03-no-workspace` and the `02*-model-settings` family
carry a large, expected diff — the former because this app has no DeepSeek-branded first-run notice
dialog, the latter because Settings > Models is a single always-open form rather than the
reference's provider-list + multi-step add-wizard; both are recorded in `DEVIATIONS.md`, not fixed
silently.
