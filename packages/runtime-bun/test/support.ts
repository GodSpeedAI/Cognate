import type { Component, Policy } from "@godspeedai/kernel-api";
import type { KitSetup } from "@godspeedai/runtime-api/conformance";
import type { ActionPolicy } from "../src/index.ts";

export function kitPolicies(setup: KitSetup): { policy: Policy; actions: ActionPolicy; components: Component[] } {
  return {
    policy: { authorize: (r) => (r.actor.id === setup.deniedPrincipal ? { allow: false, policyId: "kit", reason: `${r.actor.id} denied` } : { allow: true, policyId: "kit", reason: "allowed" }) },
    // Per KitSetup: the denied principal may start runs but may not invoke capabilities, act on continuations, or write run state.
    actions: {
      authorize: ({ caller, action }) =>
        caller.actor.id === setup.deniedPrincipal && (action.startsWith("continuation.") || action.startsWith("run.state.") || action.startsWith("thread.state."))
          ? { allow: false, reason: `${caller.actor.id} denied` }
          : { allow: true, reason: "allowed" },
    },
    components: [
      {
        id: "lookup-provider",
        provides: [{ id: "tool.lookup", version: "1.0.0" }],
        activate: (fiber) => fiber.provide({ id: "tool.lookup", version: "1.0.0" }, (input) => setup.lookup(input as { key: string })),
      },
      {
        id: "progress-provider",
        provides: [{ id: "tool.progress", version: "1.0.0" }],
        activate: (fiber) =>
          fiber.provide({ id: "tool.progress", version: "1.0.0" }, async (input, ctx) => {
            for (let i = 0; i < 3; i++) await ctx.progress?.({ i });
            return { input };
          }),
      },
    ],
  };
}
