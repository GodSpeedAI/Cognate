// Framework-owned kernel contract (spec §8, §8.5, §9.1, §32). No engine types may appear here.

/** Opaque reference to an existing semantic object (spec §7.1). Produced by semantic adapters. */
export interface SemanticRef {
  readonly namespace: string;
  /** DomainForge object identity (e.g. `namespace::name`). */
  readonly id: string;
  readonly kind?: string;
  /** Model URI plus immutable source digest, or SemanticPack identity/version. */
  readonly source: { readonly uri: string; readonly digest: string };
  /** Cognate-owned adapter projection schema version. */
  readonly projectionVersion: string;
}

export interface Principal {
  readonly id: string;
  readonly kind: "user" | "agent" | "service" | "system";
}

export type AttributeValue = string | number | boolean;
export type Attributes = Readonly<Record<string, AttributeValue>>;

/** A capability contract a provider publishes (spec §8.2). */
export interface CapabilityContract {
  /** Stable capability identity, e.g. `customer.read`. */
  readonly id: string;
  /** Semantic version of the contract, `MAJOR.MINOR.PATCH`. */
  readonly version: string;
  readonly attributes?: Attributes;
  readonly semanticRef?: SemanticRef;
}

/** What a consumer requires (deterministic eligibility input, spec §8.2). */
export interface Requirement {
  readonly capability: string;
  /** Required major version; any provider with the same major and >= minor is compatible. */
  readonly version?: string;
  /** Every listed attribute must equal the provider's attribute. */
  readonly attributes?: Attributes;
}

export interface InvocationContext {
  readonly actor: Principal;
  /** The caller's tenant. Defaults to the kernel's tenant; policy and handlers see this value (spec §32). */
  readonly tenant?: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly runId?: string;
  /** Required for durable commands (spec §10). */
  readonly idempotencyKey?: string;
  /** Absolute deadline in epoch milliseconds. */
  readonly deadline?: number;
  readonly signal?: AbortSignal;
}

export interface AuthorizationRequest {
  readonly operation: "invoke";
  readonly actor: Principal;
  readonly tenant: string;
  readonly scopeId: string;
  readonly capability: CapabilityContract;
  readonly providerId: string;
  readonly correlationId: string;
}

export interface PolicyDecision {
  readonly allow: boolean;
  readonly policyId: string;
  readonly reason: string;
}

/** Server-side policy consulted at every invocation. The default is deny (spec §32). */
export interface Policy {
  authorize(request: AuthorizationRequest): PolicyDecision | Promise<PolicyDecision>;
}

/** Context passed to a capability handler. */
export interface HandlerContext extends InvocationContext {
  readonly capability: CapabilityContract;
  readonly providerId: string;
  readonly decision: PolicyDecision;
  readonly tenant: string;
  readonly scopeId: string;
  /** Aborted on caller cancellation, deadline expiry, or provider teardown. */
  readonly signal: AbortSignal;
}

export type CapabilityHandler<I = unknown, O = unknown> = (input: I, context: HandlerContext) => O | Promise<O>;

export type InvocationFailure =
  | { readonly kind: "unavailable"; readonly capability: string; readonly reason: string }
  | { readonly kind: "denied"; readonly decision: PolicyDecision }
  | { readonly kind: "deadline_exceeded" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly error: unknown };

export type InvocationResult<O> =
  | { readonly ok: true; readonly value: O }
  | { readonly ok: false; readonly failure: InvocationFailure };

/** A resolved, revocable reference to one active provider. Resolution grants no permission. */
export interface CapabilityLease<I = unknown, O = unknown> {
  readonly contract: CapabilityContract;
  readonly providerId: string;
  /** False once the providing fiber leaves ACTIVE or its scope closes. */
  readonly valid: boolean;
  invoke(input: I, context: InvocationContext): Promise<InvocationResult<O>>;
}

export interface Unavailable {
  readonly unavailable: true;
  readonly requirement: Requirement;
  readonly reason: string;
}

export interface EffectHandle {
  readonly label: string;
  readonly disposed: boolean;
  /** Dispose this single effect early; idempotent. */
  dispose(): Promise<void>;
}

export type Disposer = () => void | Promise<void>;

export interface Effects {
  /** Register a reversible effect owned by the current fiber (spec §9.1). */
  register(disposer: Disposer, label?: string): EffectHandle;
}

export type FiberState = "WAITING" | "ACTIVATING" | "ACTIVE" | "FAILED" | "DEACTIVATING" | "DISPOSED";

/** What an activation function receives: one live fiber (spec §8.4). */
export interface FiberContext {
  readonly fiberId: string;
  readonly componentId: string;
  readonly scope: Scope;
  /** Leases for every declared requirement, keyed by requirement name. */
  readonly dependencies: Readonly<Record<string, CapabilityLease>>;
  readonly effects: Effects;
  /** Aborted when a concurrent disposal or dependency loss wins over this activation. */
  readonly signal: AbortSignal;
  /** Publish a declared capability; becomes visible only after activation succeeds. */
  provide<I, O>(contract: CapabilityContract, handler: CapabilityHandler<I, O>): void;
}

export interface RetryPolicy {
  /** Attempts before the component becomes permanently FAILED. */
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

/** A declarative unit of composition, independent from any running occurrence (spec §8.3). */
export interface Component {
  readonly id: string;
  readonly requires?: Readonly<Record<string, Requirement>>;
  readonly provides?: readonly CapabilityContract[];
  readonly semanticRef?: SemanticRef;
  readonly retry?: RetryPolicy;
  /** Activation longer than this fails transiently instead of staying ACTIVATING (spec §8.4). Default 30000. */
  readonly activationTimeoutMs?: number;
  activate(fiber: FiberContext): void | Promise<void>;
}

export interface ComponentHandle {
  readonly componentId: string;
  readonly scopeId: string;
  readonly state: FiberState;
  /** The id of the current ACTIVE fiber, if any. */
  readonly fiberId: string | undefined;
  readonly lastError: unknown;
  /** Resolve when the handle reaches a state (rejects on timeout). */
  waitFor(state: FiberState, timeoutMs?: number): Promise<void>;
  /** Permanently dispose; idempotent. Rejects once with CleanupError if any disposer failed. */
  dispose(reason: string): Promise<void>;
  /** Clear a permanent FAILED state and re-enter WAITING. */
  reset(): Promise<void>;
}

export interface ScopeOptions {
  readonly id?: string;
  /** A child may narrow its principal; it never gains authority by inheritance. */
  readonly principal?: Principal;
}

export interface Scope {
  readonly id: string;
  readonly parentId: string | undefined;
  readonly tenant: string;
  readonly principal: Principal;
  readonly closed: boolean;
  child(options?: ScopeOptions): Scope;
  /** Close children first, then dispose this scope's components. */
  close(reason: string): Promise<void>;
}

export type KernelEvent =
  | { readonly type: "fiber.state"; readonly componentId: string; readonly scopeId: string; readonly fiberId: string | undefined; readonly from: FiberState; readonly to: FiberState; readonly error?: unknown }
  | { readonly type: "capability.provided" | "capability.withdrawn"; readonly capability: CapabilityContract; readonly providerId: string; readonly scopeId: string }
  | { readonly type: "cleanup.failed"; readonly componentId: string; readonly fiberId: string; readonly errors: readonly unknown[] }
  | { readonly type: "invocation"; readonly capability: string; readonly providerId: string; readonly correlationId: string; readonly decision: PolicyDecision };

export interface KernelOptions {
  readonly tenant: string;
  readonly principal: Principal;
  readonly policy: Policy;
  /** Deterministic id source for tests; defaults to crypto.randomUUID. */
  readonly ids?: () => string;
}

export interface Kernel {
  readonly root: Scope;
  mount(component: Component, scope?: Scope): Promise<ComponentHandle>;
  resolve(requirement: Requirement, scope?: Scope): CapabilityLease | Unavailable;
  observe(listener: (event: KernelEvent) => void): () => void;
  /** Close the root scope and release the engine. */
  shutdown(reason: string): Promise<void>;
}

export type KernelFactory = (options: KernelOptions) => Kernel | Promise<Kernel>;
