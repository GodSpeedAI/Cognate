// Kernel conformance kit. Every kernel engine adapter must pass every suite unchanged.
import { afterEach, describe, expect, test } from "bun:test";
import { CleanupError, PermanentActivationError, UndeclaredCapabilityError } from "../errors.ts";
import { isUnavailable } from "../index.ts";
import { denyAll } from "../policy.ts";
import type { CapabilityLease, ComponentHandle, KernelFactory, Policy } from "../types.ts";
import { alice, allowAll, consumer, contract, delay, type Harness, harness, invocation, provider, until } from "./harness.ts";

function lifecycleOf(factory: KernelFactory, policy: Policy = allowAll) {
  const open: Harness[] = [];
  afterEach(async () => {
    for (const h of open.splice(0)) await h.kernel.shutdown("test end").catch(() => {});
  });
  return async (p: Policy = policy) => {
    const h = await harness(factory, p);
    open.push(h);
    return h;
  };
}

const lease = (value: unknown): CapabilityLease => {
  if (isUnavailable(value as never)) throw new Error("expected a lease");
  return value as CapabilityLease;
};

/** §8.5 operations and failure semantics. Gate: CG-KRN-001. */
export function contractSuite(name: string, factory: KernelFactory): void {
  describe(`${name}: kernel contract (§8.5)`, () => {
    const make = lifecycleOf(factory);

    test("a component without requirements activates and exposes a fiber", async () => {
      const h = await make();
      const handle = await h.kernel.mount(provider(h, "a", contract("x.read")));
      await handle.waitFor("ACTIVE");
      expect(handle.state).toBe("ACTIVE");
      expect(handle.fiberId).toBeString();
      expect(h.log).toEqual(["a:up"]);
    });

    test("missing dependencies keep a component WAITING with no fiber", async () => {
      const h = await make();
      const handle = await h.kernel.mount(consumer(h, "b", { dep: { capability: "x.read" } }));
      await delay(20);
      expect(handle.state).toBe("WAITING");
      expect(handle.fiberId).toBeUndefined();
      expect(h.log).toEqual([]);
    });

    test("resolve returns Unavailable, then a lease once provided, without consulting policy", async () => {
      let consulted = 0;
      const h = await make({ authorize: () => (consulted++, { allow: true, policyId: "p", reason: "r" }) });
      expect(isUnavailable(h.kernel.resolve({ capability: "x.read" }))).toBe(true);
      await (await h.kernel.mount(provider(h, "a", contract("x.read")))).waitFor("ACTIVE");
      const resolved = lease(h.kernel.resolve({ capability: "x.read" }));
      expect(resolved.valid).toBe(true);
      expect(resolved.contract.id).toBe("x.read");
      expect(consulted).toBe(0);
    });

    test("invoke passes input and full handler context and returns an ok result", async () => {
      const h = await make();
      let seen: Record<string, unknown> = {};
      await (
        await h.kernel.mount({
          id: "a",
          provides: [contract("x.read")],
          activate(fiber) {
            fiber.provide(contract("x.read"), (input, ctx) => {
              seen = { actor: ctx.actor.id, correlationId: ctx.correlationId, providerId: ctx.providerId, tenant: ctx.tenant, allow: ctx.decision.allow, aborted: ctx.signal.aborted };
              return { echo: input };
            });
          },
        })
      ).waitFor("ACTIVE");
      const result = await lease(h.kernel.resolve({ capability: "x.read" })).invoke({ n: 1 }, invocation());
      expect(result).toEqual({ ok: true, value: { echo: { n: 1 } } });
      expect(seen).toMatchObject({ actor: "alice", correlationId: "corr-1", tenant: "tenant-a", allow: true, aborted: false });
      expect(seen.providerId).toBeString();
    });

    test("a handler error is a typed failed result, not a thrown exception", async () => {
      const h = await make();
      await (await h.kernel.mount(provider(h, "a", contract("x.read"), () => { throw new Error("boom"); }))).waitFor("ACTIVE");
      const result = await lease(h.kernel.resolve({ capability: "x.read" })).invoke(null, invocation());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.kind).toBe("failed");
      }
    });

    test("a deadline yields deadline_exceeded and aborts the handler signal", async () => {
      const h = await make();
      let aborted = false;
      await (
        await h.kernel.mount({
          id: "slow",
          provides: [contract("x.slow")],
          activate(fiber) {
            fiber.provide(contract("x.slow"), async (_input, ctx) => {
              await delay(200);
              aborted = ctx.signal.aborted;
              return "late";
            });
          },
        })
      ).waitFor("ACTIVE");
      const result = await lease(h.kernel.resolve({ capability: "x.slow" })).invoke(null, invocation({ deadline: Date.now() + 20 }));
      expect(result).toEqual({ ok: false, failure: { kind: "deadline_exceeded" } });
      await until(() => aborted, 1000, "handler to observe abort");
    });

    test("caller cancellation yields cancelled", async () => {
      const h = await make();
      await (await h.kernel.mount(provider(h, "a", contract("x.wait"), () => delay(200)))).waitFor("ACTIVE");
      const controller = new AbortController();
      const pending = lease(h.kernel.resolve({ capability: "x.wait" })).invoke(null, invocation({ signal: controller.signal }));
      controller.abort();
      expect(await pending).toEqual({ ok: false, failure: { kind: "cancelled" } });
    });

    test("providing an undeclared capability fails activation and publishes nothing", async () => {
      const h = await make();
      const handle = await h.kernel.mount({
        id: "liar",
        provides: [contract("x.declared")],
        retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
        activate(fiber) {
          fiber.provide(contract("x.undeclared"), () => 1);
        },
      });
      await handle.waitFor("FAILED");
      expect(handle.lastError).toBeInstanceOf(UndeclaredCapabilityError);
      expect(isUnavailable(h.kernel.resolve({ capability: "x.undeclared" }))).toBe(true);
      expect(isUnavailable(h.kernel.resolve({ capability: "x.declared" }))).toBe(true);
    });

    test("dispose is idempotent and ends DISPOSED; the lease becomes unavailable", async () => {
      const h = await make();
      const handle = await h.kernel.mount(provider(h, "a", contract("x.read")));
      await handle.waitFor("ACTIVE");
      const held = lease(h.kernel.resolve({ capability: "x.read" }));
      await handle.dispose("done");
      await handle.dispose("again");
      expect(handle.state).toBe("DISPOSED");
      expect(h.log).toEqual(["a:up", "a:down"]);
      expect(held.valid).toBe(false);
      const result = await held.invoke(null, invocation());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.kind).toBe("unavailable");
    });

    test("an effect handle can be disposed early exactly once", async () => {
      const h = await make();
      let runs = 0;
      let handleRef: { dispose(): Promise<void>; disposed: boolean } | undefined;
      const handle = await h.kernel.mount({
        id: "e",
        activate(fiber) {
          handleRef = fiber.effects.register(() => void runs++, "counter");
        },
      });
      await handle.waitFor("ACTIVE");
      await handleRef!.dispose();
      await handleRef!.dispose();
      expect(handleRef!.disposed).toBe(true);
      await handle.dispose("done");
      expect(runs).toBe(1);
    });

    test("closing a scope disposes its components", async () => {
      const h = await make();
      const scope = h.kernel.root.child({ id: "s1" });
      const handle = await h.kernel.mount(provider(h, "a", contract("x.read")), scope);
      await handle.waitFor("ACTIVE");
      await scope.close("done");
      expect(scope.closed).toBe(true);
      expect(handle.state).toBe("DISPOSED");
      expect(h.log).toEqual(["a:up", "a:down"]);
    });

    test("a component definition is independent of its occurrences (§8.3)", async () => {
      const h1 = await make();
      const h2 = await make();
      const registry: string[] = [];
      let activations = 0;
      const definition: import("../types.ts").Component = {
        id: "shared-definition",
        provides: [contract("x.shared")],
        activate(fiber) {
          activations++;
          registry.push(fiber.fiberId);
          fiber.effects.register(() => void registry.splice(registry.indexOf(fiber.fiberId), 1), "entry");
          fiber.provide(contract("x.shared"), () => fiber.fiberId);
        },
      };
      const a = h1.kernel.root.child({ id: "a" });
      const b = h1.kernel.root.child({ id: "b" });
      const occurrences = [await h1.kernel.mount(definition, a), await h1.kernel.mount(definition, b), await h2.kernel.mount(definition)];
      for (const o of occurrences) await o.waitFor("ACTIVE");
      expect(activations).toBe(3);
      expect(new Set(occurrences.map((o) => o.fiberId)).size).toBe(3);
      await occurrences[0]!.dispose("one occurrence");
      expect(occurrences.slice(1).map((o) => o.state)).toEqual(["ACTIVE", "ACTIVE"]);
      expect(registry).toEqual([occurrences[1]!.fiberId!, occurrences[2]!.fiberId!]);
      const fromB = lease(h1.kernel.resolve({ capability: "x.shared" }, b));
      expect(await fromB.invoke(null, invocation())).toEqual({ ok: true, value: occurrences[1]!.fiberId });
      expect(isUnavailable(h1.kernel.resolve({ capability: "x.shared" }, a))).toBe(true);
    });

    test("mounting into a closed scope is rejected", async () => {
      const h = await make();
      const scope = h.kernel.root.child();
      await scope.close("done");
      await expect(h.kernel.mount(provider(h, "a", contract("x.read")), scope)).rejects.toThrow();
    });
  });
}

/** §8.4 lifecycle: FAILED, bounded retry, permanent failure, activation races. Gate: CG-KRN-002. */
export function lifecycleSuite(name: string, factory: KernelFactory): void {
  describe(`${name}: fiber lifecycle (§8.4)`, () => {
    const make = lifecycleOf(factory);

    test("a transient activation failure passes through FAILED and retries to ACTIVE", async () => {
      const h = await make();
      let attempts = 0;
      const handle = await h.kernel.mount({
        id: "flaky",
        retry: { maxAttempts: 3, baseDelayMs: 5, maxDelayMs: 20 },
        activate() {
          attempts++;
          if (attempts === 1) throw new Error("transient");
        },
      });
      await handle.waitFor("ACTIVE");
      expect(attempts).toBe(2);
      const states = h.events.filter((e) => e.type === "fiber.state").map((e) => (e.type === "fiber.state" ? e.to : ""));
      expect(states).toEqual(["ACTIVATING", "FAILED", "WAITING", "ACTIVATING", "ACTIVE"]);
    });

    test("a permanent failure stays FAILED until reset", async () => {
      const h = await make();
      let attempts = 0;
      const handle = await h.kernel.mount({
        id: "broken",
        retry: { maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 5 },
        activate() {
          attempts++;
          if (attempts === 1) throw new PermanentActivationError("bad config");
        },
      });
      await handle.waitFor("FAILED");
      await delay(30);
      expect(handle.state).toBe("FAILED");
      expect(attempts).toBe(1);
      expect(handle.lastError).toBeInstanceOf(PermanentActivationError);
      await handle.reset();
      await handle.waitFor("ACTIVE");
      expect(attempts).toBe(2);
    });

    test("retries are bounded: exhausting maxAttempts leaves the component FAILED", async () => {
      const h = await make();
      let attempts = 0;
      const handle = await h.kernel.mount({
        id: "always",
        retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 4 },
        activate() {
          attempts++;
          throw new Error("nope");
        },
      });
      await until(() => attempts === 3, 1000, "three attempts");
      await handle.waitFor("FAILED");
      await delay(30);
      expect(attempts).toBe(3);
      expect(handle.state).toBe("FAILED");
    });

    test("an activation that never settles fails by timeout instead of staying ACTIVATING", async () => {
      const h = await make();
      const handle = await h.kernel.mount({
        id: "hang",
        activationTimeoutMs: 30,
        retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
        activate: () => new Promise<void>(() => {}),
      });
      await handle.waitFor("FAILED", 1000);
      expect(handle.state).toBe("FAILED");
    });

    test("a timed-out activation still disposes the effects it registered before hanging", async () => {
      const h = await make();
      const handle = await h.kernel.mount({
        id: "hang-after-effect",
        activationTimeoutMs: 30,
        retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
        async activate(fiber) {
          fiber.effects.register(() => void h.log.push("partial:down"), "partial");
          await new Promise<void>(() => {});
        },
      });
      await handle.waitFor("FAILED", 1000);
      await until(() => h.log.includes("partial:down"), 1000, "partial effect disposal after timeout");
      expect(h.log).toEqual(["partial:down"]);
    });

    test("dispose during a pending activation wins, cleans partial effects, and publishes nothing", async () => {
      const h = await make();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let aborted = false;
      const handle = await h.kernel.mount({
        id: "racy",
        provides: [contract("x.racy")],
        async activate(fiber) {
          fiber.effects.register(() => void h.log.push("partial:down"), "partial");
          await gate;
          aborted = fiber.signal.aborted;
          fiber.provide(contract("x.racy"), () => 1);
        },
      });
      await handle.waitFor("ACTIVATING");
      const disposing = handle.dispose("race");
      release();
      await disposing.catch(() => {});
      await delay(10);
      expect(handle.state).toBe("DISPOSED");
      expect(aborted).toBe(true);
      expect(h.log).toEqual(["partial:down"]);
      expect(isUnavailable(h.kernel.resolve({ capability: "x.racy" }))).toBe(true);
      expect(h.events.some((e) => e.type === "fiber.state" && e.to === "ACTIVE")).toBe(false);
    });

    test("repeated dependency notifications never create duplicate active instances", async () => {
      const h = await make();
      let activations = 0;
      const handle = await h.kernel.mount({
        id: "dependent",
        requires: { dep: { capability: "x.read" } },
        activate() {
          activations++;
        },
      });
      await Promise.all([
        h.kernel.mount(provider(h, "p1", contract("x.read"))),
        h.kernel.mount(provider(h, "p2", contract("x.read"))),
        h.kernel.mount(provider(h, "p3", contract("x.read"))),
      ]);
      await handle.waitFor("ACTIVE");
      await delay(30);
      expect(activations).toBe(1);
      expect(handle.state).toBe("ACTIVE");
    });
  });
}

/** §9.1 / §31.1 reversible effects. Gate: CG-KRN-003. */
export function effectsSuite(name: string, factory: KernelFactory): void {
  describe(`${name}: reversible effects (§9.1)`, () => {
    const make = lifecycleOf(factory);

    test("disposers run in reverse registration order", async () => {
      const h = await make();
      const handle = await h.kernel.mount({
        id: "ordered",
        activate(fiber) {
          for (const label of ["listener", "tool", "renderer", "timer"]) fiber.effects.register(() => void h.log.push(label), label);
        },
      });
      await handle.waitFor("ACTIVE");
      await handle.dispose("done");
      expect(h.log).toEqual(["timer", "renderer", "tool", "listener"]);
    });

    test("a failing disposer does not stop the others; errors are aggregated once", async () => {
      const h = await make();
      const handle = await h.kernel.mount({
        id: "messy",
        activate(fiber) {
          fiber.effects.register(() => void h.log.push("first"), "first");
          fiber.effects.register(() => { throw new Error("second failed"); }, "second");
          fiber.effects.register(() => void h.log.push("third"), "third");
        },
      });
      await handle.waitFor("ACTIVE");
      const error = await handle.dispose("done").then(() => undefined, (e: unknown) => e);
      expect(error).toBeInstanceOf(CleanupError);
      expect((error as CleanupError).errors).toHaveLength(1);
      expect(h.log).toEqual(["third", "first"]);
      await handle.dispose("again");
      expect(h.log).toEqual(["third", "first"]);
    });

    test("failed setup disposes every effect from that attempt in reverse order", async () => {
      const h = await make();
      const handle = await h.kernel.mount({
        id: "half",
        provides: [contract("x.half")],
        retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
        activate(fiber) {
          fiber.effects.register(() => void h.log.push("a"), "a");
          fiber.effects.register(() => void h.log.push("b"), "b");
          fiber.provide(contract("x.half"), () => 1);
          throw new Error("setup failed");
        },
      });
      await handle.waitFor("FAILED");
      expect(h.log).toEqual(["b", "a"]);
      expect(isUnavailable(h.kernel.resolve({ capability: "x.half" }))).toBe(true);
      expect(h.events.some((e) => e.type === "capability.provided")).toBe(false);
    });

    test("cleanup errors during dependency loss are observable as cleanup.failed", async () => {
      const h = await make();
      const p = await h.kernel.mount(provider(h, "p", contract("x.read")));
      const c = await h.kernel.mount({
        id: "c",
        requires: { dep: { capability: "x.read" } },
        activate(fiber) {
          fiber.effects.register(() => { throw new Error("teardown bug"); }, "bad");
        },
      });
      await c.waitFor("ACTIVE");
      await p.dispose("gone");
      await c.waitFor("WAITING");
      expect(h.events.some((e) => e.type === "cleanup.failed" && e.componentId === "c")).toBe(true);
    });

    test("mount then unmount returns owned observable state to its initial value", async () => {
      const h = await make();
      const registry = new Set<string>();
      const before = [...registry];
      const handle = await h.kernel.mount({
        id: "reg",
        activate(fiber) {
          for (const key of ["listener", "tool", "timer"]) {
            registry.add(key);
            fiber.effects.register(() => void registry.delete(key), key);
          }
        },
      });
      await handle.waitFor("ACTIVE");
      expect(registry.size).toBe(3);
      await handle.dispose("done");
      expect([...registry]).toEqual(before);
    });
  });
}

/** §8.4 / §29.2 / §35 dependency closure and replacement. Gate: CG-KRN-004. */
export function dependenciesSuite(name: string, factory: KernelFactory): void {
  describe(`${name}: dependency closure (§8.4, §35)`, () => {
    const make = lifecycleOf(factory);

    test("provide → activate, remove → deactivate, restore compatible → reactivate on the new provider", async () => {
      const h = await make();
      const b = await h.kernel.mount(consumer(h, "b", { dep: { capability: "customer.read", version: "1.0" } }));
      expect(b.state).toBe("WAITING");
      const a1 = await h.kernel.mount(provider(h, "a1", contract("customer.read", "1.2.0")));
      await b.waitFor("ACTIVE");
      const firstFiber = b.fiberId;
      await a1.dispose("removed");
      await b.waitFor("WAITING");
      expect(b.fiberId).toBeUndefined();
      const a2 = await h.kernel.mount(provider(h, "a2", contract("customer.read", "1.5.0")));
      await b.waitFor("ACTIVE");
      expect(b.fiberId).not.toBe(firstFiber);
      expect(lease(h.kernel.resolve({ capability: "customer.read" })).providerId).toBeString();
      expect(h.log).toEqual(["b:up".replace("b", "a1"), "b:up", "b:down", "a1:down", "a2:up", "b:up"]);
      await a2.dispose("end");
    });

    test("incompatible versions and attributes are not eligible", async () => {
      const h = await make();
      const b = await h.kernel.mount(consumer(h, "b", { dep: { capability: "m.gen", version: "1.2", attributes: { structured_output: true } } }));
      await h.kernel.mount(provider(h, "old", contract("m.gen", "1.1.0", { structured_output: true })));
      await h.kernel.mount(provider(h, "next", contract("m.gen", "2.0.0", { structured_output: true })));
      await h.kernel.mount(provider(h, "plain", contract("m.gen", "1.3.0")));
      await delay(20);
      expect(b.state).toBe("WAITING");
      await h.kernel.mount(provider(h, "good", contract("m.gen", "1.3.0", { structured_output: true })));
      await b.waitFor("ACTIVE");
    });

    test("loss propagates transitively through dependent chains", async () => {
      const h = await make();
      const a = await h.kernel.mount(provider(h, "a", contract("x.a")));
      const b = await h.kernel.mount(consumer(h, "b", { dep: { capability: "x.a" } }, [contract("x.b")]));
      const c = await h.kernel.mount(consumer(h, "c", { dep: { capability: "x.b" } }));
      await c.waitFor("ACTIVE");
      await a.dispose("gone");
      await b.waitFor("WAITING");
      await c.waitFor("WAITING");
      expect(h.log.slice(-3)).toEqual(["c:down", "b:down", "a:down"]);
    });

    test("losing the bound provider while another compatible one remains rebinds to it", async () => {
      const h = await make();
      const p1 = await h.kernel.mount(provider(h, "p1", contract("x.read")));
      await p1.waitFor("ACTIVE");
      const p2 = await h.kernel.mount(provider(h, "p2", contract("x.read")));
      await p2.waitFor("ACTIVE");
      let bound: CapabilityLease | undefined;
      const b = await h.kernel.mount({
        id: "b",
        requires: { dep: { capability: "x.read" } },
        activate(fiber) {
          bound = fiber.dependencies.dep;
        },
      });
      await b.waitFor("ACTIVE");
      const first = bound!;
      const firstResult = await first.invoke(null, invocation());
      const firstFrom = firstResult.ok ? (firstResult.value as { from: string }).from : "";
      await (firstFrom === "p1" ? p1 : p2).dispose("gone");
      await until(() => b.state === "ACTIVE" && bound !== first, 1000, "rebinding");
      const second = await bound!.invoke(null, invocation());
      expect(second.ok).toBe(true);
      if (second.ok) expect((second.value as { from: string }).from).toBe(firstFrom === "p1" ? "p2" : "p1");
    });
  });
}

/** §8.1 / §32 scope isolation. Gate: CG-KRN-005. */
export function scopesSuite(name: string, factory: KernelFactory): void {
  describe(`${name}: scope isolation (§8.1)`, () => {
    const make = lifecycleOf(factory);

    test("a child-provided capability is invisible to parent and siblings, visible to descendants", async () => {
      const h = await make();
      const child = h.kernel.root.child({ id: "child" });
      const sibling = h.kernel.root.child({ id: "sibling" });
      const grandchild = child.child({ id: "grandchild" });
      await (await h.kernel.mount(provider(h, "p", contract("x.secret")), child)).waitFor("ACTIVE");
      expect(isUnavailable(h.kernel.resolve({ capability: "x.secret" }, h.kernel.root))).toBe(true);
      expect(isUnavailable(h.kernel.resolve({ capability: "x.secret" }, sibling))).toBe(true);
      expect(isUnavailable(h.kernel.resolve({ capability: "x.secret" }, grandchild))).toBe(false);
      const siblingConsumer = await h.kernel.mount(consumer(h, "s", { dep: { capability: "x.secret" } }), sibling);
      await delay(20);
      expect(siblingConsumer.state).toBe("WAITING");
    });

    test("parent-provided capabilities are visible in children", async () => {
      const h = await make();
      await (await h.kernel.mount(provider(h, "p", contract("x.shared")))).waitFor("ACTIVE");
      const child = h.kernel.root.child();
      const c = await h.kernel.mount(consumer(h, "c", { dep: { capability: "x.shared" } }), child);
      await c.waitFor("ACTIVE");
    });

    test("a child may narrow its principal without changing the parent", async () => {
      const h = await make();
      const child = h.kernel.root.child({ principal: alice });
      expect(child.principal.id).toBe("alice");
      expect(h.kernel.root.principal.id).toBe("system");
      expect(child.tenant).toBe(h.kernel.root.tenant);
      expect(child.parentId).toBe(h.kernel.root.id);
    });

    test("closing a parent closes children before parent effects", async () => {
      const h = await make();
      const parent = h.kernel.root.child({ id: "parent" });
      const child = parent.child({ id: "child" });
      await (await h.kernel.mount(provider(h, "outer", contract("x.outer")), parent)).waitFor("ACTIVE");
      await (await h.kernel.mount(provider(h, "inner", contract("x.inner")), child)).waitFor("ACTIVE");
      await parent.close("done");
      expect(child.closed).toBe(true);
      expect(h.log).toEqual(["outer:up", "inner:up", "inner:down", "outer:down"]);
    });

    test("closing a child leaves the parent's components active", async () => {
      const h = await make();
      const outer = await h.kernel.mount(provider(h, "outer", contract("x.outer")));
      await outer.waitFor("ACTIVE");
      const child = h.kernel.root.child();
      await (await h.kernel.mount(provider(h, "inner", contract("x.inner")), child)).waitFor("ACTIVE");
      await child.close("done");
      expect(outer.state).toBe("ACTIVE");
    });
  });
}

/** §8.5 / §32 authority. Gate: CG-KRN-006. */
export function authoritySuite(name: string, factory: KernelFactory): void {
  describe(`${name}: authority (§32)`, () => {
    const make = lifecycleOf(factory);

    test("default-deny policy denies invocation without calling the handler", async () => {
      const h = await make(denyAll);
      let called = false;
      await (await h.kernel.mount(provider(h, "p", contract("x.pay"), () => (called = true)))).waitFor("ACTIVE");
      const result = await lease(h.kernel.resolve({ capability: "x.pay" })).invoke(null, invocation());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.kind).toBe("denied");
      }
      expect(called).toBe(false);
    });

    test("policy receives actor, tenant, scope, capability, and provider for each invocation", async () => {
      const requests: unknown[] = [];
      const h = await make({ authorize: (r) => (requests.push(r), { allow: true, policyId: "p", reason: "ok" }) });
      const scope = h.kernel.root.child({ id: "ws" });
      await (await h.kernel.mount(provider(h, "p", contract("x.read")), scope)).waitFor("ACTIVE");
      const l = lease(h.kernel.resolve({ capability: "x.read" }, scope));
      await l.invoke(null, invocation());
      await l.invoke(null, invocation({ correlationId: "corr-2" }));
      expect(requests).toHaveLength(2);
      expect(requests[0]).toMatchObject({ operation: "invoke", actor: { id: "alice" }, tenant: "tenant-a", scopeId: "ws", capability: { id: "x.read" }, providerId: l.providerId, correlationId: "corr-1" });
    });

    test("the caller's tenant reaches both the policy and the handler", async () => {
      const seen: string[] = [];
      const h = await make({ authorize: (r) => (seen.push(`policy:${r.tenant}`), { allow: true, policyId: "p", reason: "ok" }) });
      await (
        await h.kernel.mount({ id: "t", provides: [contract("x.tenant")], activate: (f) => f.provide(contract("x.tenant"), (_i, ctx) => void seen.push(`handler:${ctx.tenant}`)) })
      ).waitFor("ACTIVE");
      const l = lease(h.kernel.resolve({ capability: "x.tenant" }));
      await l.invoke(null, invocation({ tenant: "tenant-b" }));
      await l.invoke(null, invocation());
      expect(seen).toEqual(["policy:tenant-b", "handler:tenant-b", "policy:tenant-a", "handler:tenant-a"]);
    });

    test("every invocation emits an auditable decision event", async () => {
      const h = await make(denyAll);
      await (await h.kernel.mount(provider(h, "p", contract("x.pay")))).waitFor("ACTIVE");
      await lease(h.kernel.resolve({ capability: "x.pay" })).invoke(null, invocation({ correlationId: "audit-1" }));
      const audit = h.events.find((e) => e.type === "invocation");
      expect(audit).toMatchObject({ type: "invocation", capability: "x.pay", correlationId: "audit-1", decision: { allow: false, policyId: "deny-all" } });
    });

    test("a revoked lease yields unavailable before any policy check", async () => {
      let consulted = 0;
      const h = await make({ authorize: () => (consulted++, { allow: true, policyId: "p", reason: "r" }) });
      const handle: ComponentHandle = await h.kernel.mount(provider(h, "p", contract("x.read")));
      await handle.waitFor("ACTIVE");
      const l = lease(h.kernel.resolve({ capability: "x.read" }));
      await handle.dispose("revoked");
      const result = await l.invoke(null, invocation());
      expect(result).toMatchObject({ ok: false, failure: { kind: "unavailable" } });
      expect(consulted).toBe(0);
    });
  });
}
