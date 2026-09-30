// `agent.config`: deterministic. All side effects (secret write, provider hot-swap, path
// validation) happen in the `model.configure` / `workspace.select` capability handlers *before*
// this run is started (those handlers call `RuntimeService.startRun`, which is not recorded as an
// event itself, then this run durably records the resulting domain event). The run body only emits
// — no I/O, no randomness, replay-safe by construction.
import type { AgentDefinition } from "@cognate/runtime-api";
import type { SettingsPatch } from "../settings.ts";

export type AgentConfigInput =
  | { readonly kind: "model.configured"; readonly providerId: string; readonly baseURL: string; readonly protocol: "openai-compatible"; readonly model: string }
  | { readonly kind: "workspace.added"; readonly workspaceId: string; readonly path: string; readonly title: string }
  | { readonly kind: "workspace.selected"; readonly workspaceId: string }
  /** Usage pass U3: the sidebar's per-workspace Rename action (reference-behavior-matrix.md §12). */
  | { readonly kind: "workspace.renamed"; readonly workspaceId: string; readonly title: string }
  /** Usage pass U3: the sidebar's Delete workspace action — removes the record (and a current
   *  pointer to it); the workspace's sessions' events stay in history. */
  | { readonly kind: "workspace.deleted"; readonly workspaceId: string }
  | { readonly kind: "onboarding.dismissed"; readonly step: "notice" | "apikey" }
  | ({ readonly kind: "settings.changed" } & SettingsPatch);

export const AGENT_CONFIG = "agent.config";

export const agentConfigAgent: AgentDefinition = {
  id: AGENT_CONFIG,
  version: "1.0.0",
  async run(input, ctx) {
    const command = input as AgentConfigInput;
    switch (command.kind) {
      case "model.configured": {
        const { kind: _kind, ...payload } = command;
        await ctx.emit("model.configured", payload);
        return { ok: true };
      }
      case "workspace.added": {
        const { kind: _kind, ...payload } = command;
        await ctx.emit("workspace.added", payload);
        await ctx.emit("workspace.selected", { workspaceId: payload.workspaceId });
        return { ok: true };
      }
      case "workspace.selected": {
        const { kind: _kind, ...payload } = command;
        await ctx.emit("workspace.selected", payload);
        return { ok: true };
      }
      case "workspace.renamed": {
        const { kind: _kind, ...payload } = command;
        await ctx.emit("workspace.renamed", payload);
        return { ok: true };
      }
      case "workspace.deleted": {
        const { kind: _kind, ...payload } = command;
        await ctx.emit("workspace.deleted", payload);
        return { ok: true };
      }
      case "onboarding.dismissed": {
        const { kind: _kind, ...payload } = command;
        await ctx.emit("onboarding.dismissed", payload);
        return { ok: true };
      }
      case "settings.changed": {
        const { kind: _kind, ...payload } = command;
        await ctx.emit("settings.changed", payload);
        return { ok: true };
      }
      default: {
        const exhaustive: never = command;
        throw new Error(`agent.config: unknown command ${JSON.stringify(exhaustive)}`);
      }
    }
  },
};
