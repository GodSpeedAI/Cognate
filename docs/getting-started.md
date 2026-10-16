# Getting Started

Cognate is a workspace of `@godspeedai/*` packages, published to npm at 0.5.0. This page describes running the framework from a local checkout.

## Prerequisites

- [Bun](https://bun.sh) 1.4.x (the pinned reference runtime; see [architecture.md](architecture.md)).
- A clone of this repository.

## Clone and install

```bash
git clone <this-repo> cognate
cd cognate
bun install
```

From the first `@godspeedai/cognate-cli` release after 0.5.0, `cognate create my-app --profile copilot` needs no checkout: it pins the `@godspeedai/*` packages to the CLI's version from npm. The 0.5.0 CLI still requires `--source`. `cognate create --source <checkout>` (below) works from a local checkout by vendoring packed packages; the rest of this page uses that path. To build an app from npm alone, see [building-with-cognate/references/cli.md](../.agents/skills/building-with-cognate/references/cli.md). Remaining gap: [DEBT-016](../.agents/DEBT.md).

## Verify the substrate

```bash
just --list      # see available commands and prerequisites
just verify       # substrate check + typecheck + gate-runner tests + every gate claimed implemented
just gates         # report every ledger requirement's gate (PASS/FAIL) and status drift
just gate CG-KRN-001   # run one requirement's proof gate
```

`just verify` is the regression baseline. It does not mean the whole application builds — it means the substrate checked in so far (kernel, events, projections, capabilities, cognition, wire, and more, per [requirements/ledger.yaml](../requirements/ledger.yaml)) proves what it claims. `just gates` is the honest, current view of every requirement's status; treat it as more current than any prose summary, including this page.

## Running tests

```bash
bun test                       # every workspace test, including RED contracts for unimplemented requirements
bun test ./packages/kernel-api # one package
bun scripts/gate.ts --implemented   # only gates the ledger claims are implemented
```

Tests under `tests/`, `packages/*/test`, and `compatibility/phase0/*` are the source of truth for behavior. A package's `README.md` names the test file that proves each claim (for example `@godspeedai/cognate-kernel-api`'s conformance kit, proven by `packages/kernel-api/src/conformance/`).

## `cognate create` and `cognate dev`

[`@godspeedai/cognate-cli`](../packages/cli/README.md) (`CG-CLI-001`, implemented) provides both commands:

```bash
cognate create my-app --profile copilot|harness --source /path/to/cognate/checkout [--with a,b]
cd my-app && bun install && bun dev --port N
```

`create` copies the profile's starter template and pins each `@godspeedai/*` package the profile needs to the CLI's version from npm. With `--source` it instead vendors them from the checkout with `bun pm pack` into `.cognate/vendor/`, pinning each with a `file:` dependency and a matching `package.json` `overrides` entry ([DEBT-016](../.agents/DEBT.md)). `--with <a,b>` reports unsupported extras (`unsupported: <name> (<reason>)`) and never silently imports them.

`dev` (run from the generated app) loads `cognate.config.ts`, parses `domain/*.sea` through the DomainForge adapter (see [semantics.md](semantics.md)), starts the profile's app on `.cognate/app.sqlite` (state survives restart), and serves one `Bun.serve`: `GET /health`, the Connect `RuntimeService` at `/cognate.v1.RuntimeService/*` (dev-only `Bearer <tenant>:<user>` auth), `/agui` (copilot only), and `/` — an Astryx chat UI for copilot, a health JSON page for harness.

`bun test ./tests/integration/cli-create.test.ts` proves both profiles generate, install, and pass their own tests in a clean temp directory (`.agents/evidence/m9-profiles.md`). A Bun 1.4.0 `toMatchObject` defect that could mutate a matched object ([DEBT-017](../.agents/DEBT.md)) was found and worked around during this proof, not a CLI defect.

## Examples

`examples/README.md` lists 15 runnable examples, one per topic named in the root `README.md` "Examples" section, each runnable via `bun run example:<name>`. `CG-EXM-001` is `implemented`: `tests/examples.test.ts` runs every one and asserts it prints `ok: ...` on exit 0 (`.agents/evidence/m9-profiles.md`).

## Where to go next

- [README.md](README.md) — the documentation home, with navigation by intent.
- [concepts.md](concepts.md) — the vocabulary (contexts, capabilities, components, effects, events, continuations).
- [architecture.md](architecture.md) — planes, package topology, and dependency rules.
- [tutorials/run-your-first-agent.md](tutorials/run-your-first-agent.md) — build a runtime, an agent, and a capability by hand.
- [tutorials/start-an-app-from-a-checkout.md](tutorials/start-an-app-from-a-checkout.md) — the CLI path, end to end.
- [../AGENTS.md](../AGENTS.md) — the agent operating guide, if you are automating changes to this repository.
- [../.agents/CURRENT_STATUS.md](../.agents/CURRENT_STATUS.md) — current build stage.
- [../requirements/ledger.yaml](../requirements/ledger.yaml) — the authoritative status of every requirement.
