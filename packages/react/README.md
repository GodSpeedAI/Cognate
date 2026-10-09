# @godspeedai/cognate-react

React 19 bindings for Cognate: thin hooks over the headless client that put runs, live projections, frontend capabilities, continuations, and artifacts into your components. Design-system free — bring your own renderer.

**When to use this package:** you build a React front end for a Cognate runtime and want the state plumbing handled (subscriptions, replay, registration lifecycles) without adopting a component library. For ready-made chat/approval/artifact surfaces, layer [`@godspeedai/cognate-ui-astryx`](https://www.npmjs.com/package/@godspeedai/cognate-ui-astryx) on top.

## Installation

```sh
bun add @godspeedai/cognate-react
```

Requires [Bun](https://bun.sh) >= 1.4.0 and **React 19.3.0** (declared as a peer dependency, `"react": "19.3.0"`). Depends on [`@godspeedai/cognate-client`](https://www.npmjs.com/package/@godspeedai/cognate-client) — every hook reads through a `CognateClient`, which stays the single source of truth. The packages ship Bun-native TypeScript source; if you type-check outside Bun, add `@types/bun` and `@types/node`.

## Quick start

```tsx
import { createClient } from "@godspeedai/cognate-client";
import { CognateProvider, useAgent, useContinuations } from "@godspeedai/cognate-react";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";

const runtime = await createRuntime({
  store: ":memory:",
  agents: [myAgent],
  policy, // your kernel invocation policy
  actions, // your action authorization
});
const caller = { actor: { id: "alice", kind: "user" }, tenant: "tenant-a" };
const client = createClient({ service: runtime.service, caller });

function App() {
  const { start, runId, state } = useAgent("agent.support");
  const { open, resolve } = useContinuations(runId);

  return (
    <main>
      <button onClick={() => void start({ message: "I was double charged" })}>Ask</button>
      <p>{state?.text}</p>
      {open
        .filter((c) => (c.condition as { kind?: string } | null)?.kind === "human_approval")
        .map((c) => (
          <button key={c.id} onClick={() => void resolve(c.id, "resume", { approved: true })}>
            Approve {c.id}
          </button>
        ))}
    </main>
  );
}

// Wrap once, near the root:
<CognateProvider client={client}><App /></CognateProvider>;
```

## Hooks

| Hook | Purpose |
| --- | --- |
| `useCognate()` | the client from the nearest `CognateProvider` |
| `useRun(runId)` | live `RunState` of a run — status, streamed `text`, error, open continuations, artifacts, derived state |
| `useAgent(agent)` | `start(input)`, the latest `runId`, and its live state |
| `useSharedState(runId)` | the run's live shared state plus `update(patchOrSnapshot)`; writes resolve once durable and are observed by the suspended agent through `RunContext.state` |
| `useThreadSharedState(threadId)` | the same, shared by all runs in a thread |
| `useProjection(name)` | entries of a public projection |
| `useCapability(capability, handler)` | serves a frontend capability while the component is mounted; unregistered on unmount, leaving any open continuation waiting |
| `useRemoteCapability(offer, handler, options?)` | publishes a descriptor-backed remote capability for the mounted lifetime; `options.render` records the UI that served each durable call; returns `{ status, error }` |
| `useRemoteCapabilityHistory(runId)` | per-call render provenance for remote capability calls in a run (same-session only) |
| `useContinuations(runId)` | open continuations plus `resolve(id, "resume" \| "cancel", input?)` |
| `useArtifact(artifactId)` | fetches an artifact: `{ status, name, mediaType, text? }` (text decoded for `text/*` media types) |
| `useConnectionStatus()` | the client's connection status |

All subscription hooks are `useSyncExternalStore` adapters over the client's reactive stores, so they work under server rendering too: the client replays buffered history into the first subscription.

## Limitations

- The package renders nothing and styles nothing; it is hooks and a provider. Astryx types and components stay out by design.
- Remote-capability render provenance lives in the mounted provider's memory — after a full page reload the durable calls remain inspectable, but the original renderer component is gone.
- `useCapability` and `useRemoteCapability` follow component lifetime: unmounting withdraws the capability or offer; an agent mid-wait stays waiting rather than falling back.

## Related packages

- [`@godspeedai/cognate-client`](https://www.npmjs.com/package/@godspeedai/cognate-client) — the headless client these hooks bind.
- [`@godspeedai/cognate-ui-astryx`](https://www.npmjs.com/package/@godspeedai/cognate-ui-astryx) — reference Astryx components built on this package.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) — the runtime serving the runs.
- [`@godspeedai/cognate-profile-copilot`](https://www.npmjs.com/package/@godspeedai/cognate-profile-copilot) — a composed interactive chat application using these bindings.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
