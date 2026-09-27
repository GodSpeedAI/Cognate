// `workspace.path`: resolves a `workspaceId` to its canonical on-disk path via the `workspaces`
// projection. `agent.coding`'s tool loop needs this to scope every `tool.<name>` call to the right
// workspace root (`ctx.invoke("workspace.path", ...)`, so the lookup is itself recorded/replayable).
import type { Component, SemanticRef } from "@cognate/kernel-api";
import type { RuntimeService } from "@cognate/runtime-api";

export interface WorkspacePathInput {
  readonly workspaceId: string;
}
export interface WorkspacePathResult {
  readonly path: string;
}

export function workspacePathComponent(getService: () => RuntimeService, semanticRef?: SemanticRef): Component {
  return {
    id: "workspace:path",
    provides: [{ id: "workspace.path", version: "1.0.0", semanticRef }],
    activate(fiber) {
      fiber.provide({ id: "workspace.path", version: "1.0.0", semanticRef }, async (rawInput, ctx): Promise<WorkspacePathResult> => {
        const input = rawInput as WorkspacePathInput;
        const service = getService();
        const caller = { actor: ctx.actor, tenant: ctx.tenant ?? "local" };
        const rows = await service.readProjection(caller, { name: "workspaces" });
        const row = rows.find((r) => r.key === `record/${input.workspaceId}`);
        if (!row) throw new Error(`workspace.path: unknown workspaceId ${input.workspaceId}`);
        const value = row.value as { readonly path: string };
        return { path: value.path };
      });
    },
  };
}
