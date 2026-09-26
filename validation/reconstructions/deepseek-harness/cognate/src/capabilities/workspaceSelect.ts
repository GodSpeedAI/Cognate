// `workspace.select`: validates the chosen directory exists, derives a stable workspace id from its
// canonical (resolved) path, then starts `agent.config` to durably record `workspace.added` +
// `workspace.selected` (new workspace) or just `workspace.selected` (already known).
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { Component, SemanticRef } from "@cognate/kernel-api";
import type { Caller, RuntimeService } from "@cognate/runtime-api";
import { AGENT_CONFIG } from "../agents/agentConfig.ts";

export interface WorkspaceSelectInput {
  readonly path: string;
}

export function workspaceIdFor(path: string): string {
  return createHash("sha256").update(resolve(path)).digest("hex").slice(0, 16);
}

export function workspaceSelectComponent(options: {
  readonly getService: () => RuntimeService;
  readonly systemCaller: Caller;
  readonly getKnownWorkspaceIds: () => ReadonlySet<string>;
  readonly semanticRef?: SemanticRef;
}): Component {
  return {
    id: "workspace:select",
    provides: [{ id: "workspace.select", version: "1.0.0", semanticRef: options.semanticRef }],
    activate(fiber) {
      fiber.provide({ id: "workspace.select", version: "1.0.0", semanticRef: options.semanticRef }, async (rawInput) => {
        const input = rawInput as WorkspaceSelectInput;
        if (!input.path) throw new Error("workspace.select: path is required");
        const canonicalPath = resolve(input.path);
        const info = await stat(canonicalPath).catch(() => undefined);
        if (!info || !info.isDirectory()) throw new Error(`workspace.select: not a directory: ${canonicalPath}`);
        const workspaceId = workspaceIdFor(canonicalPath);
        const service = options.getService();
        const isNew = !options.getKnownWorkspaceIds().has(workspaceId);
        await service.startRun(options.systemCaller, {
          agent: AGENT_CONFIG,
          input: isNew
            ? { kind: "workspace.added", workspaceId, path: canonicalPath, title: canonicalPath.split("/").filter(Boolean).pop() ?? canonicalPath }
            : { kind: "workspace.selected", workspaceId },
          idempotencyKey: randomUUID(),
        });
        return { ok: true, workspaceId, path: canonicalPath };
      });
    },
  };
}
