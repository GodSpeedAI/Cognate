import { type ReactNode, useState } from "react";
import { allowCapabilities } from "@cognate/kernel-api";
import { CognateProvider, useRemoteCapability, useRemoteCapabilityHistory } from "@cognate/react";
import type { AgentDefinition } from "@cognate/runtime-api";
import { createRuntime, type Runtime } from "@cognate/runtime-bun";
import type { CognateClient, RemoteCapabilityOfferInput } from "@cognate/client";

export const JOURNEY_B_AGENT = "copilotkit-reconstruction.front-capability";

const browserOffer: Omit<RemoteCapabilityOfferInput, "leaseId"> = {
  agent: JOURNEY_B_AGENT,
  contract: { id: "browser.selection.apply", version: "1.0.0" },
  description: "Apply the agent-selected value to the mounted browser surface",
  inputSchema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
  },
  outputSchema: {
    type: "object",
    properties: { applied: { type: "string" } },
    required: ["applied"],
  },
  ttlMs: 1_000,
};

const remoteCapabilityAgent: AgentDefinition = {
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

/** A mounted browser surface publishes one general capability and visibly applies its result. */
export function RemoteCapabilitySurface({ client, runId, offering = true }: { readonly client: CognateClient; readonly runId?: string; readonly offering?: boolean }): ReactNode {
  const [applied, setApplied] = useState("not applied");
  return (
    <CognateProvider client={client}>
      {offering ? <MountedCapability onApply={setApplied} /> : null}
      <output aria-label="Browser-applied value">{applied}</output>
      <RemoteCapabilityHistory runId={runId} />
    </CognateProvider>
  );
}

function MountedCapability({ onApply }: { readonly onApply: (value: string) => void }): ReactNode {
  const offer = useRemoteCapability(browserOffer, (input) => {
    const value = typeof input === "object" && input !== null && "value" in input && typeof input.value === "string" ? input.value : "invalid input";
    onApply(value);
    return { applied: value };
  }, {
    render: (record) => <output aria-label={`Historical browser invocation ${record.continuationId}`}>{JSON.stringify({ input: record.input, result: record.result, version: record.contractVersion })}</output>,
  });
  return <output aria-label="Browser capability status">{offer.status}</output>;
}

function RemoteCapabilityHistory({ runId }: { readonly runId: string | undefined }): ReactNode {
  const history = useRemoteCapabilityHistory(runId);
  return <section aria-label="Historical browser invocations">{history.map((record) => <span key={`${record.continuationId}@${record.contractVersion}`}>{record.render(record)}</span>)}</section>;
}
