import { allowCapabilities } from "@godspeedai/kernel-api";
import type { AgentDefinition } from "@godspeedai/runtime-api";
import { createRuntime, type Runtime } from "@godspeedai/runtime-bun";
import { JOURNEY_B_AGENT } from "./constants.ts";
import { browserOffer, RemoteCapabilitySurface, MountedCapability, RemoteCapabilityHistory } from "./ui/RemoteCapabilitySurface.tsx";

export { JOURNEY_B_AGENT, browserOffer, RemoteCapabilitySurface, MountedCapability, RemoteCapabilityHistory };

export const remoteCapabilityAgent: AgentDefinition = {
  id: JOURNEY_B_AGENT,
  version: "1.0.0",
  async run(_input, ctx) {
    // The offer is discovered for this caller and this run. The app owns no second registry or
    // static tool list, so an unmounted browser capability cannot be selected for a new call.
    const offers = await ctx.remoteOffers("discover-mounted-browser-capability");
    const selected = offers[0];
    if (!selected) return { discovered: [], acknowledgment: "no mounted browser capability" };
    const result = await ctx.invokeRemoteOffer("apply-browser-selection", selected.id, { value: "chosen by the agent" });
    return {
      discovered: offers.map((offer) => ({ id: offer.id, capability: offer.contract.id })),
      acknowledgment: result,
    };
  },
};

export interface JourneyBApp {
  readonly runtime: Runtime;
  close(): Promise<void>;
}

/** Isolated J-B runtime composition over the general remote-offer primitives. */
export async function createJourneyBApp(store: string): Promise<JourneyBApp> {
  const runtime = await createRuntime({
    store,
    policy: allowCapabilities("journey-b", []),
    actions: { authorize: () => ({ allow: true, reason: "J-B remote-offer lifecycle is authorized" }) },
    agents: [remoteCapabilityAgent],
  });
  return { runtime, close: () => runtime.close() };
}

