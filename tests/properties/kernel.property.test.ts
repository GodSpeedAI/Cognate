// CG-KRN-008 (spec §34.2): reversibility, dependency closure, scope isolation, and disposal idempotence
// over arbitrary component graphs and appearance/removal sequences, against the reference engine.
import { expect, test } from "bun:test";
import fc from "fast-check";
import { isUnavailable, type ComponentHandle, type Kernel } from "@cognate/kernel-api";
import { createCordisKernel } from "@cognate/kernel-cordis";

const allow = { authorize: () => ({ allow: true, policyId: "p", reason: "test" }) };
const settle = () => Bun.sleep(5);

async function kernel(): Promise<Kernel> {
  return createCordisKernel({ tenant: "t", principal: { id: "system", kind: "system" }, policy: allow });
}

/** Component i provides `cap.i` and requires a subset of lower-numbered capabilities (a DAG). */
const graphArb = fc.integer({ min: 1, max: 7 }).chain((n) =>
  fc.tuple(fc.constant(n), fc.array(fc.subarray(Array.from({ length: n }, (_, i) => i)), { minLength: n, maxLength: n })).map(([size, deps]) => deps.map((d, i) => d.filter((j) => j < i)).slice(0, size)),
);

test("reversibility: mounting then disposing reversible components restores owned state", async () => {
  await fc.assert(
    fc.asyncProperty(graphArb, fc.array(fc.nat(20), { maxLength: 30 }), async (deps, order) => {
      const k = await kernel();
      const registry = new Set<string>();
      const handles: ComponentHandle[] = [];
      for (let i = 0; i < deps.length; i++) {
        handles.push(
          await k.mount({
            id: `c${i}`,
            requires: Object.fromEntries(deps[i]!.map((j) => [`d${j}`, { capability: `cap.${j}` }])),
            provides: [{ id: `cap.${i}`, version: "1.0.0" }],
            activate(fiber) {
              for (const key of [`listener.${i}`, `timer.${i}`]) {
                registry.add(key);
                fiber.effects.register(() => void registry.delete(key), key);
              }
              fiber.provide({ id: `cap.${i}`, version: "1.0.0" }, () => i);
            },
          }),
        );
      }
      await settle();
      expect(handles.every((h) => h.state === "ACTIVE")).toBe(true);
      for (const index of order) await handles[index % handles.length]!.dispose("p").catch(() => {});
      for (const h of handles) await h.dispose("p");
      expect([...registry]).toEqual([]);
      await k.shutdown("end");
    }),
    { numRuns: 60 },
  );
}, 60_000);

test("dependency closure: after any removal sequence, no component is ACTIVE without its providers", async () => {
  await fc.assert(
    fc.asyncProperty(graphArb, fc.array(fc.tuple(fc.nat(20), fc.boolean()), { maxLength: 25 }), async (deps, ops) => {
      const k = await kernel();
      const mountProvider = (i: number) =>
        k.mount({
          id: `c${i}`,
          requires: Object.fromEntries(deps[i]!.map((j) => [`d${j}`, { capability: `cap.${j}` }])),
          provides: [{ id: `cap.${i}`, version: "1.0.0" }],
          activate: (fiber) => fiber.provide({ id: `cap.${i}`, version: "1.0.0" }, () => i),
        });
      const handles = new Map<number, ComponentHandle>();
      for (let i = 0; i < deps.length; i++) handles.set(i, await mountProvider(i));
      for (const [raw, remove] of ops) {
        const i = raw % deps.length;
        if (remove) await handles.get(i)!.dispose("remove").catch(() => {});
        else if (handles.get(i)!.state === "DISPOSED") handles.set(i, await mountProvider(i));
        await settle();
        for (const [index, handle] of handles) {
          if (handle.state !== "ACTIVE") continue;
          for (const j of deps[index]!) expect(handles.get(j)!.state).toBe("ACTIVE");
        }
      }
      await k.shutdown("end");
    }),
    { numRuns: 50 },
  );
}, 60_000);

test("scope isolation: capabilities provided in random child scopes are visible only to descendants", async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(fc.nat(5), { minLength: 1, maxLength: 6 }), async (parents) => {
      const k = await kernel();
      const scopes = [k.root];
      for (const p of parents) scopes.push(scopes[p % scopes.length]!.child());
      const ancestry = (s: number): number[] => {
        const chain = [s];
        let cursor = scopes[s]!;
        while (cursor.parentId) {
          const index = scopes.findIndex((x) => x.id === cursor.parentId);
          chain.push(index);
          cursor = scopes[index]!;
        }
        return chain;
      };
      for (let s = 1; s < scopes.length; s++) {
        await (await k.mount({ id: `p${s}`, provides: [{ id: `cap.s${s}`, version: "1.0.0" }], activate: (f) => f.provide({ id: `cap.s${s}`, version: "1.0.0" }, () => s) }, scopes[s])).waitFor("ACTIVE");
      }
      for (let viewer = 0; viewer < scopes.length; viewer++) {
        for (let s = 1; s < scopes.length; s++) {
          const visible = !isUnavailable(k.resolve({ capability: `cap.s${s}` }, scopes[viewer]));
          expect(visible).toBe(ancestry(viewer).includes(s));
        }
      }
      await k.shutdown("end");
    }),
    { numRuns: 60 },
  );
}, 60_000);

test("disposal idempotence: repeated and concurrent disposal runs each disposer once", async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 1, max: 6 }), fc.integer({ min: 1, max: 5 }), async (effects, repeats) => {
      const k = await kernel();
      const runs = new Map<number, number>();
      const handle = await k.mount({ id: "e", activate: (f) => { for (let i = 0; i < effects; i++) f.effects.register(() => void runs.set(i, (runs.get(i) ?? 0) + 1)); } });
      await handle.waitFor("ACTIVE");
      await Promise.all(Array.from({ length: repeats }, () => handle.dispose("again").catch(() => {})));
      await handle.dispose("final");
      expect([...runs.values()]).toEqual(Array.from({ length: effects }, () => 1));
      await k.shutdown("end");
    }),
    { numRuns: 60 },
  );
}, 60_000);
