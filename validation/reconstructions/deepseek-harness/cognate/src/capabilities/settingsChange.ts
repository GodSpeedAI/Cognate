// `settings.changeWorkDetails`: the capability Settings -> General -> "Work details" invokes on
// selecting a mode (reference-behavior-matrix.md §10 — "Choose how much detail to show for tool
// calls", default "Standard"). Like `onboarding.dismiss` / `workspace.select` / `model.configure`,
// this is a `client.invoke` capability whose only side effect is starting a deterministic
// `agent.config` run so the durable event log — not component-local memory — is what the current
// work-details preference is derived from: it survives a reload AND a full runtime restart, the
// same durability every other setting in this app has.
import { randomUUID } from "node:crypto";
import type { Component, SemanticRef } from "@cognate/kernel-api";
import type { Caller, RuntimeService } from "@cognate/runtime-api";
import { AGENT_CONFIG } from "../agents/agentConfig.ts";
import { isWorkDetailsMode } from "../workDetails.ts";

export interface SettingsChangeWorkDetailsInput {
  readonly workDetails: string;
}

export function settingsChangeWorkDetailsComponent(options: {
  readonly getService: () => RuntimeService;
  readonly systemCaller: Caller;
  readonly semanticRef?: SemanticRef;
}): Component {
  return {
    id: "settings:changeWorkDetails",
    provides: [{ id: "settings.changeWorkDetails", version: "1.0.0", semanticRef: options.semanticRef }],
    activate(fiber) {
      fiber.provide({ id: "settings.changeWorkDetails", version: "1.0.0", semanticRef: options.semanticRef }, async (rawInput) => {
        const input = rawInput as SettingsChangeWorkDetailsInput;
        if (!isWorkDetailsMode(input.workDetails)) {
          throw new Error("settings.changeWorkDetails: workDetails must be one of compact, standard, detailed, verbose");
        }
        const service = options.getService();
        await service.startRun(options.systemCaller, {
          agent: AGENT_CONFIG,
          input: { kind: "settings.changed", workDetails: input.workDetails },
          idempotencyKey: randomUUID(),
        });
        return { ok: true };
      });
    },
  };
}
