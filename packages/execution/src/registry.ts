// The set of execution worlds an app currently has. A registry owns nothing but the mapping from a
// `worldId` to its provider; it never inspects roots, paths, or credentials.
import { WorldUnavailableError } from "./types.ts";
import type { ExecutionWorldProvider, WorldDescriptor } from "./types.ts";

export interface ExecutionWorldRegistry {
  register(provider: ExecutionWorldProvider): void;
  /** Dispose and forget a provider. Absent worlds are a no-op (idempotent). */
  unregister(worldId: string): Promise<void>;
  has(worldId: string): boolean;
  /** The provider for `worldId`, or throws `WorldUnavailableError`. Never falls back to another world. */
  get(worldId: string): ExecutionWorldProvider;
  /** Secret-free descriptors, deterministically ordered by `worldId`. */
  list(): readonly WorldDescriptor[];
  /** Dispose every provider (idempotent). */
  dispose(): Promise<void>;
}

function byWorldId(a: WorldDescriptor, b: WorldDescriptor): number {
  return a.worldId < b.worldId ? -1 : a.worldId > b.worldId ? 1 : 0;
}

export function createExecutionWorldRegistry(initial: readonly ExecutionWorldProvider[] = []): ExecutionWorldRegistry {
  const providers = new Map<string, ExecutionWorldProvider>();
  for (const provider of initial) providers.set(provider.worldId, provider);
  return {
    register(provider) {
      if (providers.has(provider.worldId)) throw new Error(`execution: world ${provider.worldId} is already registered`);
      providers.set(provider.worldId, provider);
    },
    async unregister(worldId) {
      const provider = providers.get(worldId);
      if (!provider) return;
      providers.delete(worldId);
      await provider.dispose();
    },
    has: (worldId) => providers.has(worldId),
    get(worldId) {
      const provider = providers.get(worldId);
      if (!provider) throw new WorldUnavailableError(worldId, `execution world is unavailable: ${worldId}`);
      return provider;
    },
    list: () =>
      [...providers.values()].map((provider) => ({ worldId: provider.worldId, kind: provider.kind, metadata: provider.metadata })).sort(byWorldId),
    async dispose() {
      const all = [...providers.values()];
      providers.clear();
      await Promise.all(all.map((provider) => provider.dispose()));
    },
  };
}