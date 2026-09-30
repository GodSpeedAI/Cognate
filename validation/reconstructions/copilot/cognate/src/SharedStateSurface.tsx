import { useCognate, useThreadSharedState } from "@cognate/react";
import { CognateShell } from "@cognate/ui-astryx";
import { useState } from "react";
import { JOURNEY_C_AGENT } from "./constants.ts";

type Todo = { readonly id: string; readonly text: string };
const THREAD_ID = "thread:j-c";

function todosIn(state: unknown): readonly Todo[] {
  if (typeof state !== "object" || state === null || !Array.isArray((state as { todos?: unknown }).todos)) return [];
  return (state as { todos: readonly Todo[] }).todos;
}

/**
 * Canvas for J-C. The live thread-scoped durable state stream (`state.stream` / `state.observe` in
 * the interaction model) is the single rendering authority, matching the reference's one live
 * `state` channel. The derived `shared-state-canvas` projection is settlement evidence, asserted by
 * the journey test, not a second live source: `useProjection` reads a materialized fold with no
 * position, so it can lag the very event that triggered the read (DEBT-021).
 */
export function SharedStateSurface() {
  const client = useCognate();
  const { state, version, update } = useThreadSharedState(THREAD_ID);
  const [running, setRunning] = useState(false);
  const todos = todosIn(state);

  const start = async (phase: "write" | "observe") => {
    setRunning(true);
    try {
      await client.startRun(JOURNEY_C_AGENT, { phase }, { correlationId: THREAD_ID });
    } finally {
      setRunning(false);
    }
  };

  return (
    <CognateShell title="Cognate Shared State">
      <button type="button" disabled={running} onClick={() => void start("write")}>Start agent write</button>
      <output aria-label="Canvas todos">{todos.map((todo) => todo.text).join(", ")}</output>
      <button
        type="button"
        disabled={todos.length === 0}
        onClick={() => void update({ patch: [{ op: "add", path: "/todos/-", value: { id: "user", text: "user todo" } }] }, { expectedVersion: version })}
      >
        Save canvas edit
      </button>
      <button type="button" disabled={running || todos.length === 0} onClick={() => void start("observe")}>Start agent observation</button>
    </CognateShell>
  );
}
