// Cognate scopes map to Cordis contexts (ADR-0001): each Scope owns one Cordis `Context` obtained
// via `isolate()`, giving every scope a genuine, distinct Cordis object to mount component fibers
// onto. Capability *visibility* itself is not delegated to Cordis (see registry.ts) since Cordis's
// isolation is per-service-name, not per-subtree, and can't be driven by dynamic capability ids
// (spec §8.1 requires descendant-visible / sibling-invisible scoping for any capability id).
import type { Context } from "cordis";
import type { Principal, Scope, ScopeOptions } from "@godspeedai/cognate-kernel-api";
import { ScopeClosedError } from "@godspeedai/cognate-kernel-api";

let counter = 0;
const nextId = () => `scope-${++counter}`;

export interface Disposable {
  dispose(reason: string): Promise<void>;
}

export class ScopeImpl implements Scope {
  readonly id: string;
  readonly parentId: string | undefined;
  readonly tenant: string;
  readonly principal: Principal;
  readonly cordisCtx: Context;
  private _closed = false;
  private readonly children = new Set<ScopeImpl>();
  private readonly mounts = new Set<Disposable>();

  constructor(
    cordisCtx: Context,
    tenant: string,
    principal: Principal,
    parent: ScopeImpl | undefined,
    id?: string,
  ) {
    this.cordisCtx = cordisCtx;
    this.tenant = tenant;
    this.principal = principal;
    this.parentId = parent?.id;
    this.id = id ?? nextId();
  }

  get closed(): boolean {
    return this._closed;
  }

  /** Ancestor chain starting at this scope, root last — drives registry visibility (spec §8.1). */
  ancestorIds(): readonly string[] {
    const ids: string[] = [];
    let current: ScopeImpl | undefined = this;
    while (current) {
      ids.push(current.id);
      current = current.parent;
    }
    return ids;
  }

  private parent: ScopeImpl | undefined;

  child(options?: ScopeOptions): Scope {
    if (this._closed) throw new ScopeClosedError(`cannot create a child of closed scope ${this.id}`);
    const id = options?.id ?? nextId();
    const principal = options?.principal ?? this.principal;
    const childCtx = this.cordisCtx.isolate(`cognate:scope:${id}`);
    const scope = new ScopeImpl(childCtx, this.tenant, principal, this, id);
    scope.parent = this;
    this.children.add(scope);
    return scope;
  }

  /** Track a component mounted directly in this scope so `close()` can dispose it (spec §8.1: close children first). */
  track(mount: Disposable): void {
    this.mounts.add(mount);
  }

  untrack(mount: Disposable): void {
    this.mounts.delete(mount);
  }

  async close(reason: string): Promise<void> {
    if (this._closed) return;
    this._closed = true;
    for (const child of [...this.children]) await child.close(reason);
    this.children.clear();
    for (const mount of [...this.mounts]) await mount.dispose(reason).catch(() => {});
    this.mounts.clear();
  }
}
