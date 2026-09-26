// Public projection `sessions`: keyed `${tenant}/${sessionId}` (per the architecture table's
// "Session" row). Title = first message, truncated (reference's `first-prompt` cadence).
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
            title: existing?.title ?? titleFrom(payload.message),
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
            title: existing?.title ?? "New Session",
            lastStatus: "completed",
            updatedAt: event.recordedAt,
          },
        },
      ];
    }
    return [];
  },
};
