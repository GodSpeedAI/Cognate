# @godspeedai/cognate-profile-copilot

The Copilot reference profile: a complete interactive chat application composed from existing Cognate packages — a model-and-tool agent loop, human approvals, frontend tools served by the browser, shared state and artifact projections, an AG-UI endpoint, and React/Astryx surfaces. It adds no new kernel or runtime primitives; every piece is a package you can also use separately.

**When to use this package:** you want a working chat-copilot skeleton (streamed replies, approval-gated backend tools, browser-served tools, generative UI) to run as-is or study before composing your own. For an autonomous, session-and-scheduler style agent instead, see [`@godspeedai/cognate-profile-harness`](https://www.npmjs.com/package/@godspeedai/cognate-profile-harness).

## Installation

```sh
bun add @godspeedai/cognate-profile-copilot
```

Requires [Bun](https://bun.sh) >= 1.4.0 and **React 19.3.0** with **react-dom 19.3.0** (both declared as peer dependencies). It builds on [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun), [`@godspeedai/cognate-ag-ui`](https://www.npmjs.com/package/@godspeedai/cognate-ag-ui), [`@godspeedai/cognate-react`](https://www.npmjs.com/package/@godspeedai/cognate-react), and [`@godspeedai/cognate-ui-astryx`](https://www.npmjs.com/package/@godspeedai/cognate-ui-astryx); the model connects through [`@godspeedai/cognate-provider-openai-compatible`](https://www.npmjs.com/package/@godspeedai/cognate-provider-openai-compatible).

## Quick start

```tsx
import { createClient } from "@godspeedai/cognate-client";
import { openAICompatible } from "@godspeedai/cognate-provider-openai-compatible";
import { COPILOT_AGENT, createCopilotApp, GenerativeSurface } from "@godspeedai/cognate-profile-copilot";
const app = await createCopilotApp({
  store: "./copilot.sqlite",
  model: openAICompatible({
    id: "main",
    baseURL: process.env.MODEL_BASE_URL!,
    model: "my-model",
    apiKey: () => process.env.MODEL_API_KEY!, // read per request, never stored
  }),
  instructions: "You are a support copilot.",
  backendTools: [
    {
      contract: { id: "refund.approve", version: "1.0.0" },
      description: "Issue a refund",
      inputSchema: { type: "object" },
      handler: (input) => ({ refunded: (input as { amount: number }).amount }),
      requiresApproval: true, // pauses the run as a human-approval continuation
      statePatch: (input) => [{ op: "add", path: "/refund", value: { amount: (input as { amount: number }).amount, status: "refunded" } }],
      render: (input) => ({ component: "RefundCard", props: { amount: (input as { amount: number }).amount } }),
      artifact: (input, output) => ({ name: "refund-receipt.json", mediaType: "application/json", content: JSON.stringify({ request: input, result: output }) }),
    },
  ],
  frontendTools: [{ name: "map.focus", description: "Focus the map", inputSchema: { type: "object" } }],
});

// Serve the AG-UI endpoint (SSE) for browser clients:
Bun.serve({ port: 3000, fetch: app.agUi });
```

A connected client serves `map.focus` itself and resolves the approval:

```tsx
import { useCapability } from "@godspeedai/cognate-react";

const caller = { actor: { id: "alice", kind: "user" }, tenant: "tenant-a" };
const client = createClient({ service: app.runtime.service, caller });
client.provideCapability("map.focus", (input) => ({ centered: true }));

// Or per component lifetime:
function MapTool() {
  useCapability("map.focus", (input) => ({ centered: true }));
  return null;
}

// Render a run's generative-UI events with your own component registry:
function Surface({ runId }: { runId: string }) {
  return <GenerativeSurface runId={runId} components={{ RefundCard: (props) => <b>Refund of {String(props.amount)}</b> }} />;
}
```

An unknown component name renders a placeholder instead of throwing, and the surface works under server-side rendering because the client replays its buffered events into the first subscription.

## What the profile composes

| Concern | Backing package |
| --- | --- |
| runtime, durable runs | [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) |
| continuations (approvals) | [`@godspeedai/cognate-continuations`](https://www.npmjs.com/package/@godspeedai/cognate-continuations) |
| frontend capabilities | [`@godspeedai/cognate-runtime-api`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-api) |
| state/artifact projections | [`@godspeedai/cognate-client`](https://www.npmjs.com/package/@godspeedai/cognate-client) |
| AG-UI endpoint | [`@godspeedai/cognate-ag-ui`](https://www.npmjs.com/package/@godspeedai/cognate-ag-ui) |
| React bindings | [`@godspeedai/cognate-react`](https://www.npmjs.com/package/@godspeedai/cognate-react) |
| UI surfaces | [`@godspeedai/cognate-ui-astryx`](https://www.npmjs.com/package/@godspeedai/cognate-ui-astryx) |

The exported `copilotProfile` and `copilotRegistry` declare this composition by name (`resolveProfile` from [`@godspeedai/cognate-profile`](https://www.npmjs.com/package/@godspeedai/cognate-profile) resolves every entry to an existing package), and `COPILOT_AGENT` is the built-in agent id (`agent.copilot`).

Inside a run, the copilot agent streams model output as `message.delta`, invokes approved backend tools through its capability contracts, serves frontend tools to the client as continuations, and publishes `state.changed`, `ui.render`, and artifact events that the client folds into shared state, generative UI, and the artifact list. A run survives a full application restart: waiting continuations resume where they left off.

## Limitations

- The built-in AG-UI endpoint authenticates with the development `Bearer <tenant>:<user>` token convention — bring your own `authenticate` (compose `createAgUiHandler` from `@godspeedai/cognate-ag-ui` directly) for anything real.
- One copilot agent per app instance; multi-agent routing is yours to add.
- `requiresApproval` gates on a human decision only — there is no auto-approve or delegation policy built in.

## Related packages

- [`@godspeedai/cognate-profile-harness`](https://www.npmjs.com/package/@godspeedai/cognate-profile-harness) — the autonomous profile (tools, scheduler, sandbox, subagents).
- [`@godspeedai/cognate-provider-openai-compatible`](https://www.npmjs.com/package/@godspeedai/cognate-provider-openai-compatible) — the model provider used by `createCopilotApp`.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
