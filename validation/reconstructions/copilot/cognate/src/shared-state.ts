import type { Json } from "@godspeedai/events";
import type { Projection } from "@godspeedai/projections";
import { applyStateUpdate, StatePatchError, type AgentDefinition, type StateUpdate } from "@godspeedai/runtime-api";

export const JOURNEY_C_AGENT = "copilotkit-reconstruction.shared-state";

/** A public canvas view folded only from durable shared-state events; the run state remains the authority. */
export const sharedStateCanvasProjection: Projection = {
  name: "shared-state-canvas",
  version: "1",
  apply(event, state) {
    if (event.eventType !== "state.changed" || event.metadata?.scope !== "thread") return [];
    const key = `${event.tenant}/thread/${event.correlationId}`;
    try {
      return [{ key, value: applyStateUpdate(state.get(key) ?? null, event.payload as StateUpdate) }];
    } catch (error) {
      if (error instanceof StatePatchError) return [];
      throw error;
    }
  },
};

export const sharedStateAgent: AgentDefinition = {
  id: JOURNEY_C_AGENT,
  version: "1.0.0",
  async run(input, ctx): Promise<Json> {
    if ((input as { readonly phase?: unknown }).phase === "write") {
      await ctx.updateSharedState("seed-todos", { snapshot: { todos: [{ id: "agent", text: "agent todo" }] } });
      return { written: true };
    }
    const state = await ctx.sharedState("observed-todos");
    const todos = typeof state === "object" && state !== null && !Array.isArray(state) ? state.todos : null;
    return { todos: Array.isArray(todos) ? todos : [] };
  },
};
