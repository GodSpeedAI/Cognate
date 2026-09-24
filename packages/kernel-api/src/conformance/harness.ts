import { allowCapabilities } from "../policy.ts";
import type {
  CapabilityContract,
  Component,
  InvocationContext,
  Kernel,
  KernelEvent,
  KernelFactory,
  Policy,
  Principal,
} from "../types.ts";

export const system: Principal = { id: "system", kind: "system" };
export const alice: Principal = { id: "alice", kind: "user" };

export function contract(id: string, version = "1.0.0", attributes?: CapabilityContract["attributes"]): CapabilityContract {
  return attributes ? { id, version, attributes } : { id, version };
}

export function invocation(overrides: Partial<InvocationContext> = {}): InvocationContext {
  return { actor: alice, correlationId: "corr-1", ...overrides };
}

/** A kernel plus a recorded event log, closed after each test by the suite. */
export interface Harness {
  kernel: Kernel;
  events: KernelEvent[];
  /** Ordered record of side effects performed by test components (setup/teardown markers). */
  log: string[];
}

export async function harness(factory: KernelFactory, policy: Policy = allowCapabilities("test-allow", ["*"])): Promise<Harness> {
  const kernel = await factory({ tenant: "tenant-a", principal: system, policy });
  const events: KernelEvent[] = [];
  kernel.observe((event) => events.push(event));
  return { kernel, events, log: [] };
}

/** Policy that allows every capability (tests that are not about authority). */
export const allowAll: Policy = {
  authorize: () => ({ allow: true, policyId: "allow-all", reason: "test" }),
};

/** A pure provider: provides `id` and records setup/teardown in the log. */
export function provider(h: Harness, name: string, capability: CapabilityContract, handler: (input: unknown) => unknown = (input) => ({ from: name, input })): Component {
  return {
    id: name,
    provides: [capability],
    activate(fiber) {
      h.log.push(`${name}:up`);
      fiber.effects.register(() => void h.log.push(`${name}:down`), `${name}-marker`);
      fiber.provide(capability, (input) => handler(input));
    },
  };
}

/** A consumer requiring the given capabilities under `dep0..n` names. */
export function consumer(h: Harness, name: string, requires: Component["requires"], provides: CapabilityContract[] = []): Component {
  return {
    id: name,
    requires,
    provides,
    activate(fiber) {
      h.log.push(`${name}:up`);
      fiber.effects.register(() => void h.log.push(`${name}:down`), `${name}-marker`);
      for (const capability of provides) fiber.provide(capability, () => name);
    },
  };
}

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Wait until `predicate` holds or fail after `timeoutMs`. */
export async function until(predicate: () => boolean, timeoutMs = 2000, what = "condition"): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await delay(2);
  }
}
