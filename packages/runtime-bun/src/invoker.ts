// Capability invocation through the kernel, with the caller's tenant and the policy decision captured per call.
import { AsyncLocalStorage } from "node:async_hooks";
import type { Json } from "@cognate/events";
import { isUnavailable } from "@cognate/kernel-api";
import type { Component, ComponentHandle, InvocationContext, InvocationFailure, Kernel, Policy, PolicyDecision, SemanticRef } from "@cognate/kernel-api";
import { messageOf, toJson } from "./fold.ts";

export interface InvocationOutcome {
  readonly capability: string;
  readonly providerId: string | null;
  readonly componentId: string | null;
  readonly fiberId: string | null;
  readonly decision: PolicyDecision | null;
  readonly semanticRef: SemanticRef | null;
  readonly ok: boolean;
  readonly value: Json;
  /** JSON form of the typed failure, e.g. `{ kind: "denied", reason }`. */
  readonly failure: { readonly kind: InvocationFailure["kind"]; readonly [key: string]: Json } | null;
}

interface Slot {
  readonly tenant: string;
  decision?: PolicyDecision;
}

export class Invoker {
  private readonly slots = new AsyncLocalStorage<Slot>();
  private readonly mounted: { readonly component: Component; readonly handle: ComponentHandle }[] = [];
  private kernel: Kernel | undefined;

  constructor(private readonly userPolicy: Policy) {}

  /**
   * The policy handed to the kernel. The kernel is single-tenant; the wrapper substitutes the tenant of the
   * current invocation and captures the decision so it can be recorded with the invocation (spec §32, §33).
   */
  readonly policy: Policy = {
    authorize: async (request) => {
      const slot = this.slots.getStore();
      const decision = await this.userPolicy.authorize(slot ? { ...request, tenant: slot.tenant } : request);
      if (slot) slot.decision = decision;
      return decision;
    },
  };

  async attach(kernel: Kernel, components: readonly Component[]): Promise<void> {
    this.kernel = kernel;
    for (const component of components) {
      const handle = await kernel.mount(component);
      this.mounted.push({ component, handle });
    }
    // A component that fails to activate leaves its capabilities unavailable; it does not stop the runtime.
    await Promise.all(this.mounted.map(({ handle }) => handle.waitFor("ACTIVE", 10_000).catch(() => {})));
  }

  async invoke(request: { readonly capability: string; readonly version?: string; readonly input: Json; readonly tenant: string; readonly context: InvocationContext }): Promise<InvocationOutcome> {
    const lease = this.kernel!.resolve(request.version ? { capability: request.capability, version: request.version } : { capability: request.capability });
    const base = { capability: request.capability, providerId: null, componentId: null, fiberId: null, decision: null, semanticRef: null, value: null };
    if (isUnavailable(lease)) return { ...base, ok: false, failure: { kind: "unavailable", reason: lease.reason } };

    const slot: Slot = { tenant: request.tenant };
    const result = await this.slots.run(slot, () => lease.invoke(request.input, request.context));
    const provider = this.providerOf(lease.providerId, request.capability);
    const common = { ...base, providerId: lease.providerId, ...provider, semanticRef: lease.contract.semanticRef ?? null };
    if (result.ok) return { ...common, decision: slot.decision ?? null, ok: true, value: toJson(result.value), failure: null };
    const failure = result.failure;
    const decision = failure.kind === "denied" ? failure.decision : (slot.decision ?? null);
    return { ...common, decision, ok: false, failure: failureJson(failure) };
  }

  /** Provider fiber and component, from mounted handles (kernel-api only; no engine types). */
  private providerOf(providerId: string, capability: string): { componentId: string | null; fiberId: string | null } {
    const byFiber = this.mounted.find(({ handle }) => handle.fiberId === providerId);
    const match = byFiber ?? this.mounted.find(({ component }) => component.provides?.some((c) => c.id === capability));
    return { componentId: match?.component.id ?? null, fiberId: match?.handle.fiberId ?? providerId };
  }
}

function failureJson(failure: InvocationFailure): NonNullable<InvocationOutcome["failure"]> {
  switch (failure.kind) {
    case "unavailable":
      return { kind: failure.kind, reason: failure.reason };
    case "denied":
      return { kind: failure.kind, policyId: failure.decision.policyId, reason: failure.decision.reason };
    case "failed":
      return { kind: failure.kind, message: messageOf(failure.error) };
    default:
      return { kind: failure.kind };
  }
}
