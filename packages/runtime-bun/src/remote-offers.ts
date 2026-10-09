// Ephemeral remote capability availability. Durable work starts only after an offer is selected
// and represented by a normal continuation; offers themselves must not enter the event log.
import type { Json } from "@godspeedai/cognate-events";
import type { Caller, RemoteCapabilityOffer } from "@godspeedai/cognate-runtime-api";

type StoredOffer = RemoteCapabilityOffer & { readonly tenant: string; readonly actorId: string };

export class RemoteOfferRegistry {
  private readonly offers = new Map<string, StoredOffer>();

  publish(caller: Caller, scopeId: string, request: Omit<RemoteCapabilityOffer, "id" | "scopeId" | "expiresAt"> & { readonly ttlMs: number }): RemoteCapabilityOffer {
    if (!request.leaseId || !request.agent || !request.contract.id || !request.contract.version || !request.description) throw new Error("remote offer requires lease, agent, contract, and description");
    if (!Number.isFinite(request.ttlMs) || request.ttlMs <= 0 || request.ttlMs > 300_000) throw new Error("remote offer ttlMs must be between 1 and 300000");
    const now = Date.now();
    // A lease identifies one mounted client surface. Re-publish replaces its prior declaration for
    // this contract and agent, so a remount cannot leave an old schema eligible.
    const prior = [...this.offers.values()].find((offer) => offer.tenant === caller.tenant && offer.actorId === caller.actor.id && offer.leaseId === request.leaseId && offer.agent === request.agent && offer.contract.id === request.contract.id);
    const offer: StoredOffer = {
      id: prior?.id ?? crypto.randomUUID(), leaseId: request.leaseId, agent: request.agent, scopeId,
      contract: { id: request.contract.id, version: request.contract.version, ...(request.contract.attributes ? { attributes: request.contract.attributes } : {}) },
      description: request.description, inputSchema: request.inputSchema, ...(request.outputSchema === undefined ? {} : { outputSchema: request.outputSchema }),
      expiresAt: now + request.ttlMs, tenant: caller.tenant, actorId: caller.actor.id,
    };
    this.offers.set(offer.id, offer);
    return view(offer);
  }

  list(caller: Caller, agent: string): readonly RemoteCapabilityOffer[] {
    this.expire();
    return [...this.offers.values()]
      .filter((offer) => offer.tenant === caller.tenant && offer.actorId === caller.actor.id && offer.agent === agent)
      .sort((a, b) => a.contract.id.localeCompare(b.contract.id) || a.id.localeCompare(b.id))
      .map(view);
  }

  take(caller: Caller, agent: string, offerId: string): RemoteCapabilityOffer | undefined {
    this.expire();
    const offer = this.offers.get(offerId);
    return offer && offer.tenant === caller.tenant && offer.actorId === caller.actor.id && offer.agent === agent ? view(offer) : undefined;
  }

  revoke(caller: Caller, offerId: string): boolean {
    const offer = this.offers.get(offerId);
    if (!offer || offer.tenant !== caller.tenant || offer.actorId !== caller.actor.id) return false;
    this.offers.delete(offerId);
    return true;
  }

  private expire(): void {
    const now = Date.now();
    for (const [id, offer] of this.offers) if (offer.expiresAt <= now) this.offers.delete(id);
  }
}

function view(offer: StoredOffer): RemoteCapabilityOffer {
  const { tenant: _tenant, actorId: _actorId, ...result } = offer;
  return result as RemoteCapabilityOffer;
}

export type RemoteOfferInput = { readonly leaseId: string; readonly agent: string; readonly contract: { readonly id: string; readonly version: string; readonly attributes?: Readonly<Record<string, Json>> }; readonly description: string; readonly inputSchema: Json; readonly outputSchema?: Json; readonly ttlMs: number };
