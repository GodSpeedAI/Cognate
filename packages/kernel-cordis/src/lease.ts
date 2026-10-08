// Cordis has no first-class lease object (ADR-0001 consequence): a lease here is a Cognate-owned
// wrapper bound to one resolved provider, revalidated on every invocation against `isValid` (the
// fiber-owned flag flipped the instant that provider's Cordis fiber leaves ACTIVE), never against
// Cordis's own service-availability signal directly.
import type {
  AuthorizationRequest,
  CapabilityContract,
  CapabilityHandler,
  CapabilityLease,
  HandlerContext,
  InvocationContext,
  InvocationFailure,
  InvocationResult,
  KernelEvent,
  Policy,
} from "@godspeedai/kernel-api";

export interface BoundProvider {
  readonly contract: CapabilityContract;
  readonly providerId: string;
  readonly scopeId: string;
  readonly handler: CapabilityHandler;
  /** Aborted the instant the providing fiber leaves ACTIVE (ADR mitigation: Cordis provides no cancellation signal itself). */
  readonly teardownSignal: AbortSignal;
}

export function createLease(
  provider: BoundProvider,
  tenant: string,
  policy: Policy,
  isValid: () => boolean,
  emit: (event: KernelEvent) => void,
): CapabilityLease {
  return {
    contract: provider.contract,
    providerId: provider.providerId,
    get valid() {
      return isValid();
    },
    invoke: (input, context) => invoke(provider, tenant, policy, isValid, emit, input, context),
  };
}

async function invoke(
  provider: BoundProvider,
  tenant: string,
  policy: Policy,
  isValid: () => boolean,
  emit: (event: KernelEvent) => void,
  input: unknown,
  context: InvocationContext,
): Promise<InvocationResult<unknown>> {
  if (!isValid()) return unavailable(provider.contract.id);

  // Spec §32: authorization and handlers see the caller's tenant, not the kernel's.
  const callerTenant = context.tenant ?? tenant;
  const request: AuthorizationRequest = {
    operation: "invoke",
    actor: context.actor,
    tenant: callerTenant,
    scopeId: provider.scopeId,
    capability: provider.contract,
    providerId: provider.providerId,
    correlationId: context.correlationId,
  };
  const decision = await policy.authorize(request);
  emit({ type: "invocation", capability: provider.contract.id, providerId: provider.providerId, correlationId: context.correlationId, decision });
  if (!decision.allow) return { ok: false, failure: { kind: "denied", decision } };
  if (!isValid()) return unavailable(provider.contract.id);

  const controller = new AbortController();
  let outcome: InvocationFailure | undefined;
  // Registered before any check can fire `abort()`, so a signal already aborted at call time
  // (e.g. the caller aborts synchronously right after invoking) still resolves `settled`.
  const settled = new Promise<InvocationResult<unknown>>((resolve) => {
    controller.signal.addEventListener("abort", () => resolve({ ok: false, failure: outcome! }), { once: true });
  });
  const fail = (failure: InvocationFailure) => {
    if (outcome) return;
    outcome = failure;
    controller.abort();
  };

  const onTeardown = () => fail({ kind: "unavailable", capability: provider.contract.id, reason: "provider torn down during invocation" });
  provider.teardownSignal.addEventListener("abort", onTeardown, { once: true });
  const onCancel = () => fail({ kind: "cancelled" });
  if (context.signal?.aborted) fail({ kind: "cancelled" });
  else context.signal?.addEventListener("abort", onCancel, { once: true });

  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  if (context.deadline !== undefined) {
    const remaining = Math.max(0, context.deadline - Date.now());
    deadlineTimer = setTimeout(() => fail({ kind: "deadline_exceeded" }), remaining);
  }

  const handlerContext: HandlerContext = {
    ...context,
    capability: provider.contract,
    providerId: provider.providerId,
    decision,
    tenant: callerTenant,
    scopeId: provider.scopeId,
    signal: controller.signal,
    // Always callable: a handler never needs to guard `ctx.progress?.(...)` even when the caller
    // did not supply a channel (spec: no-op outside a run).
    progress: context.progress ?? (async () => {}),
  };

  const ran = (async (): Promise<InvocationResult<unknown>> => {
    try {
      const value = await provider.handler(input, handlerContext);
      return { ok: true, value };
    } catch (error) {
      return { ok: false, failure: { kind: "failed", error } };
    }
  })();

  try {
    return await Promise.race([ran, settled]);
  } finally {
    provider.teardownSignal.removeEventListener("abort", onTeardown);
    context.signal?.removeEventListener("abort", onCancel);
    if (deadlineTimer) clearTimeout(deadlineTimer);
  }
}

function unavailable(capability: string): InvocationResult<never> {
  return { ok: false, failure: { kind: "unavailable", capability, reason: "provider is no longer active" } };
}
