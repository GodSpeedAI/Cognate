# DeepSeek Harness reconstruction — Cognate app (tranche T5)

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
- Session title generation always uses `first-prompt` (truncated first message); the reference's
  `all-prompts` LLM-generated title mode is not implemented.
- No Playwright visual capture wired into this tranche's own test run yet (see repo-level
  `validation/reconstructions/deepseek-harness/reference/screenshots/` for the reference side); see
  `screenshots/dev/` for this app's own dev screenshots and how they were taken.
