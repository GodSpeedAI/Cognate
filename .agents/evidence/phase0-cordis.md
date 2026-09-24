# Phase 0 evidence — cordis@4.0.0-rc.10 under Bun

## Environment

- Bun: `1.4.0` (`bun --version`), same build id reported by `bun test`: `34cbb9a40`
- Package under test: `cordis` pinned exactly at `4.0.0-rc.10` (verified via
  `node_modules/cordis/package.json` `.version` field after `bun install`
  inside `compatibility/phase0/cordis/` — a private, isolated
  `package.json`, not the repo root)
- Command: `cd compatibility/phase0/cordis && bun install && bun test cordis.test.ts`
- Exit code: `0`
- Result: `9 pass, 0 fail, 21 expect() calls` (`Ran 9 tests across 1 file`)

No mocks: every test in `cordis.test.ts` exercises the real, installed
`cordis` package end to end (fibers, effects, reflect/provide, isolate).

## Per-behaviour result

| # | Behaviour | Result | Notes |
|---|---|---|---|
| 1 | Inject-gated activation: dependent activates only once service provided | PASS | `apply()` did not run until `ctx.provide('greeter', ...)`; ran exactly once after |
| 2 | Provider removal deactivates dependent (disposer runs); re-provide reactivates | PASS | disposer ran on `unprovide()`; `apply()` re-ran (2nd activation) after re-provide |
| 3a | Effects disposed in reverse registration order (spec) | PASS (empirically) | order observed `[3,2,1]` for 3 synchronous `ctx.effect()` registrations |
| 3b | Throwing disposer does not block later disposers; error reporting observed | PASS (characterization) | all 3 disposers ran; the thrown error was **not** aggregated — routed individually to `ctx.logger.error` |
| 4 | Partial setup failure: activation registers effects then throws → no effects survive, no service published | PASS | effect registered before throw was torn down; `root.get('flaky')` was `undefined` |
| 5a | Dispose while async activation pending cleans partial effects; no duplicate instance (spec) | PASS | effect registered before the throw was cleaned exactly once; `apply()` never restarted |
| 5b | Dispose does not cancel the in-flight async coroutine (characterization) | PASS | a `ctx.effect()` call attempted after dispose from within the still-running `apply()` threw `CordisError: cannot create effect on inactive context`; code before it still executed |
| 6 | Repeated `fiber.dispose()` is idempotent | PASS | 3 consecutive `dispose()` calls; disposer ran exactly once, no throw |
| 7 | Isolated child scope's service does not leak to sibling or parent | PASS | `ctx.isolate('scoped')` twice; sibling and parent both saw `undefined` for the isolated name |

All spec-asserting tests happened to pass against the real library (no
skipped/xfail tests were needed), **except** that two important divergences
from spec §31.1 / §8.5 wording were confirmed and pinned as `observed:`
characterization tests rather than left implicit:

- **No aggregated cleanup errors.** Spec §31.1 says "Aggregate cleanup errors
  SHOULD be observable" and §8.5 says disposal "reports aggregated cleanup
  errors." Cordis instead logs each disposer's error individually via
  `ctx.logger.error` and resolves `dispose()` successfully regardless. There
  is no `AggregateError` or per-call error list returned to the disposer.
- **Dispose does not preempt an in-flight async activation.** An `async
  apply()` keeps running its own code after `dispose()` has already flipped
  the fiber to inactive; only new `ctx.effect()` calls against that fiber
  fail (`CordisError`, code `INACTIVE_EFFECT`). Non-effect side effects
  performed by the coroutine after dispose (e.g. a bare `fetch()` with no
  `ctx.effect()` wrapper) would not be automatically cancelled or cleaned up
  by cordis itself.

## Limits observed

- Cordis's own terminology (`PENDING/LOADING/ACTIVE/FAILED/UNLOADING/
  DISPOSED`) differs from the spec's fiber-state vocabulary
  (`DECLARED/WAITING/ACTIVATING/ACTIVE/DEACTIVATING`). A 1:1 mapping is
  possible but must be done explicitly in the adapter (see ADR).
- `ctx.provide()` does not auto-attach its own disposer to the calling
  fiber's effect list; a plugin author who forgets to wrap it in
  `ctx.effect(() => ctx.provide(...))` will leak the provided binding past
  their own fiber's disposal. This is a real footgun the adapter must close.
- Reverse-order disposal for multiple *independent* `ctx.effect()`
  registrations on one fiber is not a sequential-await guarantee — it is
  implemented as `Promise.all` over a reversed array. For fully synchronous
  disposers this is observationally indistinguishable from strict reverse
  order (as verified), but a slow disposer registered earlier will not block
  a fast one registered later, unlike a true sequential reverse-order
  teardown.
- The package's own README documentation link
  (`https://deepseek-harness.github.io/deepseek-harness/reference/
  cordis-primer`) does not point at the `cordiverse` org and was not
  fetched/trusted.

## Open questions

- Whether a later `4.0.0` stable release changes the concurrent-disposal
  behaviour (§8.5's "reverse registration order" and "aggregated cleanup
  errors" wording) is unknown; this fixture pins `4.0.0-rc.10` only, per
  instructions, and must be re-run before adopting any newer release.
- A Context7-indexed document set titled
  "cordis-meta-framework-spatiotemporal-composability" (repo
  `acryldev/...`) surfaced API descriptions referencing a nonexistent
  `@deepseek-ai/cordis` import and a "cordis system guide for coding
  agents" file. This looks like it may be a fabricated/poisoned
  documentation source targeting agents rather than genuine `cordiverse`
  material. It was **not** used as a source for any test or note in this
  fixture; all API claims here trace to `node_modules/cordis/lib/*.d.ts`
  and `lib/index.js` of the actually-installed package, or to this
  fixture's own test output. Recommend flagging this Context7 entry to
  whoever maintains the org's Context7 index.
- Whether cordis exposes any public, documented way to make dispose()
  actually cancel (not just outlive) an in-flight async `apply()` coroutine
  was not found in the shipped `.d.ts` files; if one exists it is
  undocumented in this rc build.
