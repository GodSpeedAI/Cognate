import { type ReactNode, useState } from "react";
import { CognateProvider, useCognate, useRemoteCapability, useRemoteCapabilityHistory } from "@cognate/react";
import type { CognateClient, RemoteCapabilityOfferInput } from "@cognate/client";
import { JOURNEY_B_AGENT } from "../constants.ts";

export const browserOffer: Omit<RemoteCapabilityOfferInput, "leaseId"> = {
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

/** A mounted browser surface publishes one general capability and visibly applies its result. */
export function RemoteCapabilitySurface({
  client: propClient,
  runId,
  offering = true,
}: {
  readonly client?: CognateClient;
  readonly runId?: string;
  readonly offering?: boolean;
}): ReactNode {
  let contextClient: CognateClient | undefined;
  try {
    contextClient = useCognate();
  } catch {
    contextClient = undefined;
  }
  const client = propClient ?? contextClient;
  const [applied, setApplied] = useState("not applied");
  const content = (
    <div className="remote-capability-wrapper">
      <div className="remote-capability-status">
        <label>Browser capability status: </label>
        {offering ? <MountedCapability onApply={setApplied} /> : <output aria-label="Browser capability status">unmounted</output>}
      </div>
      <div className="remote-capability-applied">
        <label>Browser-applied value: </label>
        <output aria-label="Browser-applied value">{applied}</output>
      </div>
      <RemoteCapabilityHistory runId={runId} />
    </div>
  );
  if (propClient) {
    return <CognateProvider client={propClient}>{content}</CognateProvider>;
  }
  return content;
}

export function MountedCapability({ onApply }: { readonly onApply: (value: string) => void }): ReactNode {
  const offer = useRemoteCapability(
    browserOffer,
    (input) => {
      const value = typeof input === "object" && input !== null && "value" in input && typeof input.value === "string" ? input.value : "invalid input";
      onApply(value);
      return { applied: value };
    },
    {
      render: (record) => (
        <output aria-label={`Historical browser invocation ${record.continuationId}`}>
          {JSON.stringify({ input: record.input, result: record.result, version: record.contractVersion })}
        </output>
      ),
    },
  );
  return <output aria-label="Browser capability status">{offer.status}</output>;
}

export function RemoteCapabilityHistory({ runId }: { readonly runId: string | undefined }): ReactNode {
  const history = useRemoteCapabilityHistory(runId);
  return (
    <section aria-label="Historical browser invocations">
      {history.map((record) => (
        <span key={`${record.continuationId}@${record.contractVersion}`}>{record.render(record)}</span>
      ))}
    </section>
  );
}
