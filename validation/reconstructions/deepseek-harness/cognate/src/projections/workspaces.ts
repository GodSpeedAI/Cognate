// Public projection `workspaces`: one key per `WorkspaceRecord` plus a `current` pointer.
import type { Projection } from "@cognate/projections";

export const workspacesProjection: Projection = {
  name: "workspaces",
  version: "1.0.0",
  apply(event, state) {
    if (event.eventType === "workspace.added") {
      const payload = event.payload as { readonly workspaceId: string; readonly path: string; readonly title: string };
      return [{ key: `${event.tenant}/record/${payload.workspaceId}`, value: { id: payload.workspaceId, path: payload.path, title: payload.title } }];
    }
    if (event.eventType === "workspace.selected") {
      const payload = event.payload as { readonly workspaceId: string };
      return [{ key: `${event.tenant}/current`, value: payload.workspaceId }];
    }
    return [];
  },
};
