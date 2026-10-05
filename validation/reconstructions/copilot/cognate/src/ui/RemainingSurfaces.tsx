import { useRef, useState, type ReactNode } from "react";
import type { FrontendHandler } from "@cognate/client";
import { useCapability, useContinuations, useCognate, useProjection, useRun } from "@cognate/react";
import { DECLARATIVE_OPERATION, JOURNEY_D_AGENT, JOURNEY_E_AGENT, JOURNEY_F_AGENT, JOURNEY_G_AGENT, JOURNEY_H_AGENT } from "../constants.ts";

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

/** One labelled state row; the aria-label is the assertion surface, the row is the reading surface. */
function StateRow({ name, value }: { readonly name: string; readonly value: string }): ReactNode {
  return (
    <div className="readout__row">
      <span className="readout__key">{name}</span>
      <span className="readout__value" aria-label={name}>
        {value}
      </span>
    </div>
  );
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
    <div className="surface-stack">
      <div className="actions">
        <span className="actions__label">Context</span>
        <button type="button" className="btn btn--secondary" onClick={() => setPublished({ view: "workspace", panel: "activity" })}>
          Alter published context
        </button>
        <button type="button" className="btn btn--primary" onClick={() => void start()}>
          Start turn
        </button>
      </div>
      <div className="readout">
        <StateRow name="Published context" value={JSON.stringify(published)} />
        <StateRow name="Turn context" value={run === undefined ? "idle" : run.status === "completed" ? label(run.output) : run.status} />
      </div>
    </div>
  );
}

/**
 * J-E: a control renderer that is a pure function of durable invocation evidence. Pending and
 * terminal are both derived from recorded events; no browser handler is involved at any point.
 */
export function ControlledRenderingSurface({ threadId, onRunStarted }: SurfaceProps & { readonly threadId?: string }) {
  const client = useCognate();
  const [runId, setRunId] = useState<string | undefined>(undefined);
  const run = useRun(runId);
  const rows = useProjection("controlled-rendering");
  const value = asObject(runId === undefined ? undefined : rowValue(rows, `run/${runId}`));

  const start = async () => {
    const started = await client.startRun(JOURNEY_E_AGENT, { query: "flights to lisbon" }, threadId === undefined ? undefined : { correlationId: threadId });
    setRunId(started.runId);
    onRunStarted?.(started.runId);
  };

  const answer = label(asObject(run?.output)?.answer);

  return (
    <div className="surface-stack">
      <div className="actions">
        <span className="actions__label">Renderer</span>
        <button type="button" className="btn btn--primary" onClick={() => void start()}>
          Request backend chart
        </button>
      </div>
      <div className="readout">
        <StateRow name="Controlled renderer phase" value={value === undefined ? "idle" : label(value.phase)} />
        <StateRow name="Controlled renderer component" value={value === undefined ? "" : label(value.component)} />
        <StateRow name="Controlled renderer cards" value={value === undefined ? "0" : label(value.renders)} />
      </div>
      {run?.status === "completed" && answer ? <p className="ledger__outcome">{answer}</p> : null}
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
  const output = asObject(run?.output);
  const decision = asObject(output?.decision);
  const decidedSlot = typeof decision?.slot === "string" ? decision.slot : undefined;

  return (
    <div className="surface-stack">
      <div className="actions">
        <span className="actions__label">Decision</span>
        <button type="button" className="btn btn--primary" onClick={() => void start()}>
          Offer meeting time
        </button>
      </div>
      <div className="readout">
        <StateRow name="Decision state" value={run === undefined ? "idle" : run.status} />
      </div>
      {waiting ? (
        <div className="actions">
          <span className="actions__label">Slot</span>
          <button type="button" className="btn btn--secondary" onClick={() => decide("10:30")}>
            Accept 10:30
          </button>
        </div>
      ) : null}
      {run?.status === "completed" && decidedSlot !== undefined ? (
        <p className="ledger__outcome">Meeting scheduled — slot {decidedSlot} accepted, and the run continued past your decision.</p>
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
    <div className="surface-stack">
      <div className="actions">
        <span className="actions__label">Interrupt</span>
        <button type="button" className="btn btn--primary" onClick={() => void start()}>
          {startLabel}
        </button>
      </div>
      <div className="readout">
        <StateRow name="Interrupt state" value={run === undefined ? "idle" : run.status} />
      </div>
      {run?.status === "waiting"
        ? continuations.open.map((continuation) => (
            <div className="readout" key={continuation.id}>
              <StateRow name="Pending interrupt" value={label((continuation.condition as { readonly kind?: unknown } | null)?.kind)} />
              <StateRow name="Pending interrupt type" value={continuation.type} />
              <div className="actions">
                <button type="button" className="btn btn--secondary" onClick={() => void continuations.resolve(continuation.id, "resume", { resumed: true })}>
                  Resume interrupted run
                </button>
                <button type="button" className="btn btn--secondary" onClick={() => void continuations.resolve(continuation.id, "cancel", {})}>
                  Cancel interrupted run
                </button>
              </div>
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
    <div className="surface-stack">
      <div className="actions">
        <span className="actions__label">Catalog</span>
        <button type="button" className="btn btn--primary" onClick={() => void start()}>
          Ask for declarative UI
        </button>
      </div>
      <div className="readout">
        <StateRow name="Declarative renderer" value={value === undefined ? "waiting for a validated render" : "rendered"} />
        {value === undefined ? null : <StateRow name="Declarative component" value={label(value.component)} />}
        {value === undefined ? null : <StateRow name="Bound revenue" value={props === undefined ? "" : label(props.revenue)} />}
      </div>
      {value === undefined ? null : (
        <div className="actions">
          <span className="actions__label">Operations</span>
          {operations.map((operation) => (
            <button
              key={operation}
              type="button"
              className="btn btn--secondary"
              disabled={interaction === undefined}
              onClick={() => interaction && void continuations.resolve(interaction.id, "resume", { region: "amer" })}
            >
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
    <div className="readout">
      <StateRow name="Replayed message" value={value === undefined ? "" : label(value.text)} />
      <StateRow name="Replayed tool" value={tools.map((tool) => label(tool.type)).join(",")} />
      <StateRow name="Replayed render" value={renders.map((render) => label(render.component)).join(",")} />
      <StateRow name="Replayed settlement" value={value === undefined ? "idle" : label(value.status)} />
      <StateRow name="Replayed thread" value={threadId} />
    </div>
  );
}
