import { type ReactNode, useState } from "react";
import { CognateProvider, useRemoteCapability, useRemoteCapabilityHistory } from "@godspeedai/cognate-react";
import type { CognateClient, RemoteCapabilityOfferInput } from "@godspeedai/cognate-client";
import { JOURNEY_B_AGENT } from "../constants.ts";
import { Disclosure, StateTag } from "./primitives.tsx";

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

/**
 * A mounted browser surface publishes one general capability and visibly applies its result.
 * When a client is supplied directly (the journey test), the provider boundary is drawn here
 * so that hook order is identical on both paths — no hook is called inside a try/catch.
 */
export function RemoteCapabilitySurface({
  client: propClient,
  runId,
  offering = true,
}: {
  readonly client?: CognateClient;
  readonly runId?: string;
  readonly offering?: boolean;
}): ReactNode {
  const content = <CapabilityReadout runId={runId} offering={offering} />;
  return propClient ? <CognateProvider client={propClient}>{content}</CognateProvider> : content;
}

function CapabilityReadout({ runId, offering }: { readonly runId: string | undefined; readonly offering: boolean }): ReactNode {
  const [applied, setApplied] = useState("not applied");
  return (
    <div className="readout">
      <div className="readout__row">
        <span className="readout__key" id="j-b-status-label">
          Browser capability status
        </span>
        {offering ? (
          <MountedCapability onApply={setApplied} />
        ) : (
          <>
            <output aria-labelledby="j-b-status-label" className="readout__value">
              unmounted
            </output>
            <StateTag tone="fault">withdrawn</StateTag>
          </>
        )}
      </div>

      <div className="readout__row">
        <span className="readout__key" id="j-b-applied-label">
          Browser-applied value
        </span>
        <output aria-labelledby="j-b-applied-label" className="readout__value readout__value--accent">
          {applied}
        </output>
      </div>

      <RemoteCapabilityHistory runId={runId} />

      <Disclosure label="Under the hood">
        <p className="hint">
          Capability <code>browser.selection.apply</code> v1.0.0 is offered to <code>{JOURNEY_B_AGENT}</code> only while this
          component is mounted. Unmounting revokes it for new calls; already-recorded calls stay readable.
        </p>
      </Disclosure>
    </div>
  );
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
        <output aria-label={`Historical browser invocation ${record.continuationId}`} className="payload">
          {JSON.stringify({ input: record.input, result: record.result, version: record.contractVersion }, null, 2)}
        </output>
      ),
    },
  );
  return (
    <>
      <output aria-label="Browser capability status" className="readout__value">
        {offer.status}
      </output>
      <StateTag tone={offer.status === "available" ? "ok" : offer.status === "error" ? "fault" : "busy"}>
        {offer.status === "available" ? "offered" : offer.status}
      </StateTag>
      {offer.error ? <span className="hint">The offer could not be published: {offer.error.message}</span> : null}
    </>
  );
}

export function RemoteCapabilityHistory({ runId }: { readonly runId: string | undefined }): ReactNode {
  const history = useRemoteCapabilityHistory(runId);
  // The journey test locates this region by name, so the section is always present for the
  // queried path but carries no layout box of its own when nothing has been recorded.
  return (
    <section aria-label="Historical browser invocations" hidden={history.length === 0}>
      {history.length === 0 ? null : (
        <div className="readout__row">
          <span className="readout__key">Recorded calls</span>
          {history.map((record) => (
            <div key={`${record.continuationId}-${record.contractVersion}`} className="readout__call">
              <span className="readout__call-cap">{record.capability}</span>
              {record.render(record)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
