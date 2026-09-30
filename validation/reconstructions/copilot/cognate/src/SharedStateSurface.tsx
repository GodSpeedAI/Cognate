import { useCognate, useRun, useThreadSharedState } from "@cognate/react";
import { useState } from "react";
import { JOURNEY_C_AGENT } from "./constants.ts";
import { Disclosure, Note, StateTag } from "./ui/primitives.tsx";

type Todo = { readonly id: string; readonly text: string };
const THREAD_ID = "thread:j-c";

function todosIn(state: unknown): readonly Todo[] {
  if (typeof state !== "object" || state === null || !Array.isArray((state as { todos?: unknown }).todos)) return [];
  return (state as { todos: readonly Todo[] }).todos;
}

/**
 * Canvas for J-C, rendered as a versioned ledger. The live thread-scoped durable state
 * stream (`state.stream` / `state.observe`) is the single rendering authority, matching
 * the reference's one live `state` channel. The derived `shared-state-canvas` projection
 * is settlement evidence, asserted by the journey test, not a second live source:
 * `useProjection` reads a materialized fold with no position, so it can lag the very
 * event that triggered the read (DEBT-021).
 */
/** What the last agent run actually did, in user terms. Null while there is nothing to report. */
function runOutcome(status: string | undefined, output: unknown, todos: readonly Todo[]): string | null {
  if (status === undefined) return null;
  if (status === "running" || status === "pending") return "Agent run in progress…";
  if (status === "failed") return "The agent run failed. The state below is unchanged.";
  const observed = typeof output === "object" && output !== null && Array.isArray((output as { todos?: unknown }).todos)
    ? ((output as { todos: readonly Todo[] }).todos)
    : undefined;
  if (observed === undefined) return "Agent replaced the canvas with a fresh snapshot.";
  const sawUser = observed.some((todo) => todo.id === "user");
  return sawUser
    ? `Agent read ${observed.length} ${observed.length === 1 ? "row" : "rows"} and saw your edit.`
    : `Agent read ${observed.length} ${observed.length === 1 ? "row" : "rows"}; your edit was not present.`;
}

export function SharedStateSurface() {
  const client = useCognate();
  const { state, version, update } = useThreadSharedState(THREAD_ID);
  const [running, setRunning] = useState<"write" | "observe" | undefined>();
  const [lastRunId, setLastRunId] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const lastRun = useRun(lastRunId);
  const todos = todosIn(state);
  const outcome = runOutcome(lastRun?.status, lastRun?.output, todos);

  const startRun = async (phase: "write" | "observe") => {
    setRunning(phase);
    setFailure(undefined);
    try {
      const started = await client.startRun(JOURNEY_C_AGENT, { phase }, { correlationId: THREAD_ID });
      setLastRunId(started.runId);
    } catch (error) {
      setFailure(`The agent run could not start. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunning(undefined);
    }
  };

  const saveEdit = async () => {
    setFailure(undefined);
    try {
      await update({ patch: [{ op: "add", path: "/todos/-", value: { id: "user", text: "user todo" } }] }, { expectedVersion: version });
    } catch (error) {
      setFailure(`Your edit was not committed. ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="ledger">
      <div className="ledger__head">
        <span>Thread state</span>
        <span className="ledger__revision">revision {typeof version === "number" ? version : 0}</span>
      </div>

      <h3 className="sr-only" id="canvas-todos-label">
        Canvas todos
      </h3>
      <div className="ledger__body" aria-labelledby="canvas-todos-label">
        {todos.length === 0 ? (
          <p className="empty">Nothing here yet. Ask the agent to write, then edit the result yourself.</p>
        ) : (
          <div className="ledger__rows">
            {todos.map((todo, index) => (
              <div className="ledger__row" key={`${todo.id}-${index}`}>
                <span className="ledger__origin">{todo.id === "user" ? "you" : "agent"}</span>
                <span className="ledger__text">{todo.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ledger__controls">
        <div className="ledger__control-group">
          <span className="actions__label" id="j-c-agent-actions">
            Agent
          </span>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={running !== undefined}
            aria-describedby="j-c-agent-actions"
            onClick={() => void startRun("write")}
          >
            {running === "write" ? "Writing…" : "Start agent write"}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={running !== undefined || todos.length === 0}
            aria-describedby="j-c-agent-actions"
            onClick={() => void startRun("observe")}
          >
            {running === "observe" ? "Observing…" : "Start agent observation"}
          </button>
          {todos.length === 0 ? <span className="hint">An observation needs state to read.</span> : null}
          {todos.some((todo) => todo.id === "user") && running === undefined ? (
            <span className="hint">A write replaces the whole canvas, including your rows.</span>
          ) : null}
        </div>

        <div className="ledger__control-group">
          <span className="actions__label" id="j-c-user-actions">
            You
          </span>
          <button
            type="button"
            className="btn btn--primary"
            disabled={todos.length === 0}
            aria-describedby="j-c-user-actions"
            onClick={() => void saveEdit()}
          >
            Save canvas edit
          </button>
          <span className="hint">
            {todos.length === 0 ? "Write something first — an edit appends to existing state." : "Appends a row and advances the revision."}
          </span>
        </div>

        {outcome ? <p className="ledger__outcome">{outcome}</p> : null}

        {failure ? <Note>{failure}</Note> : null}

        <Disclosure label="Under the hood">
          <p className="hint">
            Agent <code>{JOURNEY_C_AGENT}</code> on thread <code>{THREAD_ID}</code>. Writes are
            compare-and-set against revision <code>{typeof version === "number" ? version : 0}</code>.
          </p>
        </Disclosure>
      </div>
    </div>
  );
}
