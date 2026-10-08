// Capability registry: Cognate requires multi-provider resolution keyed by capability id,
// version and attributes (spec §8.2, isCompatible). Cordis's own service model (`ctx.provide`/
// `ctx.get`) is a single-slot-per-name singleton with no version/attribute matching, so the
// eligibility graph itself is adapter-owned (explicitly sanctioned: "dependency eligibility via
// isCompatible ... implement it in the adapter"). Cordis is still used per-publication: each
// entry here is only ever created from inside a fiber's committed `ctx.provide()` call and torn
// down through that same fiber's Cordis effect (see fiber.ts), so the registry is a read model
// over state whose lifetime Cordis still owns.
import { isCompatible } from "@godspeedai/kernel-api";
import type { CapabilityContract, CapabilityHandler, Requirement } from "@godspeedai/kernel-api";

export interface Publication {
  readonly contract: CapabilityContract;
  readonly providerId: string;
  readonly scopeId: string;
  readonly handler: CapabilityHandler;
  /** Aborted the instant the providing fiber leaves ACTIVE. */
  readonly teardownSignal: AbortSignal;
  isActive(): boolean;
}

type Listener = () => void;

/**
 * Scope visibility (spec §8.1): a publication is visible to the scope it was published in and
 * every descendant, never to an ancestor or an unrelated scope. Cordis's `ctx.isolate()` only
 * isolates one named service slot at a time and can't be driven by dynamic, per-mount capability
 * ids, so visibility is computed here from the scope-ancestor chain the caller supplies.
 */
export class CapabilityRegistry {
  private readonly byScope = new Map<string, Set<Publication>>();
  private readonly consumers = new Map<Publication, Set<() => Promise<void>>>();
  private readonly listeners = new Set<Listener>();

  publish(pub: Publication): () => void {
    let set = this.byScope.get(pub.scopeId);
    if (!set) this.byScope.set(pub.scopeId, (set = new Set()));
    set.add(pub);
    this.consumers.set(pub, new Set());
    this.notify();
    return () => {
      set!.delete(pub);
      this.consumers.delete(pub);
      this.notify();
    };
  }

  /** First eligible publication visible from `scopeChain` (self, then ancestors, root last). */
  find(requirement: Requirement, scopeChain: readonly string[]): Publication | undefined {
    for (const scopeId of scopeChain) {
      const set = this.byScope.get(scopeId);
      if (!set) continue;
      for (const pub of set) if (pub.isActive() && isCompatible(requirement, pub.contract)) return pub;
    }
    return undefined;
  }

  /** Bind a dependent so it is asked to react (in registration order) before its provider tears down. */
  bind(pub: Publication, onLost: () => Promise<void>): () => void {
    const set = this.consumers.get(pub);
    set?.add(onLost);
    return () => void set?.delete(onLost);
  }

  /** Notify bound dependents of `pub`'s loss, awaiting each in turn (spec: dependents deactivate before the provider). */
  async notifyLoss(pub: Publication): Promise<void> {
    const set = this.consumers.get(pub);
    if (!set) return;
    for (const onLost of [...set]) await onLost();
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
