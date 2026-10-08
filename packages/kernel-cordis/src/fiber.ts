// One mounted Component occurrence. Each activation attempt is a real Cordis plugin/fiber
// (`scope.cordisCtx.plugin(...)`); the WAITING/ACTIVATING/ACTIVE/FAILED/DEACTIVATING/DISPOSED
// state machine, retry/backoff, activation timeout, and dependency-loss cascade are adapter-owned
// because Cordis has none of them (ADR-0001): its own vocabulary is
// PENDING/LOADING/ACTIVE/FAILED/DISPOSED/UNLOADING with no retry, no timeout, and no cancellation
// of an in-flight `apply()`.
import type { Context, Fiber } from "cordis";
import {
  ActivationTimeoutError,
  CleanupError,
  PermanentActivationError,
  UndeclaredCapabilityError,
} from "@godspeedai/kernel-api";
import type {
  CapabilityContract,
  CapabilityHandler,
  CapabilityLease,
  Component,
  ComponentHandle,
  Disposer,
  EffectHandle,
  FiberContext,
  FiberState,
  KernelEvent,
  Policy,
} from "@godspeedai/kernel-api";
import { createLease } from "./lease.ts";
import type { CapabilityRegistry, Publication } from "./registry.ts";
import type { ScopeImpl } from "./scope.ts";


interface EffectEntry {
  readonly label: string;
  readonly disposer: Disposer;
  disposed: boolean;
}

interface Committed {
  readonly pub: Publication;
  readonly unpublish: () => void;
  readonly deactivate: () => void;
}

export class FiberUnit implements ComponentHandle {
  readonly componentId: string;
  readonly scopeId: string;
  lastError: unknown;

  private _state: FiberState = "WAITING";
  private _fiberId: string | undefined;
  private attempts = 0;
  private terminated = false;
  private registryUnsub: (() => void) | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private currentAttemptAbort: AbortController | undefined;
  private teardownAbort = new AbortController();
  private cordisFiber: (Fiber & PromiseLike<Fiber>) | undefined;
  private effectStack: EffectEntry[] = [];
  private pendingProvides: Array<{ contract: CapabilityContract; handler: CapabilityHandler }> = [];
  private committed: Committed[] = [];
  private lastCleanupError: CleanupError | undefined;
  private readonly boundUnbind: Array<() => void> = [];
  private readonly stateListeners = new Set<() => void>();

  constructor(
    private readonly component: Component,
    private readonly scope: ScopeImpl,
    private readonly registry: CapabilityRegistry,
    private readonly policy: Policy,
    private readonly tenant: string,
    private readonly emit: (event: KernelEvent) => void,
    private readonly nextId: () => string,
  ) {
    this.componentId = component.id;
    this.scopeId = scope.id;
  }

  get state(): FiberState {
    return this._state;
  }

  get fiberId(): string | undefined {
    return this._fiberId;
  }

  start(): void {
    this.registryUnsub = this.registry.onChange(() => this.tryActivate());
    this.tryActivate();
  }

  waitFor(target: FiberState, timeoutMs = 2000): Promise<void> {
    if (this._state === target) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stateListeners.delete(listener);
        reject(new Error(`timed out waiting for ${this.componentId} to reach ${target} (was ${this._state})`));
      }, timeoutMs);
      const listener = () => {
        if (this._state !== target) return;
        clearTimeout(timer);
        this.stateListeners.delete(listener);
        resolve();
      };
      this.stateListeners.add(listener);
    });
  }

  async dispose(reason: string): Promise<void> {
    await this.deactivate(reason, true);
  }

  async reset(): Promise<void> {
    if (this._state !== "FAILED" || this.terminated) return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    this.setState("WAITING");
    this.tryActivate();
  }

  // --- dependency watching -------------------------------------------------

  private tryActivate(): void {
    if (this._state !== "WAITING" || this.terminated) return;
    const requires = this.component.requires ?? {};
    const chain = this.scope.ancestorIds();
    const resolved: Record<string, Publication> = {};
    for (const [key, requirement] of Object.entries(requires)) {
      const pub = this.registry.find(requirement, chain);
      if (!pub) return;
      resolved[key] = pub;
    }
    void this.runAttempt(resolved);
  }

  // --- activation attempts --------------------------------------------------

  private async runAttempt(resolved: Record<string, Publication>): Promise<void> {
    this.attempts++;
    this._fiberId = this.nextId();
    this.currentAttemptAbort = new AbortController();
    this.teardownAbort = new AbortController();
    this.effectStack = [];
    this.pendingProvides = [];
    this.setState("ACTIVATING");

    for (const pub of Object.values(resolved)) {
      this.boundUnbind.push(this.registry.bind(pub, () => this.loseDependency()));
    }

    const fiberContext = this.buildFiberContext(resolved, this.currentAttemptAbort.signal);
    // Teardown is bound to this attempt's own effect stack: a Cordis fiber abandoned by timeout may be
    // disposed much later, after a retry has started, and must never unwind the newer attempt's effects.
    const stack = this.effectStack;
    const cordisFiber = this.scope.cordisCtx.plugin({
      apply: (ctx: Context) => {
        ctx.effect(() => () => this.teardown(stack));
        return this.component.activate(fiberContext);
      },
    });
    this.cordisFiber = cordisFiber;

    // Spec §8.4: an activation that never settles fails instead of staying ACTIVATING. Cordis cannot cancel
    // a hung apply() (its dispose() waits for it), so on timeout the adapter unwinds the attempt's effects itself.
    const timeoutMs = this.component.activationTimeoutMs ?? 30000;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settled = await Promise.race([
      cordisFiber.then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
      new Promise<{ ok: false; error: unknown }>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve({ ok: false, error: new ActivationTimeoutError(`activation of ${this.component.id} exceeded ${timeoutMs}ms`) });
        }, timeoutMs);
      }),
    ]);
    clearTimeout(timer);

    if (timedOut) {
      this.currentAttemptAbort.abort();
      await this.teardown(stack);
      cordisFiber.dispose().catch(() => {});
      this.cordisFiber = undefined;
    }

    if (this.currentAttemptAbort.signal.aborted && !timedOut) {
      // superseded by an explicit dispose()/loseDependency() call already driving the transition.
      return;
    }

    if (settled.ok) {
      for (const { contract, handler } of this.pendingProvides) this.commitProvide(contract, handler);
      this.pendingProvides = [];
      this.setState("ACTIVE");
    } else {
      this.unbindDependencies();
      this.cordisFiber = undefined;
      this.handleFailure(settled.error);
    }
  }

  private commitProvide(contract: CapabilityContract, handler: CapabilityHandler): void {
    let active = true;
    const pub: Publication = {
      contract,
      providerId: this._fiberId!,
      scopeId: this.scope.id,
      handler,
      teardownSignal: this.teardownAbort.signal,
      isActive: () => active,
    };
    const unpublish = this.registry.publish(pub);
    this.committed.push({ pub, unpublish, deactivate: () => (active = false) });
    this.emit({ type: "capability.provided", capability: contract, providerId: pub.providerId, scopeId: this.scope.id });
  }

  private handleFailure(error: unknown): void {
    this.setState("FAILED", error);
    const retry = this.component.retry ?? { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 };
    const permanent = error instanceof PermanentActivationError;
    if (permanent || this.attempts >= retry.maxAttempts) return; // terminal FAILED until reset()
    const backoff = Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** (this.attempts - 1));
    this.retryTimer = setTimeout(() => {
      if (this.terminated) return;
      this.setState("WAITING");
      this.tryActivate();
    }, backoff);
  }

  // --- teardown: the single Cordis effect every attempt registers -----------

  /** Registered once via `ctx.effect()` per attempt (ADR mitigation 1 & 3): aggregates cleanup
   * errors ourselves (Cordis reports each to its logger and never aggregates them) and withdraws
   * every capability this occurrence published, cascading to bound dependents first so a
   * dependent always finishes deactivating before the provider's own effects run (spec §8.4/§35). */
  private async teardown(stack: EffectEntry[]): Promise<void> {
    const errors: unknown[] = [];
    // Published capabilities belong to the current occurrence only; an abandoned attempt never published.
    const committed = stack === this.effectStack ? this.committed.splice(0) : [];
    for (const { pub, unpublish, deactivate } of committed) {
      deactivate();
      await this.registry.notifyLoss(pub);
      unpublish();
      this.emit({ type: "capability.withdrawn", capability: pub.contract, providerId: pub.providerId, scopeId: pub.scopeId });
    }
    for (const entry of stack.splice(0).reverse()) {
      if (entry.disposed) continue;
      entry.disposed = true;
      try {
        await entry.disposer();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      this.lastCleanupError = new CleanupError(this.component.id, errors);
      this.emit({ type: "cleanup.failed", componentId: this.component.id, fiberId: this._fiberId ?? "", errors });
    }
  }

  private unbindDependencies(): void {
    for (const unbind of this.boundUnbind.splice(0)) unbind();
  }

  private async loseDependency(): Promise<void> {
    if (this.terminated || (this._state !== "ACTIVE" && this._state !== "ACTIVATING")) return;
    await this.deactivate("dependency lost", false);
  }

  private async deactivate(reason: string, terminal: boolean): Promise<void> {
    if (this.terminated) return;

    if (this._state === "WAITING" || this._state === "FAILED") {
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
      }
      if (terminal) this.finalize();
      return;
    }

    if (this._state === "ACTIVATING") {
      this.currentAttemptAbort?.abort();
      if (this.cordisFiber) {
        await this.cordisFiber.dispose().catch(() => {});
        this.cordisFiber = undefined;
      }
    } else if (this._state === "ACTIVE") {
      this.setState("DEACTIVATING");
      this.teardownAbort.abort();
      if (this.cordisFiber) {
        await this.cordisFiber.dispose().catch(() => {});
        this.cordisFiber = undefined;
      }
    }

    this.unbindDependencies();

    if (terminal) {
      this.finalize();
      if (this.lastCleanupError) {
        const error = this.lastCleanupError;
        this.lastCleanupError = undefined;
        throw error;
      }
    } else {
      this._fiberId = undefined;
      this.setState("WAITING");
      this.tryActivate();
    }
  }

  private finalize(): void {
    this.terminated = true;
    this.registryUnsub?.();
    this.registryUnsub = undefined;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    this._fiberId = undefined;
    this.scope.untrack(this);
    this.setState("DISPOSED");
  }

  private setState(next: FiberState, error?: unknown): void {
    const from = this._state;
    this._state = next;
    if (error !== undefined) this.lastError = error;
    this.emit({ type: "fiber.state", componentId: this.componentId, scopeId: this.scopeId, fiberId: this._fiberId, from, to: next, error });
    for (const listener of [...this.stateListeners]) listener();
  }

  private buildFiberContext(resolved: Record<string, Publication>, signal: AbortSignal): FiberContext {
    const dependencies: Record<string, CapabilityLease> = {};
    for (const [key, pub] of Object.entries(resolved)) {
      dependencies[key] = createLease(
        { contract: pub.contract, providerId: pub.providerId, scopeId: pub.scopeId, handler: pub.handler, teardownSignal: pub.teardownSignal },
        this.tenant,
        this.policy,
        () => pub.isActive(),
        this.emit,
      );
    }
    const effectStack = this.effectStack;
    return {
      fiberId: this._fiberId!,
      componentId: this.componentId,
      scope: this.scope,
      dependencies,
      signal,
      effects: {
        register: (disposer: Disposer, label = "effect"): EffectHandle => {
          const entry: EffectEntry = { label, disposer, disposed: false };
          if (signal.aborted) {
            // The attempt was abandoned (timeout or concurrent dispose): nothing will unwind it later.
            entry.disposed = true;
            void Promise.resolve().then(disposer).catch(() => {});
          } else effectStack.push(entry);
          return {
            label,
            get disposed() {
              return entry.disposed;
            },
            dispose: async () => {
              if (entry.disposed) return;
              entry.disposed = true;
              const index = effectStack.indexOf(entry);
              if (index >= 0) effectStack.splice(index, 1);
              await Promise.resolve(entry.disposer());
            },
          };
        },
      },
      provide: <I, O>(contract: CapabilityContract, handler: CapabilityHandler<I, O>): void => {
        if (!this.component.provides?.some((c) => c.id === contract.id)) {
          throw new UndeclaredCapabilityError(`component ${this.componentId} did not declare capability ${contract.id}`);
        }
        this.pendingProvides.push({ contract, handler: handler as CapabilityHandler });
      },
    };
  }
}
