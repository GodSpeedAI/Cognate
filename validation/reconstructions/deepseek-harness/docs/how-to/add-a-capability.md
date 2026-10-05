# How to add a capability

A capability is the app's unit of invokable I/O. This is the full vertical slice: a new feature that
the operator triggers, or that the agent invokes, and whose result is durable.

Use this as the template for **any durable feature**: a settings toggle, a new operator action, a new
agent-side lookup. If the feature needs no durable record (pure presentation), you do not need a
capability — start at the UI.

The worked example is a new operator setting, `settings.toggleSidebarDensity`, because it touches
every layer: component, policy, agent, event, projection, UI.

## Prerequisites

- The app running locally (`cd cognate && COGNATE_HARNESS_HOME=/tmp/cg bun run dev`).
- Familiarity with [../subsystems/capabilities.md](../subsystems/capabilities.md) and
  [../subsystems/projections.md](../subsystems/projections.md).
- A decision: does this need to be durable, and does it have a meaning in the Interaction Domain
  Model? Those are two separate questions and they lead to different amounts of work.

## Procedure

### 1. The event, and who may emit it

Add the event type to `AgentConfigInput` if the change should be recorded by a config run:

```ts
// cognate/src/agents/agentConfig.ts
| { readonly kind: "settings.changed"; readonly workDetails: WorkDetailsMode }
```

Note the shape: `agent.config` is a *pure emitter*. Its doc comment states the rule — all real side
effects happen in the capability handler *before* the run starts, and the run only emits. Follow that,
or replay-safety is lost.

If the change should instead be recorded by an agent mid-turn, emit it directly with `ctx.emit` from
`agent.coding`, as `todo_write` does.

### 2. The capability component

Create `cognate/src/capabilities/<name>.ts` following the existing shape exactly — note that the id
appears in **both** `provides` and `fiber.provide`, by convention in this codebase:

```ts
import { randomUUID } from "node:crypto";
import type { Component, SemanticRef } from "@cognate/kernel-api";
import type { Caller, RuntimeService } from "@cognate/runtime-api";
import { AGENT_CONFIG } from "../agents/agentConfig.ts";

export interface SettingsToggleInput { readonly dense: boolean; }

export function settingsToggleComponent(options: {
  readonly getService: () => RuntimeService;
  readonly systemCaller: Caller;
  readonly semanticRef?: SemanticRef;
}): Component {
  return {
    id: "settings:toggle",
    provides: [{ id: "settings.toggle", version: "1.0.0", semanticRef: options.semanticRef }],
    activate(fiber) {
      fiber.provide({ id: "settings.toggle", version: "1.0.0", semanticRef: options.semanticRef }, async (rawInput) => {
        const input = rawInput as SettingsToggleInput;
        if (typeof input.dense !== "boolean") throw new Error("settings.toggle: dense must be a boolean");
        const service = options.getService();
        await service.startRun(options.systemCaller, {
          agent: AGENT_CONFIG,
          input: { kind: "settings.changed", workDetails: /* … */ },
          idempotencyKey: randomUUID(),
        });
        return { ok: true };
      });
    },
  };
}
```

**Rules that matter here.** Validate input and name the capability in the error. Never echo a secret.
Do all side effects before starting the run. If you need the runtime, take `getService` — the service
does not exist when the component is constructed.

### 3. The projection

Create `cognate/src/projections/<name>.ts`. Pure, no I/O, tenant-prefixed key:

```ts
export const settingsProjection: Projection = {
  name: "settings",
  version: "1.0.0",
  apply(event) {
    if (event.eventType !== "settings.changed") return [];
    return [{ key: `${event.tenant}/current`, value: { workDetails: (event.payload as any).workDetails, updatedAt: event.recordedAt } }];
  },
};
```

If the new field belongs on an **existing** projection row, extend that projection's fold instead —
but check whether anything relies on the row's whole shape, and whether a missing field is meaningful
(a missing `settings` row is what means "default"). If it is a genuinely new read, prefer a new
projection: projections are cheap and independent.

### 4. Wire it into the runtime

In `cognate/src/server.ts`:

```ts
import { settingsToggleComponent } from "./capabilities/settingsToggle.ts";
// …
components: [
  // …
  settingsToggleComponent({ getService, systemCaller: SYSTEM_CALLER, semanticRef: /* … */ }),
],
```

If the component needs the registry or something else that exists only after `createRuntime`, mount it
afterwards with `await runtime.kernel.mount(...)` instead, as `workspace:select` and
`model.configure` are.

### 5. Allow it in the policy

**This step is easy to forget and produces an opaque permission error.**

```ts
// cognate/src/server.ts
const GRANTED_CAPABILITIES = [ /* … */, "settings.toggle"];
```

### 6. Bind it to the domain model, if it has meaning there

Only if the IDM has an entity this capability realizes. Add the pair to the relevant
`tranche*Bindings` **and** the destructuring in `bindTranche*` **and** update the expected count — the
count assertion at boot is what catches a half-finished edit:

```ts
// cognate/domain/index.ts
{ semanticId: domain.semanticId("PlanMode"), capability: { id: "settings.toggle", version: "1.0.0" } }
// …and in bindTranche9:
const [planState, settingsToggle] = contracts as [CapabilityContract, CapabilityContract];
if (contracts.length !== 2) throw new Error("domain: expected 2 bound contracts, got " + contracts.length);
```

If there is no entity — as with `onboarding.dismiss` and `settings.changeWorkDetails` — pass **no**
`semanticRef` and leave it unbound. That is a legitimate, recorded choice, not an oversight.
`cognate/.sea/interaction/handoff.md` forbids binding speculatively.

### 7. Share the vocabulary

If the UI and the backend both need the value set, put it in a module both can import, as
`src/workDetails.ts` does for the four presentation modes. Do not duplicate a union in two files.

### 8. Call it from the UI

```ts
// cognate/src/ui/App.tsx
const setDense = useCallback((dense: boolean) => { void client.invoke("settings.toggle", { dense }); }, [client]);
```

Read the resulting state from the projection, never from the invoke's return value — the projection is
what survives a restart.

## Implementation locations

| Concern | File |
|---|---|
| Command union | `cognate/src/agents/agentConfig.ts` |
| Emitter | same file, a `case` in the switch |
| Capability | `cognate/src/capabilities/<name>.ts` |
| Fold | `cognate/src/projections/<name>.ts` |
| Mount + policy | `cognate/src/server.ts` (`components`, `GRANTED_CAPABILITIES`, `projections`) |
| Binding | `cognate/domain/index.ts` |
| Invocation + rendering | `cognate/src/ui/App.tsx` |

## Validation

```bash
cd cognate
bun run typecheck
bun test test
```

Then the manual check that matters most, because it is the property the architecture exists for:

1. Fresh home, invoke the new capability, stop the app, restart with the same home.
2. Read the projection. The change is there.
3. Confirm the browser shows the new state from the projection, not from local state.

A new feature that survives only a page reload has a bug: something is being held in component memory
instead of derived from the log.

## Common failure symptoms

| Symptom | Cause |
|---|---|
| Permission denied invoking the new capability | missing from `GRANTED_CAPABILITIES` (step 5) |
| Boot throws `expected N bound contracts` | step 6's count assertion — the list and the destructuring disagree |
| The change is lost on restart | a component-local flag instead of an event, or a projection that was never registered in `server.ts` |
| The UI shows the change, then it reverts | the UI read its own state instead of the projection |
| A secret ended up in the log | the capability was invoked with `ctx.invoke` instead of `client.invoke` |
| The feature works in tests but not in the browser | the capability id is not in the allowlist, and tests use the same path — check `server.ts` was restarted |

## Rollback

Remove the event type, the `case` in `agent.config`, the component, the `GRANTED_CAPABILITIES` entry,
the projection registration, and the UI call site. **Leave the projection registered** if any recorded
events already exist for the tenant: a projection that stops folding its own history makes old rows
unreachable rather than deleted, which is confusing but not corrupting. Nothing in the event log needs
migrating — the app has no schema migration step, by design.

## Related

- [add-a-tool.md](add-a-tool.md) — when the model should be able to call it
- [add-a-projection.md](add-a-projection.md) — the read side on its own
- [../reference/capabilities.md](../reference/capabilities.md) — the full existing contract set
- [../explanation/durability-model.md](../explanation/durability-model.md) — why the slice touches four files
