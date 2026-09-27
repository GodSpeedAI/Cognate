// Public projection `subagents`: one row per `subagent` tool call, keyed
// `${tenant}/${sessionId}/${toolCallId}`. Folds `subagent.spawned`/`subagent.completed` — the app
// events `agent.coding` emits around `spawnSubagent` (`@cognate/profile-harness`) for journey
// `J-F-delegation` (canonical-journey-catalog.md; `.sea/interaction/interaction-model.sea`'s `Entity
// "Subagent"`). Read by the UI (`useProjection("subagents")`) for the session banner's "N
// subagent(s)" disclosure and the "Subagent sessions" tree (reference-behavior-matrix.md §6.4,
// `14b-subagent-completed-panel`). Child runs are NOT sessions — this projection is the only place
// their existence is recorded for the UI; `sessions.ts` explicitly excludes them (only "session:"-
// correlated runs are folded there).
import type { Json } from "@cognate/events";
import type { Projection } from "@cognate/projections";

export interface SubagentRow {
  readonly sessionId: string;
  readonly toolCallId: string;
  /** The `subagent` tool call's `description` argument — the row's title. */
  readonly title: string;
  /** The `subagent` tool call's `prompt` argument, truncated — the row's secondary text. */
  readonly desc: string;
  readonly status: "running" | "completed" | "failed";
  readonly startedAt: string;
  readonly completedAt?: string;
}

const DESC_MAX = 40;

function truncate(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export const subagentsProjection: Projection = {
  name: "subagents",
  version: "1.0.0",
  apply(event, state) {
    if (event.eventType === "subagent.spawned") {
      const payload = event.payload as unknown as {
        readonly sessionId: string;
        readonly toolCallId: string;
        readonly description: string;
        readonly prompt: string;
      };
      const key = `${event.tenant}/${payload.sessionId}/${payload.toolCallId}`;
      const row: SubagentRow = {
        sessionId: payload.sessionId,
        toolCallId: payload.toolCallId,
        title: payload.description,
        desc: truncate(payload.prompt, DESC_MAX),
        status: "running",
        startedAt: event.recordedAt,
      };
      return [{ key, value: row as unknown as Json }];
    }
    if (event.eventType === "subagent.completed" || event.eventType === "subagent.failed") {
      const payload = event.payload as unknown as { readonly sessionId: string; readonly toolCallId: string };
      const key = `${event.tenant}/${payload.sessionId}/${payload.toolCallId}`;
      const existing = state.get(key) as unknown as SubagentRow | undefined;
      if (!existing) return [];
      const row: SubagentRow = {
        ...existing,
        status: event.eventType === "subagent.completed" ? "completed" : "failed",
        completedAt: event.recordedAt,
      };
      return [{ key, value: row as unknown as Json }];
    }
    return [];
  },
};
