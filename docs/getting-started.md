# Getting Started

Cognate is a workspace of `@cognate/*` packages, not yet a published framework. This page describes what you can actually run today, from a local checkout, and what is still planned.

## Prerequisites

- [Bun](https://bun.sh) 1.4.x (the pinned reference runtime; see [architecture.md](architecture.md)).
- A clone of this repository.

## Clone and install

```bash
git clone <this-repo> cognate
cd cognate
bun install
```

There is no npm-published `@cognate/*` package yet. Every workspace package is private with `workspace:*` internal dependencies, so `bunx cognate create my-app` from a clean machine does not work — see [DEBT-016](../.agents/DEBT.md) (requirement `CG-CLI-001`, ledger status `candidate`). The rest of this page uses the local checkout instead.

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

Tests under `tests/`, `packages/*/test`, and `compatibility/phase0/*` are the source of truth for behavior. A package's `README.md` names the test file that proves each claim (for example `@cognate/kernel-api`'s conformance kit, proven by `packages/kernel-api/src/conformance/`).

## `cognate create` and `cognate dev` (planned)

The CLI contract (`packages/cli/src/index.ts`) defines two commands, both currently unimplemented (`throw new Error("cli: not implemented")`), tracked by `CG-CLI-001` (ledger status `candidate`):

```ts
// cognate create <dir> --profile copilot|harness --source <path> [--with a,b]
create(options: {
  dir: string;
  profile: "copilot" | "harness";
  source: string; // path to a Cognate checkout; packages are packed and vendored (DEBT-016)
  with?: readonly string[]; // extra components; unsupported ones are reported, never silently imported
}): Promise<CreateReport>;

// cognate dev [--port N]
dev(options: { dir: string; port: number }): Promise<DevServer>;
```

Once implemented, `create` packs this checkout's packages (`bun pm pack`) into a generated app and pins them with `overrides`, because they are not on npm (DEBT-016). `dev` loads `cognate.config.ts`, parses `domain/*.sea` through the DomainForge adapter (see [semantics.md](semantics.md)), starts a runtime on `.cognate/app.sqlite`, and serves `/health`, the Connect RPC surface, `/agui`, and the profile UI.

Until `CG-CLI-001` is implemented, build an application by composing packages directly, the way `profiles/copilot` and `profiles/harness` do (see [extensions.md](extensions.md)).

## Examples (planned)

The README lists 15 planned examples under `examples/`, each runnable via `bun run example:<name>` once `CG-EXM-001` (ledger status `candidate`) is implemented. `tests/examples.test.ts` is the contract: every listed example must exist at `examples/<name>/index.ts(x)`, have a matching `package.json` script, and print `ok: ...` on exit 0.

## Where to go next

- [concepts.md](concepts.md) — the vocabulary (contexts, capabilities, components, effects, events, continuations).
- [architecture.md](architecture.md) — planes, package topology, and dependency rules.
- [../AGENTS.md](../AGENTS.md) — the agent operating guide, if you are automating changes to this repository.
- [../.agents/CURRENT_STATUS.md](../.agents/CURRENT_STATUS.md) — current build stage.
- [../requirements/ledger.yaml](../requirements/ledger.yaml) — the authoritative status of every requirement.
