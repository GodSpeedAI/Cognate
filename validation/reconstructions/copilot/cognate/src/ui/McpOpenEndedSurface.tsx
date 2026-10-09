import { useEffect, useState, type ReactNode } from "react";
import { useArtifact, useContinuations, useCognate, useProjection, useRun } from "@godspeedai/cognate-react";
import { JOURNEY_MCP_AGENT, MCP_APP_COMPONENT, MCP_APP_OPERATION } from "../constants.ts";

type ProjectionRows = NonNullable<ReturnType<typeof useProjection>>;
type ProjectionValue = ProjectionRows[number]["value"];

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function rowValue(rows: ProjectionRows | undefined, key: string): ProjectionValue | undefined {
  return rows?.find((row) => row.key === key)?.value;
}

function label(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * The sandbox attribute decision: `allow-scripts` only. The frame runs on an opaque origin — it
 * cannot read the host DOM, storage, or cookies, and it does not need to: the one interaction it
 * has with the host is `window.parent.postMessage`, which works from an opaque origin. (The pinned
 * reference renderer also grants `allow-same-origin allow-forms`; that extra authority is not
 * needed for this app and would let the frame reach back into the host page, so it is omitted.)
 */
export const MCP_FRAME_SANDBOX = "allow-scripts";

/**
 * Open-ended Generative UI over MCP. The agent invoked the MCP tool (durable `remote:` wait); the
 * run recorded the tool's UI resource as an artifact; this surface renders that document inside a
 * sandboxed frame and carries the frame's one interaction back into the run by resolving the run's
 * open `mcp:` continuation with the postMessage payload. Every phase reads durable state — the
 * projection for the render identity, the artifact store for the document, and the continuation
 * list for the open interaction.
 */
export function McpOpenEndedSurface({
  runId: runIdProp,
  onRunStarted,
}: {
  readonly runId?: string;
  readonly onRunStarted?: (runId: string) => void;
}): ReactNode {
  const client = useCognate();
  const [startedRunId, setRunId] = useState<string | undefined>(undefined);
  // A supplied runId replays a past run from durable state (projection + artifact); a started one
  // is live. Either way every phase below reads only durable records.
  const runId = runIdProp ?? startedRunId;
  const run = useRun(runId);
  const rows = useProjection("mcp-open-ended");
  const value = asObject(runId === undefined ? undefined : rowValue(rows, `run/${runId}`));
  const continuations = useContinuations(runId);
  const interaction = continuations.open.find((continuation) => continuation.type === `mcp:${MCP_APP_OPERATION}`);
  // The projection fold can land just after the ui.render event's store refresh, and this run then
  // waits (no further stream events would re-read it). Each durable wait transition — the tool
  // wait opening and later the interaction wait — re-reads the store, so the render identity shows
  // as soon as it is folded, and a settled run is re-read on completion.
  useEffect(() => {
    client.projection("mcp-open-ended").refresh();
  }, [client, continuations.open.length]);
  const artifactId = typeof value?.artifactId === "string" ? value.artifactId : undefined;
  const artifact = useArtifact(artifactId);
  const viewId = label(asObject(value?.props)?.viewId);

  // The frame posts its result to the host; the host resolves the durable interaction with the
  // payload. Validation is data-driven: the payload must be the fixture app's result shape and its
  // viewId must match the render the run recorded — a stray message cannot settle the run.
  const [returned, setReturned] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (interaction === undefined) return;
    const onMessage = (event: MessageEvent) => {
      const data = asObject(event.data);
      if (data === undefined || data.type !== "mcp-app-result") return;
      if (data.viewId !== viewId || viewId === "") return;
      const result = asObject(data.result);
      const action = typeof result?.action === "string" ? result.action : "";
      if (action === "") return;
      setReturned(action);
      void continuations.resolve(interaction.id, "resume", {
        viewId,
        result: {
          action,
          title: typeof result?.title === "string" ? result.title : "",
          rows: typeof result?.rows === "number" ? result.rows : 0,
        },
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [interaction, continuations, viewId]);

  const start = async () => {
    setReturned(undefined);
    const started = await client.startRun(JOURNEY_MCP_AGENT, {});
    setRunId(started.runId);
    onRunStarted?.(started.runId);
  };

  return (
    <div className="surface-stack">
      <div className="actions">
        <span className="actions__label">MCP app</span>
        <button type="button" className="btn btn--primary" onClick={() => void start()}>
          Ask MCP app
        </button>
      </div>
      <div className="readout">
        <div className="readout__row">
          <span className="readout__key">MCP renderer</span>
          <span className="readout__value" aria-label="MCP renderer">
            {artifact.status === "ready" ? "rendered" : value === undefined ? "waiting for the MCP tool" : "loading app"}
          </span>
        </div>
        <div className="readout__row">
          <span className="readout__key">MCP tool</span>
          <span className="readout__value" aria-label="MCP tool">
            {label(asObject(value?.props)?.tool)}
          </span>
        </div>
        <div className="readout__row">
          <span className="readout__key">MCP view id</span>
          <span className="readout__value" aria-label="MCP view id">
            {viewId}
          </span>
        </div>
        <div className="readout__row">
          <span className="readout__key">MCP interaction</span>
          <span className="readout__value" aria-label="MCP interaction">
            {run === undefined ? "idle" : run.status}
          </span>
        </div>
      </div>
      {value !== undefined ? (
        <p className="hint" aria-label="MCP app control state">
          {interaction === undefined ? "interaction settled" : "interaction open — approve the view in the app"}
        </p>
      ) : null}
      {artifact.status === "ready" && artifact.text !== undefined ? (
        <iframe
          title="MCP app view"
          aria-label="MCP app frame"
          sandbox={MCP_FRAME_SANDBOX}
          srcDoc={artifact.text}
          className="mcp-frame"
        />
      ) : null}
      {run?.status === "completed" && asObject(run.output)?.interaction !== undefined ? (
        <p className="ledger__outcome">
          The MCP app returned “{label(asObject(asObject(run.output)?.interaction)?.action)}” and the run settled citing it.
        </p>
      ) : null}
      {returned !== undefined && run?.status !== "completed" ? <p className="hint">The MCP app returned “{returned}”; settling the run…</p> : null}
    </div>
  );
}
