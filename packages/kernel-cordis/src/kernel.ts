// Framework-owned kernel, backed by Cordis. This is the only file besides scope.ts/fiber.ts that
// touches the `cordis` package; nothing here appears in any exported signature (spec §3.4).
import { Context } from "cordis";
import { ScopeClosedError } from "@godspeedai/kernel-api";
import type { CapabilityLease, Component, ComponentHandle, Kernel, KernelEvent, KernelOptions, Requirement, Scope, Unavailable } from "@godspeedai/kernel-api";
import { FiberUnit } from "./fiber.ts";
import { createLease } from "./lease.ts";
import { CapabilityRegistry } from "./registry.ts";
import { ScopeImpl } from "./scope.ts";

export class CordisKernel implements Kernel {
  readonly root: Scope;
  private readonly registry = new CapabilityRegistry();
  private readonly listeners = new Set<(event: KernelEvent) => void>();
  private readonly rootScope: ScopeImpl;
  private readonly nextId: () => string;

  constructor(private readonly options: KernelOptions) {
    this.nextId = options.ids ?? (() => crypto.randomUUID());
    this.rootScope = new ScopeImpl(new Context(), options.tenant, options.principal, undefined, "root");
    this.root = this.rootScope;
  }

  async mount(component: Component, scope: Scope = this.root): Promise<ComponentHandle> {
    const target = scope as ScopeImpl;
    if (target.closed) throw new ScopeClosedError(`cannot mount ${component.id} into closed scope ${target.id}`);
    const fiber = new FiberUnit(component, target, this.registry, this.options.policy, this.options.tenant, (event) => this.emit(event), this.nextId);
    target.track(fiber);
    fiber.start();
    return fiber;
  }

  resolve(requirement: Requirement, scope: Scope = this.root): CapabilityLease | Unavailable {
    const chain = (scope as ScopeImpl).ancestorIds();
    const pub = this.registry.find(requirement, chain);
    if (!pub) return { unavailable: true, requirement, reason: `no eligible provider for ${requirement.capability}` };
    return createLease(
      { contract: pub.contract, providerId: pub.providerId, scopeId: pub.scopeId, handler: pub.handler, teardownSignal: pub.teardownSignal },
      this.options.tenant,
      this.options.policy,
      () => pub.isActive(),
      (event) => this.emit(event),
    );
  }

  observe(listener: (event: KernelEvent) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  async shutdown(reason: string): Promise<void> {
    await this.rootScope.close(reason);
  }

  private emit(event: KernelEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}
