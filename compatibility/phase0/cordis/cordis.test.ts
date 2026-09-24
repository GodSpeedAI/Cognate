// Phase 0 compatibility fixture: cordis@4.0.0-rc.10 under Bun 1.4.0
//
// Purpose: characterize the REAL npm `cordis` package's fiber/effect/service
// lifecycle so the Cognate spec (see .agents/specs/software-design-spec-
// cognate.-frameworkmd §6, §8.4, §8.5, §9.1, §31.1) can decide whether cordis
// can sit behind the framework-owned kernel API. See
// .agents/evidence/phase0-cordis.md and docs/decisions/ADR-0001-kernel-
// engine-cordis.md for the write-up of what this file discovers.
//
// Every test exercises the actual library — no mocks. Where the library's
// observed behaviour diverges from the spec's normative requirement, we keep
// a spec-asserting test (which is allowed to fail) AND add a matching
// `observed:` test that documents/pins the real behaviour, per instructions.

import { describe, test, expect } from 'bun:test'
import { Context } from 'cordis'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// 1. A component that injects a service activates only once the service is
//    provided.
// ---------------------------------------------------------------------------
describe('1. inject-gated activation', () => {
  test('plugin stays inactive until the injected service is provided, then activates', async () => {
    const root = new Context()
    let activations = 0

    root.plugin({
      name: 'consumer',
      inject: ['greeter'],
      apply(ctx: any) {
        activations += 1
      },
    })

    // No provider yet: must not have activated.
    await sleep(10)
    expect(activations).toBe(0)

    // Provide the service now.
    root.provide('greeter', { greet: (n: string) => `hi ${n}` })
    await sleep(10)

    expect(activations).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 2. Removing the provider deactivates the dependent (disposers run);
//    re-providing reactivates it.
// ---------------------------------------------------------------------------
describe('2. provider removal deactivates dependent; re-provide reactivates', () => {
  test('dependent effect disposer runs on service loss, and reruns apply on service return', async () => {
    const root = new Context()
    let activeCount = 0
    let disposedCount = 0

    root.plugin({
      name: 'consumer',
      inject: ['greeter'],
      apply(ctx: any) {
        activeCount += 1
        ctx.effect(() => {
          return () => {
            disposedCount += 1
          }
        })
      },
    })

    const unprovide = root.provide('greeter', { greet: () => 'hi' })
    await sleep(10)
    expect(activeCount).toBe(1)
    expect(disposedCount).toBe(0)

    // Remove the provider.
    unprovide()
    await sleep(10)
    expect(disposedCount).toBe(1)

    // Re-provide: dependent should reactivate.
    root.provide('greeter', { greet: () => 'hi again' })
    await sleep(10)
    expect(activeCount).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// 3. Effects disposed in REVERSE registration order on unload; a throwing
//    disposer does not stop later disposers. Observe error aggregation.
// ---------------------------------------------------------------------------
describe('3. disposal order and error handling', () => {
  test('spec: multiple ctx.effect() registrations dispose in reverse order and a throwing disposer does not block the rest', async () => {
    const root = new Context()
    const order: number[] = []
    let fiber: any

    root.plugin({
      name: 'multi-effect',
      apply(ctx: any) {
        fiber = ctx.fiber
        ctx.effect(() => () => {
          order.push(1)
        })
        ctx.effect(() => () => {
          order.push(2)
          throw new Error('boom-from-disposer-2')
        })
        ctx.effect(() => () => {
          order.push(3)
        })
      },
    })

    await sleep(10)
    await fiber.dispose()
    await sleep(10)

    // Spec requires strict reverse-of-registration order: [3, 2, 1].
    expect(order).toEqual([3, 2, 1])
  })

  test('observed: cordis disposes top-level effects concurrently via Promise.all (DisposableList.clear() reverses the array, then dispose() calls are dispatched together); a throwing disposer is individually caught and logged, not aggregated, and does not stop the others', async () => {
    const root = new Context()
    const order: number[] = []
    let fiber: any
    const loggedErrors: any[] = []

    root.plugin({
      name: 'multi-effect-observed',
      apply(ctx: any) {
        fiber = ctx.fiber
        const origError = ctx.logger.error.bind(ctx.logger)
        ctx.logger.error = (...args: any[]) => {
          loggedErrors.push(args)
        }
        ctx.effect(() => () => {
          order.push(1)
        })
        ctx.effect(() => () => {
          order.push(2)
          throw new Error('boom-from-disposer-2')
        })
        ctx.effect(() => () => {
          order.push(3)
        })
      },
    })

    await sleep(10)
    await fiber.dispose()
    await sleep(10)

    // All three disposers ran (nothing was blocked by the thrown error).
    expect(order.sort()).toEqual([1, 2, 3])
    // The thrown error was not aggregated into anything cordis surfaced to
    // the caller of dispose(); it was routed to ctx.logger.error instead.
    expect(loggedErrors.length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// 4. Partial setup failure: activation that registers effects then throws
//    leaves no effects and publishes no service.
// ---------------------------------------------------------------------------
describe('4. partial setup failure rolls back', () => {
  test('effects registered before a synchronous throw in apply() are disposed, and no service remains published', async () => {
    const root = new Context()
    let torndown = false

    root.plugin({
      name: 'partial-failure',
      apply(ctx: any) {
        ctx.effect(() => {
          return () => {
            torndown = true
          }
        })
        ctx.provide('flaky', { ok: true })
        throw new Error('activation failed after registering effects')
      },
    })

    await sleep(20)

    expect(torndown).toBe(true)
    expect(root.get('flaky')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 5. Dispose while async activation is pending cleans partial effects; no
//    duplicate active instance.
// ---------------------------------------------------------------------------
describe('5. dispose during pending async activation', () => {
  test('disposing mid-activation cleans up effects registered so far and does not leave two active instances', async () => {
    const root = new Context()
    let instancesStarted = 0
    let instancesCleaned = 0
    let secondEffectError: any = null

    const fiber = root.plugin({
      name: 'slow-activate',
      async apply(ctx: any) {
        instancesStarted += 1
        ctx.effect(() => () => {
          instancesCleaned += 1
        })
        await sleep(50)
        // The activation coroutine is NOT cancelled by dispose(); it resumes
        // here regardless. Registering a further effect against the now-
        // inactive fiber is what actually fails.
        try {
          ctx.effect(() => () => {
            instancesCleaned += 1
          })
        } catch (error) {
          secondEffectError = error
        }
      },
    })

    await sleep(5) // let activation begin (past the initial await Promise.resolve())
    expect(instancesStarted).toBe(1)

    // Dispose while the async apply() is still suspended in its `await sleep(50)`.
    await fiber.dispose()
    await sleep(80)

    // The one effect registered before dispose was cleaned up exactly once.
    expect(instancesCleaned).toBe(1)
    // Activation never restarted / duplicated.
    expect(instancesStarted).toBe(1)
    // Registering a new effect after dispose() fails loudly instead of
    // silently leaking or silently succeeding.
    expect(secondEffectError).toBeInstanceOf(Error)
    expect(String(secondEffectError?.message)).toContain('inactive context')
  })

  test('observed: dispose() does not cancel an in-flight async apply() coroutine; only new ctx.effect() registrations against it are rejected', async () => {
    const root = new Context()
    let reachedAfterSleep = false

    const fiber = root.plugin({
      name: 'slow-activate-observed',
      async apply(ctx: any) {
        await sleep(30)
        // This line runs even though dispose() already completed.
        reachedAfterSleep = true
      },
    })

    await sleep(5)
    await fiber.dispose()
    await sleep(60)

    expect(reachedAfterSleep).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 6. Repeated dispose is idempotent.
// ---------------------------------------------------------------------------
describe('6. repeated dispose is idempotent', () => {
  test('calling fiber.dispose() multiple times does not throw and does not re-run disposers', async () => {
    const root = new Context()
    let disposals = 0
    let fiber: any

    root.plugin({
      name: 'idempotent-dispose',
      apply(ctx: any) {
        fiber = ctx.fiber
        ctx.effect(() => () => {
          disposals += 1
        })
      },
    })

    await sleep(10)

    await fiber.dispose()
    await fiber.dispose()
    await fiber.dispose()
    await sleep(10)

    expect(disposals).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 7. Child/isolated scope service does not leak into sibling or parent.
// ---------------------------------------------------------------------------
describe('7. isolated scope containment', () => {
  test('a service provided in an isolated child context is not visible to a sibling or the parent', async () => {
    const root = new Context()

    const childA = root.isolate('scoped')
    const childB = root.isolate('scoped')

    childA.provide('scoped' as any, 'value-from-A')

    // Sibling isolate must not see A's value.
    expect(childB.get('scoped' as any)).toBeUndefined()
    // Parent must not see the isolated value either.
    expect(root.get('scoped' as any)).toBeUndefined()
    // A sees its own value.
    expect(childA.get('scoped' as any)).toBe('value-from-A')
  })
})
