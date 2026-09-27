// Public projection `sessions`: keyed `${tenant}/${sessionId}` (per the architecture table's
// "Session" row). Title = the session's first *assistant* answer, truncated — this matches the
// reference (see reference/observations/aria/15-completed-session.desktop.txt: the sidebar
// treeitem label is the raw markdown of the answer, e.g. "# Summary Here is what I found: ...",
// not the user's prompt). Before the first answer lands, the row falls back to "New Session"
// (see reference/observations/aria/04-workspace-selected.desktop.txt: the fresh session treeitem
// name is "New Session"). We do not implement the reference's `all-prompts` LLM re-titling
// cadence — see APP/README.md "Known gaps".
import type { Json } from "@cognate/events";
import type { Projection } from "@cognate/projections";

const TITLE_MAX = 80;

function titleFrom(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  return trimmed.length > TITLE_MAX ? `${trimmed.slice(0, TITLE_MAX - 1)}…` : trimmed;
}

/** `startRun`'s `correlationId` for `agent.coding` is always `session:<sessionId>` — the only way
 *  to recover which session a runId (and a bare `run.waiting`, which carries neither) belongs to. */
function sessionIdFromCorrelation(correlationId: string): string | undefined {
  return correlationId.startsWith("session:") ? correlationId.slice("session:".length) : undefined;
}

export const sessionsProjection: Projection = {
  name: "sessions",
  version: "1.0.0",
  apply(event, state) {
    // T10 (J-F-delegation): a subagent's child run is `agent.coding` too, so it emits the same
    // `session.turn.started`/`message.completed` event types as a real session turn — but
    // correlated `subagent:<parentRunId>:<id>`, not `session:<id>`. Excluding anything not
    // "session:"-correlated is what keeps children out of the sidebar's session tree (they are
    // tracked instead by the `subagents` projection — see `src/projections/subagents.ts`).
    if (!event.correlationId.startsWith("session:")) return [];
    if (event.eventType === "session.turn.started") {
      const payload = event.payload as { readonly sessionId: string; readonly workspaceId: string; readonly message: string };
      const key = `${event.tenant}/${payload.sessionId}`;
      const existing = state.get(key) as Record<string, Json> | undefined;
      return [
        {
          key,
          value: {
            id: payload.sessionId,
            workspaceId: payload.workspaceId,
            title: existing?.title ?? "New Session",
            lastStatus: "running",
            runId: event.runId,
            updatedAt: event.recordedAt,
          },
        },
      ];
    }
    if (event.eventType === "message.completed") {
      const payload = event.payload as { readonly sessionId: string; readonly workspaceId: string; readonly text: string };
      const key = `${event.tenant}/${payload.sessionId}`;
      const existing = state.get(key) as Record<string, Json> | undefined;
      return [
        {
          key,
          value: {
            id: payload.sessionId,
            workspaceId: payload.workspaceId,
            title: existing?.title && existing.title !== "New Session" ? existing.title : titleFrom(payload.text),
            lastStatus: "completed",
            runId: event.runId,
            updatedAt: event.recordedAt,
          },
        },
      ];
    }
    // `run.waiting` (e.g. a pending tool approval): carries neither `sessionId` nor `workspaceId`
    // in its payload, only `runId`/`correlationId` on the envelope. Reproduces "Waiting for
    // approval <title>" surviving a reload (`11b-approval-pending-after-reload`): the sidebar/App
    // needs to know a session's run is waiting so it can reattach to the live run on reopen.
    if (event.eventType === "run.waiting") {
      const sessionId = sessionIdFromCorrelation(event.correlationId);
      if (!sessionId) return [];
      const key = `${event.tenant}/${sessionId}`;
      const existing = state.get(key) as Record<string, Json> | undefined;
      if (!existing) return [];
      return [{ key, value: { ...existing, lastStatus: "waiting", runId: event.runId } }];
    }
    return [];
  },
};
