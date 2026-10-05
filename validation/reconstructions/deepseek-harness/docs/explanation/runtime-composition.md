# Why `createRuntime`, not `createHarness`, and why one process

Two composition decisions, both of which look like extra work until you know what they replaced.

---

## Why not the packaged harness profile

`@cognate/profile-harness` exports `createHarness`, which bundles opinions about sessions, storage, and
tools. This app hand-composes `createRuntime` from `@cognate/runtime-bun` instead. The stated reason
in `cognate/README.md` is that those opinions conflict with what this app needs in three specific
places.

## The three conflicts

**1. Session model.** `createHarness` provides a `Harness.session` abstraction. This app's model is
"one `agent.coding` run per turn, correlated `session:<id>`, with a bespoke `session.history`
capability that folds prior runs". The fold is not a transcript store: it reconstructs a
`ModelMessage[]` from run inputs, run outputs, per-run `tool.call.started` counts, and the `subagents`
projection. There is no packaged equivalent, and `storage.kv` — the profile's storage capability —
is the wrong shape for it.

**2. Streaming.** `createHarness`'s `providerComponent` calls `generate` and returns. This app needs
live token deltas inside the invoking run, which requires calling `provider.stream` from inside the
handler and pushing each delta through `ctx.progress`. That is the whole reason
`src/components/modelProvider.ts` exists, and its doc comment says explicitly that it is "deliberately
parallel to, not a copy of" the packaged component.

**3. Delegation.** `spawnSubagent` depends on a `run_completion` continuation resolver captured inside
`createHarness`'s closure. An app composing `createRuntime` directly cannot reach it without copying
the resolver. It was not needed anyway once delegation became fire-and-forget (matching the
reference), so the app wrote its own `subagent.start` instead.

## What the conflict is not

It is **not** a rejection of the framework. The app uses `@cognate/runtime-bun`, `@cognate/kernel-api`,
`@cognate/capabilities`, `@cognate/projections`, `@cognate/domainforge`, `@cognate/protocol-connect*`,
`@cognate/react`, and `@cognate/provider-openai-compatible` — the same building blocks
`createHarness` is built from. The recorded conclusion in `cognate/README.md` is a cost judgement:
"Reusing `createHarness` here would mean fighting its built-ins more than using them."

`parity-report.md` records the consequence as an open framework finding, **F2**: `spawnSubagent` is
not reusable outside `createHarness`, and a candidate general fix (exporting a standalone
`watchSubagentCompletions(runtime, caller)`) remains untouched on this branch because it was never on
the critical path. That is the right way to hold this: a genuine framework limitation, recorded, not
worked around silently and not fixed opportunistically.

## Second-order cost

Composing directly means the app owns wiring that a profile would have given it: which projections
are public, which components are static versus late-mounted, which policy allows what, and the fact
that two components need `getService` closures because the service does not exist until after
`createRuntime` resolves. That is ~40 lines of `server.ts`. It buys exactness: the test suite asserts
specific capability ids, specific correlations, and specific event orderings, and a profile that
contributed its own session/tool opinions would make those assertions about a blend rather than about
this app.

---

## Why the Connect service is served in-process

`packages/cli/src/index.ts`'s `dev()` runs `serveRuntime` on an **internal** `Bun.serve` and proxies to
it with `fetch()` from the outer server. Copying that pattern here produced a hang: after any
invocation that returned a Connect error response reached the outer proxy, `internal.stop()` never
returned. Reproduced in isolation; recorded in `cognate/README.md` as affecting any app copying the
CLI's exact proxy shape, and explicitly *not yet filed as a framework issue*.

`src/server.ts` therefore builds the Connect fetch handler in-process with the same public APIs
`serveRuntime` uses internally — `createConnectRouter`, `registerRuntimeService`,
`createFetchHandler`, all from `@connectrpc/connect` and `@cognate/protocol-connect` — and serves it
from the same `Bun.serve` as the UI, the CSS, and `/health`. The router's handlers are converted to a
`Map<path, fetchHandler>` once at boot.

**What to notice:** this is a deviation from the CLI's *startup* pattern, not from its *protocol*.
The wire surface is identical; only the process topology differs. The app is genuinely one process
with no proxy hop to hang.

**The cost, honestly:** an error observed in this app is now an error in the same process as the HTTP
server, and the dev token is printed to the same stdout. Neither is a real risk for a loopback,
single-operator tool — but it is a shape that would need revisiting before this were exposed on a
network.

## What the diagram is not saying

The architecture page shows the runtime as a box. In reality `createRuntime` owns a kernel, a set of
Cordis-style fibers, a run executor, a projection runner, and a store handle — five mechanisms the app
never touches directly. The app's dependency surface is deliberately narrow: components, projections,
agents, and the `RuntimeService` it receives. That narrowness is the point, and
`tests/architecture/cordis-boundary.test.ts` enforces the framework-level half of it.

## Related

- [../architecture.md](../architecture.md) §2–§4 — logical architecture and dependency direction
- [../subsystems/server-runtime.md](../subsystems/server-runtime.md) — the composition in detail
- [../subsystems/agent-coding.md](../subsystems/agent-coding.md) — where `ctx.invoke` and `ctx.progress` appear
- [../subsystems/domain-model.md](../subsystems/domain-model.md) — the bindings that would be affected
- [../subsystems/capabilities.md](../subsystems/capabilities.md) — `subagent.start`'s doc comment
- `parity-report.md` §"Framework findings" — D1, D2, F2, F3, G1 in one place
