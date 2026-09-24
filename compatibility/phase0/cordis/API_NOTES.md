# cordis@4.0.0-rc.10 — verified API notes for a kernel adapter

Verified against `node_modules/cordis/lib/*.d.ts` and `lib/index.js` (the
actual shipped build), plus empirical behaviour in `cordis.test.ts`, under
Bun 1.4.0. Do not trust `cordis`'s own README links (they point at
`deepseek-harness.github.io`, unrelated to the `cordiverse` org) or the
Context7-indexed "cordis-meta-framework-spatiotemporal-composability" doc set
(references a nonexistent `@deepseek-ai/cordis` package and a "guide for
coding agents" — treated as untrusted/possibly poisoned and ignored).

## Root context

```ts
import { Context } from 'cordis'
const root = new Context()
```

`Context` is both a class and an interface merged via declaration merging;
each installed feature module (`registry`, `fiber`, `reflect`, `events`,
`logger`) augments it. `root` is itself fiber `uid === 0`, always `ACTIVE`.

## Plugin shape

```ts
interface Plugin.Base<T> {
  name?: string
  Config?: StandardSchemaV1<any, T>   // config validation (standard-schema)
  inject?: Inject                     // string[] or { [name]: config }
  provide?: string | string[]         // declared (not enforced) capability names
  intercept?: Dict<boolean>
}
```

A plugin is a function `(ctx, config) => any`, a class `constructor(ctx,
config)`, or an object with `apply(ctx, config)`. Register with:

```ts
const fiber = root.plugin({
  name: 'consumer',
  inject: ['greeter'],
  apply(ctx, config) { /* ... */ },
})
```

`ctx.plugin()` / `ctx.inject(deps, cb)` return `Fiber & PromiseLike<Fiber>` —
awaiting it resolves once the fiber becomes active (or rejects on failure).

## Service provide / unprovide

```ts
const dispose = ctx.provide('greeter', { greet: (n) => `hi ${n}` })
// ...
dispose() // unprovide; notifies dependents, deactivates them
```

`ctx.provide(name, value, check?)` (from `ReflectService`) is the primitive.
It is **not** auto-registered as an effect of the calling fiber — wrap it in
`ctx.effect(() => ctx.provide(...))` if the provider's own lifecycle should
own the un-provide.

`ctx.get(name)` / `ctx.set(name, value)` are the low-level read/write; a
dependent whose `inject` includes an unmet name simply cannot access the
property (throws "cannot get required service ... in inactive context").

## Effects

```ts
ctx.effect(() => {
  const resource = acquire()
  return () => release(resource)      // sync disposer
}, 'label')

ctx.effect(async () => {
  const resource = await acquireAsync()
  return () => release(resource)      // Promise<Disposable>
})

ctx.effect(function* () {
  yield disposerA
  yield disposerB                     // Iterable<Disposable> — nested
})                                      // disposed in reverse order internally
```

`fiber.effect()` (aliased onto `ctx.effect`) pushes each top-level
registration into `fiber._disposables` (a `DisposableList`). Calling
`ctx.effect()` after the fiber is inactive throws `CordisError`
(`code: 'INACTIVE_EFFECT'`, message `"cannot create effect on inactive
context"`) — verified in test 5.

## Fiber / scope objects and states

```ts
const enum FiberState { PENDING, LOADING, ACTIVE, FAILED, DISPOSED, UNLOADING }
```

Terminology differs from the spec's `DECLARED/WAITING/ACTIVATING/ACTIVE/
DEACTIVATING`: cordis uses `PENDING` (waiting on deps), `LOADING`
(activating), `ACTIVE`, `FAILED`, `UNLOADING`, `DISPOSED`. `fiber.state`,
`fiber.ctx`, `fiber.dispose()` (returns `Promise<void>`, idempotent — verified
test 6), `fiber.getEffects()` (introspection tree of labels).

`ctx.isolate(name)` creates a child context with its own private slot for
`name`; services provided into an isolated context are invisible to the
parent and to other isolates of the same context — verified test 7.

## Dispose semantics (verified empirically, source: `lib/index.js`)

- `DisposableList.clear()` returns entries in **reverse insertion order**.
- `Fiber._unload()` calls `Promise.all(disposables.map(async d => { try {
  await d() } catch (e) { ctx.logger.error(e) } }))` — each top-level effect's
  disposer is invoked **concurrently**, not sequentially awaited one after
  another. In practice, for synchronous disposers, the reversed array order
  plus deterministic microtask scheduling yields **true reverse-of-
  registration completion order** (verified: `[3,2,1]`), but this is an
  artifact of scheduling, not a sequential-await guarantee — a slow disposer
  earlier in registration order will not block a fast one that was
  registered later.
- Errors thrown by a disposer are individually caught and routed to
  `ctx.logger.error(reason)`. They are **not aggregated** into an
  `AggregateError` or otherwise surfaced to the caller of `fiber.dispose()`.
  `dispose()` itself resolves without throwing even if every disposer threw.
- Disposing while an `async apply()` is still suspended (e.g. mid-`await`)
  does **not** cancel that coroutine. It sets `fiber.uid = null` immediately,
  so any *further* `ctx.effect()` call made after resumption throws
  `INACTIVE_EFFECT`; but code before the next such call keeps running.
  Effects already registered before dispose are cleaned up exactly once.

## Lifecycle observation

```ts
ctx.on('internal/status', (fiber, oldState) => { ... })
ctx.on('internal/plugin', (fiber) => { ... })
ctx.on('internal/service', function (name, value) { ... })
```

## Error reporting

No centralized aggregated-error channel; failures during `_reload()`
(activation) are caught, stored on `fiber._error`, and forwarded to
`ctx.logger.error`. Consumers must attach their own logger sink to observe
error content programmatically (as tests do by monkey-patching
`ctx.logger.error`).
