// Capability invocation through the kernel, with the caller's tenant and the policy decision captured per call.
import { AsyncLocalStorage } from "node:async_hooks";
import type { Json } from "@godspeedai/cognate-events";
import { type InvocationResult, isUnavailable } from "@godspeedai/cognate-kernel-api";
import { type GovernanceEscalation, type Governor, parseTimeoutSeconds } from "./governed-operation.ts";
import type { Component, ComponentHandle, InvocationContext, InvocationFailure, Kernel, Policy, PolicyDecision, SemanticRef } from "@godspeedai/cognate-kernel-api";
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
  /** JSON form of the typed failure, e.g. `{ kind: "denied", reason }`. For "failed" kind, includes `name` (error constructor name) and `details` (error's enumerable properties as string/number/boolean/null). */
  readonly failure: { readonly kind: InvocationFailure["kind"]; readonly [key: string]: Json } | null;
  /** Present when the call was refused because a human approval could satisfy it; the provider did not run. */
  readonly escalation?: GovernanceEscalation;
}

interface Slot {
  /** The capability this slot belongs to: only its own authorization reads or writes the slot. */
  readonly capability: string;
  /** Set once the owning call has been authorized; later authorizations in this async context are nested calls. */
  authorized?: boolean;
  decision?: PolicyDecision;
  /** The approval being relied on, when this call revalidates an approved escalation. */
  approval?: { readonly approvalId: string };
  /** Set by the policy wrapper when authorization escalated to a human approval. */
  escalation?: GovernanceEscalation;
  /** Puts a governed deadline in force for this call (set by `invoke`, called by the policy wrapper). */
  arm?: (milliseconds: number) => void;
}

export class Invoker {
  private readonly slots = new AsyncLocalStorage<Slot>();
  private readonly mounted: { readonly component: Component; readonly handle: ComponentHandle }[] = [];
  private kernel: Kernel | undefined;

  constructor(private readonly governor: Governor) {}

  /**
   * The policy handed to the kernel. The caller's tenant travels in the InvocationContext; this wrapper only
   * captures the decision so it can be recorded with the invocation (spec §32, §33).
   */
  readonly policy: Policy = {
    authorize: async (request) => {
      // The slot belongs to the call `invoke` started. A provider's nested calls run in the same async
      // context, but the approval being relied on was granted for the owning operation only, and the
      // decision, escalation and governed deadline recorded here are the owning call's. A nested call is
      // governed on its own: no approval, no writes to the owner's slot.
      const outer = this.slots.getStore();
      const slot = outer && !outer.authorized && outer.capability === request.capability.id ? outer : undefined;
      if (slot) slot.authorized = true;
      const decision = await this.governor.governCapability(request, {
        ...(slot?.approval ? { approval: slot.approval } : {}),
        applied: (applied) => {
          const seconds = applied.map((c) => (c.type === "timeout_secs" ? parseTimeoutSeconds(c.value) : undefined)).filter((n): n is number => n !== undefined);
          if (seconds.length && slot?.arm) slot.arm(Math.min(...seconds) * 1000);
        },
        escalated: (escalation) => {
          if (slot) slot.escalation = escalation;
        },
      });
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

  async invoke(request: { readonly capability: string; readonly version?: string; readonly input: Json; readonly tenant: string; readonly context: InvocationContext; readonly approval?: { readonly approvalId: string } }): Promise<InvocationOutcome> {
    const lease = this.kernel!.resolve(request.version ? { capability: request.capability, version: request.version } : { capability: request.capability });
    const base = { capability: request.capability, providerId: null, componentId: null, fiberId: null, decision: null, semanticRef: null, value: null };
    if (isUnavailable(lease)) return { ...base, ok: false, failure: { kind: "unavailable", reason: lease.reason } };

    const slot: Slot = request.approval ? { capability: request.capability, approval: request.approval } : { capability: request.capability };
    // The call gets its own signal so a governed deadline (decided during authorization, after the call has
    // started) can abort the provider; the caller's signal still aborts it too.
    const controller = new AbortController();
    const upstream = request.context.signal;
    if (upstream) {
      if (upstream.aborted) controller.abort(upstream.reason);
      else upstream.addEventListener("abort", () => controller.abort(upstream.reason), { once: true });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const governedDeadline = new Promise<InvocationResult<unknown>>((resolve) => {
      slot.arm = (milliseconds) => {
        timer = setTimeout(() => {
          controller.abort(new Error("governed timeout_secs exceeded"));
          resolve({ ok: false, failure: { kind: "deadline_exceeded" } });
        }, milliseconds);
      };
    });
    const invocation = this.slots.run(slot, () => lease.invoke(request.input, { ...request.context, tenant: request.tenant, signal: controller.signal }));
    invocation.catch(() => {});
    const result = await Promise.race([invocation, governedDeadline]).finally(() => clearTimeout(timer));
    const provider = this.providerOf(lease.providerId, request.capability);
    const common = { ...base, providerId: lease.providerId, ...provider, semanticRef: lease.contract.semanticRef ?? null, ...(slot.escalation ? { escalation: slot.escalation } : {}) };
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
    case "failed": {
      const result: Record<string, Json> = {
        kind: failure.kind,
        message: messageOf(failure.error),
      };
      if (failure.error instanceof Error) {
        result.name = failure.error.name;
        const details: Record<string, Json> = {};
        for (const [key, value] of Object.entries(failure.error)) {
          if (key !== "message" && key !== "stack") {
            if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
              details[key] = value;
            }
          }
        }
        if (Object.keys(details).length > 0) {
          result.details = details;
        }
      }
      return result as NonNullable<InvocationOutcome["failure"]>;
    }
    default:
      return { kind: failure.kind };
  }
}
