# ADR-0001: Cordis as the reference kernel composition engine

## Status

Accepted-with-mitigations

## Context

The Cognate software design spec (§6 "Reference composition engine", §8.4
Fiber, §8.5 Minimum public kernel contract, §31.1 Cordis/kernel-engine
failure) requires a framework-owned kernel API (`kernel.mount`,
`kernel.resolve`, `lease.invoke`, `componentHandle.dispose`, `scope.close`,
`effects.register`) that never exposes Cordis types publicly (§3.4), backed
in Phase 1 by a composition engine that provides contexts, scoped dependency
resolution, component/plugin lifecycle, fibers, effect ownership, disposal,
and dependency-driven activation.

The candidate engine is the official npm package `cordis`, evaluated at the
exact pinned prerelease `4.0.0-rc.10` (the package's own documentation
describes its API as unstable; the older, structurally different
`@cordisjs/core` v3 package is explicitly out of scope and was not used).

Phase 0 required proving, against the real library under Bun 1.4.x, not
inferred from the paper or from any secondary documentation source:

1. inject-gated activation;
2. dependency-loss deactivation and reactivation;
3. reverse-order disposal and disposer error handling on unload;
4. all-or-nothing partial setup failure;
5. safe disposal during pending async activation;
6. idempotent disposal;
7. scope isolation.

This work is recorded in `compatibility/phase0/cordis/` (`package.json`
pinning `cordis@4.0.0-rc.10` in its own private, isolated install;
`cordis.test.ts`, 9 passing `bun:test` cases against the real package;
`API_NOTES.md`) and `.agents/evidence/phase0-cordis.md` (bun/cordis
versions, exact command, exit code `0`, per-behaviour PASS table, limits,
open questions).

A Context7-indexed third-party document set claiming to describe cordis's
API (referencing a nonexistent `@deepseek-ai/cordis` import and a "guide for
coding agents") was identified as untrustworthy/likely fabricated and was
explicitly discarded as a source; all API claims here are grounded in the
installed package's own `.d.ts`/`.js` source and this fixture's own
empirical test output.

## Decision

Adopt `cordis@4.0.0-rc.10`, pinned exactly, as the Phase 1 kernel's internal
composition engine, hidden entirely behind the framework-owned kernel API
per §3.4 and §8.5. All 7 required lifecycle behaviours held under test.
Two spec-adjacent behaviours in §8.5/§31.1 do **not** hold as literally
worded and require adapter-side mitigation rather than blocking adoption
(§37 Phase 0 gate: "If Cordis fails its required lifecycle fixture, the
reference kernel engine choice must be revised" — none of the *required*
fixtures failed; the two gaps below are refinements to how the adapter must
wrap the engine, not fixture failures).

## Consequences

- The kernel-Cordis mapping (Phase 1) can proceed. `kernel.mount` maps onto
  `ctx.plugin()`/`ctx.inject()`, `componentHandle.dispose()` onto
  `fiber.dispose()`, `effects.register()` onto `ctx.effect()`, and
  `kernel.resolve()`/`lease` onto `ctx.provide()`/`ctx.get()` plus the
  adapter's own lease-validity bookkeeping (Cordis has no first-class lease
  object; a lease is a Cognate-owned wrapper that revalidates against
  Cordis's own service-availability signal per invocation).
- Fiber-state vocabulary must be translated explicitly: Cordis
  `PENDING/LOADING/ACTIVE/FAILED/UNLOADING/DISPOSED` → spec
  `DECLARED/WAITING/ACTIVATING/ACTIVE/DEACTIVATING/[FAILED]/[DISPOSED]`. This
  mapping is the adapter's responsibility; it must not leak Cordis's enum
  publicly (§3.4).

### Mitigations the Cognate adapter MUST implement itself

1. **Aggregated cleanup errors.** Cordis reports each disposer's error
   individually to `ctx.logger.error` and never aggregates them or surfaces
   them to the disposer's caller. The adapter MUST install its own logger
   sink (or wrap every `ctx.effect()` disposer registration) to collect
   errors raised during a fiber's teardown into a single aggregate result,
   satisfying §31.1's "aggregate cleanup errors SHOULD be observable" and
   §8.5's "reports aggregated cleanup errors" at the framework-owned API
   boundary, since Cordis will not do this for us.
2. **Cooperative cancellation for async activation.** Cordis does not cancel
   an in-flight async `apply()` when `dispose()` is called; it only makes
   further `ctx.effect()` calls throw. The adapter MUST NOT assume dispose
   halts activation-side effects that are not registered through
   `ctx.effect()` (e.g. raw network calls, timers). Component authors using
   the Cognate kernel API must be required (by contract/lint, not by trust)
   to route every external acquisition through `effects.register`
   immediately upon acquisition, and the adapter should pass an
   abort/cancellation signal derived from fiber disposal into component
   activation functions so well-behaved components can voluntarily bail out
   early — Cordis itself provides no such signal natively.
3. **Auto-attach `ctx.provide()` disposal.** `ctx.provide()` returns a
   disposer that is not automatically tied to the calling fiber's lifecycle.
   The adapter's capability-provision helper MUST always wrap
   `ctx.provide()` in `ctx.effect(() => ctx.provide(...))` internally so a
   provided capability is guaranteed to be revoked when its owning fiber is
   disposed, closing a real leak surface identified in Phase 0.
4. **Explicit fiber-state translation layer**, per above, isolated to the
   adapter module so no Cordis type or enum crosses the public kernel API
   (§3.4).
5. **Version pin discipline.** Because the upstream package is an explicit
   prerelease with an unstable API, the adapter MUST re-run
   `compatibility/phase0/cordis/cordis.test.ts` against any candidate
   version bump before changing the pinned dependency, and treat a failing
   required behaviour as blocking per §37.
