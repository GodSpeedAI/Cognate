import { useRef, useState } from "react";
import type { FrontendHandler } from "@cognate/client";
import { useCapability, useContinuations, useCognate, useProjection, useRun } from "@cognate/react";
import {
  DECLARATIVE_OPERATION,
  JOURNEY_D_AGENT,
  JOURNEY_E_AGENT,
  JOURNEY_F_AGENT,
  JOURNEY_G_AGENT,
  JOURNEY_H_AGENT,
} from "../remaining-journeys.ts";

type ProjectionRows = NonNullable<ReturnType<typeof useProjection>>;
type ProjectionValue = ProjectionRows[number]["value"];

function rowValue(rows: ProjectionRows | undefined, key: string): ProjectionValue | undefined {
  return rows?.find((row) => row.key === key)?.value;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function label(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export interface SurfaceProps {
  readonly onRunStarted?: (runId: string) => void;
}

/**
 * J-D: the mounted surface publishes application state and supplies it as invocation input.
 * Unmounting simply stops supplying it — no separate context store exists to clear.
 */
export function AgentContextSurface({ threadId, onRunStarted }: SurfaceProps & { readonly threadId: string }) {
  const client = useCognate();
  const [published, setPublished] = useState({ view: "workspace", panel: "threads" });
  const [runId, setRunId] = useState<string | undefined>(undefined);
  const run = useRun(runId);

  const start = async () => {
    const started = await client.startRun(
      JOURNEY_D_AGENT,
      { context: [{ description: "application-state", value: JSON.stringify(published) }] },
      { correlationId: threadId },
    );
    setRunId(started.runId);
    onRunStarted?.(started.runId);
  };

  return (
    <div>
      <span aria-label="Published context">{JSON.stringify(published)}</span>
      <button type="button" onClick={() => setPublished({ view: "workspace", panel: "activity" })}>
        Alter published context
      </button>
      <button type="button" onClick={() => void start()}>
        Start turn
      </button>
      <span aria-label="Turn context">{run === undefined ? "idle" : run.status === "completed" ? label(run.output) : run.status}</span>
    </div>
  );
}

/**
 * J-E: a control renderer that is a pure function of durable invocation evidence. Pending and
 * terminal are both derived from recorded events; no browser handler is involved at any point.
 */
export function ControlledRenderingSurface({ onRunStarted }: SurfaceProps) {
  const client = useCognate();
  const [runId, setRunId] = useState<string | undefined>(undefined);
  const rows = useProjection("controlled-rendering");
  const value = asObject(runId === undefined ? undefined : rowValue(rows, `run/${runId}`));

  const start = async () => {
    const started = await client.startRun(JOURNEY_E_AGENT, { query: "flights to lisbon" });
    setRunId(started.runId);
    onRunStarted?.(started.runId);
  };

  return (
    <div>
      <button type="button" onClick={() => void start()}>
        Request backend chart
      </button>
      <span aria-label="Controlled renderer phase">{value === undefined ? "idle" : label(value.phase)}</span>
      <span aria-label="Controlled renderer component">{value === undefined ? "" : label(value.component)}</span>
      <span aria-label="Controlled renderer cards">{value === undefined ? "0" : label(value.renders)}</span>
    </div>
  );
}

/**
 * J-F: the inline meeting UI holds the answer until a human accepts a slot. The capability handler
 * is the waiting tool's other half — resolving it returns the tool result and the run continues.
 */
export function ToolDecisionSurface({ onRunStarted }: SurfaceProps) {
  const client = useCognate();
  const [runId, setRunId] = useState<string | undefined>(undefined);
  const run = useRun(runId);
  const pending = useRef<((value: { readonly slot: string }) => void) | undefined>(undefined);
  const handler: FrontendHandler = () =>
    new Promise((resolve) => {
      pending.current = resolve;
    });

  useCapability("schedule.meeting", handler);

  const start = async () => {
    const started = await client.startRun(JOURNEY_F_AGENT, { prompt: "30-minute meeting with CopilotKit" });
    setRunId(started.runId);
    onRunStarted?.(started.runId);
  };

  const decide = (slot: string) => {
    const resolve = pending.current;
    pending.current = undefined;
    resolve?.({ slot });
  };

  const waiting = run?.status === "waiting";

  return (
    <div>
      <button type="button" onClick={() => void start()}>
        Offer meeting time
      </button>
      <span aria-label="Decision state">{run === undefined ? "idle" : run.status}</span>
      {waiting ? (
        <div>
          <button type="button" onClick={() => decide("10:30")}>
            Accept 10:30
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * J-G: a manually placed control for a pending runtime interrupt. Resume continues the suspended
 * run; cancel closes the condition and the run ends instead of continuing.
 */
export function RuntimeInterruptSurface({ startLabel, reason, onRunStarted }: SurfaceProps & { readonly startLabel: string; readonly reason: string }) {
  const client = useCognate();
  const [runId, setRunId] = useState<string | undefined>(undefined);
  const run = useRun(runId);
  const continuations = useContinuations(runId);

  const start = async () => {
    const started = await client.startRun(JOURNEY_G_AGENT, { reason }, { correlationId: "thread:j-g" });
    setRunId(started.runId);
    onRunStarted?.(started.runId);
  };

  return (
    <div>
      <button type="button" onClick={() => void start()}>
        {startLabel}
      </button>
      <span aria-label="Interrupt state">{run === undefined ? "idle" : run.status}</span>
      {run?.status === "waiting"
        ? continuations.open.map((continuation) => (
            <div key={continuation.id}>
              <span aria-label="Pending interrupt">{label((continuation.condition as { readonly kind?: unknown } | null)?.kind)}</span>
              <span aria-label="Pending interrupt type">{continuation.type}</span>
              <button type="button" onClick={() => void continuations.resolve(continuation.id, "resume", { resumed: true })}>
                Resume interrupted run
              </button>
              <button type="button" onClick={() => void continuations.resolve(continuation.id, "cancel", {})}>
                Cancel interrupted run
              </button>
            </div>
          ))
        : null}
    </div>
  );
}

/**
 * J-H: the catalog decides what may render. Data-bound props come from the validated projection,
 * and the only actionable control is an operation the catalog declared for that component.
 */
export function DeclarativeUiSurface({ onRunStarted }: SurfaceProps) {
  const client = useCognate();
  const [runId, setRunId] = useState<string | undefined>(undefined);
  const rows = useProjection("declarative-catalog");
  const value = asObject(runId === undefined ? undefined : rowValue(rows, `run/${runId}`));
  const continuations = useContinuations(runId);
  const interaction = continuations.open.find((continuation) => continuation.type === `a2ui:${DECLARATIVE_OPERATION}`);
  const operations = value !== undefined && Array.isArray(value.operations) ? (value.operations as unknown[]).map((operation) => String(operation)) : [];
  const props = asObject(value?.props);

  const start = async () => {
    const started = await client.startRun(JOURNEY_H_AGENT, {});
    setRunId(started.runId);
    onRunStarted?.(started.runId);
  };

  return (
    <div>
      <button type="button" onClick={() => void start()}>
        Ask for declarative UI
      </button>
      <span aria-label="Declarative renderer">{value === undefined ? "waiting for a validated render" : "rendered"}</span>
      {value === undefined ? null : (
        <div>
          <span aria-label="Declarative component">{label(value.component)}</span>
          <span aria-label="Bound revenue">{props === undefined ? "" : label(props.revenue)}</span>
          {operations.map((operation) => (
            <button key={operation} type="button" disabled={interaction === undefined} onClick={() => interaction && void continuations.resolve(interaction.id, "resume", { region: "amer" })}>
              Select region
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * J-J: thread history read back after a reload. Chat text, the recorded tool wait and the
 * generative UI all come from the durable projection; the live capability that produced them is
 * gone, so nothing here can reauthorize it.
 */
export function RichThreadSurface({ threadId }: { readonly threadId: string }) {
  const rows = useProjection("rich-thread");
  const value = asObject(rowValue(rows, `thread/${threadId}`));
  const renders = value !== undefined && Array.isArray(value.renders) ? (value.renders as readonly { readonly component?: unknown }[]) : [];
  const tools = value !== undefined && Array.isArray(value.tools) ? (value.tools as readonly { readonly type?: unknown }[]) : [];

  return (
    <div>
      <span aria-label="Replayed message">{value === undefined ? "" : label(value.text)}</span>
      <span aria-label="Replayed tool">{tools.map((tool) => label(tool.type)).join(",")}</span>
      <span aria-label="Replayed render">{renders.map((render) => label(render.component)).join(",")}</span>
      <span aria-label="Replayed settlement">{value === undefined ? "idle" : label(value.status)}</span>
      <span aria-label="Replayed thread">{threadId}</span>
    </div>
  );
}
