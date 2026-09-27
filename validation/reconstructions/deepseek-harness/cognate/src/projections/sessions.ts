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

export const sessionsProjection: Projection = {
  name: "sessions",
  version: "1.0.0",
  apply(event, state) {
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
            updatedAt: event.recordedAt,
          },
        },
      ];
    }
    return [];
  },
};
