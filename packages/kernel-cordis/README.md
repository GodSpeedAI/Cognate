# @godspeedai/cognate-kernel-cordis

Cordis-backed implementation of `@godspeedai/cognate-kernel-api`. Only this package imports `cordis`; no
Cordis type crosses an exported signature (spec §3.4). See `docs/decisions/ADR-0001-kernel-engine-cordis.md`.

## Mapping

| Cognate concept | Cordis concept |
| --- | --- |
| `Scope` | A Cordis `Context` obtained via `ctx.isolate(id)` (`scope.ts`) |
| Mounted component occurrence | One `ctx.plugin()` call = one Cordis fiber, per attempt (`fiber.ts`) |
| `effects.register()` | Entries in an adapter-owned stack unwound by a single `ctx.effect()` wrapper |
| `provide()` / capability publish-withdraw | Committed into `CapabilityRegistry` only after activation succeeds, torn down by the same wrapper effect |
| `CapabilityLease` | Adapter object bound to one `Publication`, revalidated per invoke (Cordis has no lease type) |
| `kernel.resolve()` / dependency matching | `CapabilityRegistry.find()` using `isCompatible` over scope-ancestor chain |

## Adapter-owned behaviours (Cordis has none of these; ADR-0001 mitigations)

- **Aggregated cleanup errors** — Cordis reports each disposer error to its own logger and never
  aggregates them; the single wrapper effect aggregates into `CleanupError` itself.
- **Reverse-order disposal** — Cordis's own `Promise.all`-based unload is only reverse-of-completion
  for synchronous disposers; the adapter runs its own effect stack sequentially in reverse.
- **Cancellation signal** — Cordis never cancels an in-flight `apply()`; the adapter derives its own
  `AbortSignal` per attempt and per active occurrence.
- **Retry/backoff and permanent failure** — fully adapter-owned state machine (`fiber.ts`).
- **Activation timeout** — raced against the Cordis fiber promise; a timed-out fiber is abandoned,
  not force-disposed (Cordis's `dispose()` blocks forever on a hung `apply()`).
- **FAILED/DEACTIVATING vocabulary and fiber-state translation** — Cordis uses
  PENDING/LOADING/ACTIVE/FAILED/DISPOSED/UNLOADING; never exposed.
- **Dependency eligibility (`isCompatible`, version/attributes)** and **scope visibility**
  (descendant-visible, sibling-invisible) — Cordis's `ctx.provide`/`ctx.get`/`isolate` are
  single-slot-per-name with no version matching and no dynamic per-id isolation; both are
  implemented in `registry.ts`/`scope.ts`.
