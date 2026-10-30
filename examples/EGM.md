# examples — runnable composition demos

## Overview
Each assigned directory here holds exactly one `index.ts` that composes real
`@godspeedai/cognate-*` workspace packages, drives a single scenario end to end, and
throws if the observed result is wrong before printing a single `ok:` line. Nothing
here is a test harness or a fixture set: the scripts exercise the published package
surface the way an application author would. Each one is reachable from the repo
root through a `package.json` script named `example:<directory>`.

## Subdirectories & Boundaries
- ag-ui: [./ag-ui/EGM.md](./ag-ui/EGM.md) — run projected to an AG-UI SSE stream
- artifact-workbench: [./artifact-workbench/EGM.md](./artifact-workbench/EGM.md) — content-addressed artifact produced and read back
- autonomous-harness: [./autonomous-harness/EGM.md](./autonomous-harness/EGM.md) — reference harness model/tool loop
- capability-hot-swap: [./capability-hot-swap/EGM.md](./capability-hot-swap/EGM.md) — live provider replacement under a running kernel
- cognitive-memory: [./cognitive-memory/EGM.md](./cognitive-memory/EGM.md) — embed, recall, and authorized resolution
- connect: [./connect/EGM.md](./connect/EGM.md) — same service served and consumed over Connect RPC
- copilot: [./copilot/EGM.md](./copilot/EGM.md) — Copilot reference profile with a backend tool
- domainforge: [./domainforge/EGM.md](./domainforge/EGM.md) — semantic projection with explicit capability binding
- generative-ui: [./generative-ui/EGM.md](./generative-ui/EGM.md) — `ui.render` events rendered through a component registry
- human-approval: [./human-approval/EGM.md](./human-approval/EGM.md) — durable suspension on a human continuation
- mcp: [./mcp/EGM.md](./mcp/EGM.md) — capabilities exposed as MCP tools behind runtime policy
- multi-agent: [./multi-agent/EGM.md](./multi-agent/EGM.md) — parent run spawns and awaits a child run
- realitytrace: [./realitytrace/EGM.md](./realitytrace/EGM.md) — committed-outbox observation delivery and receipts
- rvf-branching: [./rvf-branching/EGM.md](./rvf-branching/EGM.md) — branching a portable RVF index
- refund-desk: [./refund-desk/EGM.md](./refund-desk/EGM.md) — the multi-file Refund Desk app with a `.sea` domain, `src/`, and its own lockfile
- shared-state: [./shared-state/EGM.md](./shared-state/EGM.md) — two runtimes sharing one durable store

## Global Invariants
- Success is proven by an assertion, not by exit code alone: every script throws a descriptive `Error` on a wrong observation and logs `ok:` only after it `[examples/connect/index.ts:main]`.
- State is ephemeral by construction: `store: ":memory:"` for every runtime-backed example except the two that need a real filesystem `[examples/ag-ui/index.ts:main]`.
- Waits are bounded and polled, never unbounded: each local `waitUntil` throws after a default 8000 ms budget `[examples/human-approval/index.ts:waitUntil]`.

## Global Side Effects
- Two examples bind an ephemeral loopback TCP port with `port: 0` and stop the server in `finally` `[examples/connect/index.ts:serveRuntime]`.
- Two examples create a temporary directory and delete it in `finally` `[examples/rvf-branching/index.ts:main]`.
- `realitytrace` reads the `SXR_BIN` environment variable only to report whether it was configured; it never launches an external binary `[examples/realitytrace/index.ts:usingSxrCli]`.

## Verification
- Run: `bun run check`
- Run: `bun run example:mcp` (each example has its own `example:<directory>` script)
