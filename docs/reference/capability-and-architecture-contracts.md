# Reference: capabilities, the kernel contract, and the architecture guards

## Capability ids published in this repository

| Id | Provided by | Used for |
|---|---|---|
| `model.generate` | `provider-local`, `provider-openai-compatible` | model invocation; features conveyed as contract attributes |
| `agent.copilot` | `profiles/copilot` | the copilot agent |
| `agent.loop` | `profiles/harness` | the harness agent loop |
| `agent.refund`, `agent.support`, `agent.parent`, `agent.child`, `agent.ui`, `agent.approval`, `agent.echo`, `agent.fails`, `agent.tooluser` | tests, examples, E2E | agent ids used by fixtures |
| `tool.<name>` | `profiles/harness` (`toolComponent`), a profile's tool registry | a tool the model may call |
| `storage.kv` | `profiles/harness` | key/value storage, tenant-partitioned by `HandlerContext.tenant` |
| `sandbox.exec` | `profiles/harness` | scrubbed-environment subprocess with a timeout |
| `subagent.start` | `profiles/harness` | durable subagent composition |
| `billing.quote` | the E2E app (`tests/e2e/app.ts`) | the backend capability in the §36 journey |
| `warehouse.read`, `refund.approve`, `refund.resume`, `x.read` | tests, examples | fixtures |
| frontend capabilities (`map.focus` and similar) | the connected client, via `provideCapability` | served by the browser, not the server |

`run.resume` is a **resume handler id**, not a capability.

## The kernel contract

`@godspeedai/kernel-api`.

```ts
interface CapabilityContract { id: string; version: string; attributes?: Attributes; semanticRef?: SemanticRef }
interface Requirement       { capability: string; version?: string; attributes?: Attributes }
type AttributeValue = string | number | boolean;
```

`isCompatible(requirement, contract)`: same id; if a version is required, same major with
minor/patch at least as high; every required attribute equal. A malformed version string throws
`TypeError`.

```ts
interface Component {
  id: string; version?: string;
  requires?: readonly Requirement[];
  provides?: readonly CapabilityContract[];
  activate(fiber: FiberContext): ... ;      // returns the capability handler map
  retry?: { maxAttempts?: number; timeoutMs?: number; backoffMs?: number };
}

type FiberState = "WAITING" | "ACTIVATING" | "ACTIVE" | "FAILED" | "DEACTIVATING" | "DISPOSED";

interface ComponentHandle {
  componentId: string; scopeId: string; state: FiberState; fiberId?: string;
  waitFor(target: FiberState, timeoutMs?: number): Promise<void>;
  dispose(reason?: string): Promise<void>;
  reset(): Promise<void>;
  on(listener: (state: FiberState) => void): () => void;
}
```

`FiberContext` gives an activating component `id`, `context`, `scopeId`, `fiberId`, `signal`,
`require(requirement)`, `provide(contract, handler)`, `effects.register(disposer)`, and `emit`.

### Policies

```ts
const denyAll: Policy;                    // the default: no authority
function rulePolicy(policyId, rules): Policy;   // first matching rule decides; no match denies
function allowCapabilities(policyId, capabilities): Policy;  // tests and profiles
```

`Policy.authorize(AuthorizationRequest) → PolicyDecision`, where the request carries the actor,
tenant, scope, capability contract, selected provider, and correlation ids.

### Invocation

```ts
type InvocationResult<O> = { ok: true; value: O } | { ok: false; failure: InvocationFailure };
type InvocationFailure =
  | { kind: "unavailable"; capability: string; reason: string }
  | { kind: "denied"; decision: PolicyDecision }
  | { kind: "deadline_exceeded" } | { kind: "cancelled" }
  | { kind: "failed"; error: unknown };
```

Invocation never throws for a denial.

### `HandlerContext.progress`

```ts
interface HandlerContext extends InvocationContext {
  // ...
  readonly progress?: (payload: Json) => Promise<void>;
}
```

An optional, durable channel a handler can use to publish incremental progress into the invoking
run (e.g. streamed model token deltas) while the invocation is still executing. It is always
callable — no-op when the invocation is not inside a run (e.g. a direct `RuntimeService.invoke`
from a client or over Connect). Inside a run, each call appends a `run.invocation.progress` event;
see [reference/events-and-stores.md](events-and-stores.md) for its shape. Progress calls never
affect step/emit/artifact replay counters, and are not repeated when a completed invocation is
replayed.

### Errors

`CleanupError` (an `AggregateError` of disposer failures), `PermanentActivationError`,
`ActivationTimeoutError`, `UndeclaredCapabilityError`, `ScopeClosedError`.

### Kernel events

`fiber.state`, `capability.provided`, `capability.withdrawn`, `cleanup.failed`, `invocation`
(the last carries the capability, provider, correlation id, and decision).

## Architecture guards

These are tests, not conventions. `bun test ./tests/architecture` runs all of them.

| Test | Requirement | What it fails on |
|---|---|---|
| `dependencies.test.ts` | `CG-ARC-001` | a forbidden edge; a third-party engine imported outside its owning adapter; a dependency cycle |
| `acceptance.test.ts` | `CG-ARC-002` | an architectural acceptance criterion (A–M) whose requirements are not all `implemented`; a framework package depending on `@godspeedai/ag-ui`; a non-exact DomainForge pin |
| `engine-boundary.test.ts` | `CG-UI-003` and siblings | an engine type crossing a framework contract |
| `invariants.test.ts` | `CG-ARC-003` | framework-specific `.sea` grammar; an unpinned upstream release; non-framework wire schema; RxJS |
| `docs.test.ts` | `CG-DOC-001` | a page in the documentation map that does not exist; a missing `README.md`/`AGENTS.md`; a broken relative markdown link; a page describing an `implemented` requirement as candidate |
| `../proof-routing.test.ts` | — | a broken gate route |
| `../properties/*.test.ts` | various | reversibility, dependency closure, scope isolation, disposal idempotence, replay determinism, cognitive non-authority, adaptive containment |

### The forbidden-edge list

`kernel-api` → cordis, ruvector, react, astryx, ag-ui, domainforge, realitytrace;
`events` → ruvector, cordis, react; `cognitive-api` → ruvector, cordis; `client` → react, astryx;
`react` → astryx.

### The acceptance criteria (spec §40)

| | Criterion | Bound to |
|---|---|---|
| A | Cordis can be removed conceptually | `CG-KRN-001`, `CG-KRN-007` |
| B | RuVector can be deleted operationally | `CG-COG-003`, `CG-COG-004` |
| C | `.sea` does not know the framework exists | `AK-003`, `CG-SEM-001` |
| D | DomainForge remains independently releasable | `CG-SEM-001`, `CG-SEM-002` |
| E | RealityTrace remains independently releasable | `CG-RT-001`, `CG-RT-002` |
| F | Astryx can be replaced | `CG-UI-001`, `CG-UI-003` |
| G | Connect can be replaced | `CG-WIR-003` |
| H | AG-UI can be removed | `CG-CLT-001`, `CG-UI-001` |
| I | Learning cannot expand authority | `CG-CAP-002`, `CG-COG-002` |
| J | A copilot-like application can be composed | `CG-PRF-001`, `CG-PRF-002` |
| K | A harness-like system can be composed | `CG-PRF-001`, `CG-PRF-003` |
| L | Cognition improves without semantic mutation | `CG-COG-006`, `CG-SEM-001` |
| M | Runtime behavior is causally inspectable | `CG-OBS-001`, `CG-RT-003` |

## Source trail

- `packages/kernel-api/src/{types,compat,policy,errors}.ts`, `src/conformance/`.
- `packages/kernel-cordis/src/*.ts`, `test/*.test.ts`.
- `tests/architecture/{dependencies,acceptance,engine-boundary,invariants,docs}.test.ts`.
- `tests/architecture/graph.ts` — the dependency graph loader the tests share.
- `packages/capabilities/src/model.ts` — `ModelProvider`, `ModelFeatures`, `modelContract`.
- [../subsystems/kernel.md](../subsystems/kernel.md) — the subsystem page.
- [../explanation/why-adapters.md](../explanation/why-adapters.md) — why the guards exist.
