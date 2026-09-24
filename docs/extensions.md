# Extending Cognate: capabilities, components, adapters, providers, profiles

Cognate has one extension mechanism, not several: everything below is a `Component` that declares requirements and provides `CapabilityContract`s into a `Scope` (see [concepts.md](concepts.md)). A profile composes existing components; it never introduces a new kernel primitive (spec §40.J/K).

## Capabilities as the extension surface

To add behavior, publish a `CapabilityContract` from a `Component`'s `activate` function (see [concepts.md](concepts.md#components-fibers-and-lifecycle)). Consumers declare a `Requirement`; eligibility is deterministic (`isCompatible`), and selection among eligible providers can be ranked but never widened (see [cognition.md](cognition.md#adaptive-selection)). This is how model providers, tool registries, storage, and UI capabilities all plug in — there is no separate "plugin API."

## Model providers (spec §26)

No LLM SDK is required by the kernel. `ModelProvider` is a capability contract with conceptual flags: `generate`, `stream`, `tool_use`, `structured_output`, `multimodal_input`, `context_limit`. Provider selection may use cognitive ranking, but only after deterministic compatibility and policy constraints (see [cognition.md](cognition.md)).

Two reference providers:

- **[`@cognate/provider-local`](../packages/provider-local/README.md)** — a deterministic, rule-scripted provider for tests, demos, and offline fallback. `localProvider(options)` matches `rules` in order by case-insensitive substring of the last user message; no match returns a fixed reply. Every feature flag is `true` except `multimodal_input`.
- **[`@cognate/provider-openai-compatible`](../packages/provider-openai-compatible/README.md)** — targets any OpenAI-compatible `/chat/completions` endpoint (llama.cpp, vLLM, Ollama, hosted APIs) using `fetch` directly, no vendor SDK. `apiKey()` is called per request and never stored, logged, or placed in an error message or capability contract ([security.md](security.md)). `modelComponent(provider)` wraps a provider as a kernel `Component` publishing `model.generate`.

A provider is replaceable without consumers importing its concrete implementation; removing a provider capability deterministically deactivates dependent fibers, and restoring a compatible one may reactivate them (spec §29.2, kernel dependency closure — see [concepts.md](concepts.md#components-fibers-and-lifecycle)).

## Adapters

An adapter binds a framework-owned contract to a specific engine or external system, keeping the engine's types out of the framework's public API (spec §3.4):

| Adapter | Contract | Engine | Docs |
|---|---|---|---|
| `kernel-cordis` | `KernelFactory` | Cordis | [architecture.md](architecture.md) |
| `domainforge` | `SemanticRef` production | `@godspeedai/domainforge` | [semantics.md](semantics.md) |
| `cognitive-ruvector` | `CognitiveIndex` | `@ruvector/core` | [cognition.md](cognition.md) |
| `cognitive-rvf` | portable snapshot | `@ruvector/rvf` | [rvf.md](rvf.md) |
| `realitytrace` | `ObservationPort` | SXR CLI | [evidence.md](evidence.md) |
| `protocol-connect` | `RuntimeService` over RPC | Connect | [protocols.md](protocols.md) |

Building a new adapter means implementing the relevant framework-owned interface and passing its conformance kit (e.g. `kernelConformance`, `cognitiveIndexConformance`) unchanged — the kit, not a bespoke test, is what proves interchangeability.

## Profiles: `defineProfile`

[`@cognate/profile`](../packages/profile/README.md) treats a profile as pure composition (spec §29, §40.J/K): a named, ordered selection of registered component names plus per-component options. `defineProfile` validates a non-empty name and unique non-empty component names, and returns a deep-frozen `ProfileDefinition`.

```ts
import { defineProfile } from "@cognate/profile";

export default defineProfile({
  name: "research-workbench",
  components: ["sessions", "agents", "browser", "artifacts", "cognition", "realitytrace", "connect", "ui"],
});
```

`resolveProfile(profile, registry)` looks up each requested component name in a caller-supplied `ComponentEntry[]` registry, in profile order. An unknown name resolves with reason `"unknown component"`; an entry marked `supported: false` resolves with its own reason; only supported entries have `contribute(profile.options[name])` called. Every requested-but-missing component is reported in `unresolved` — nothing is silently dropped. `CG-PRF-001` (`defineProfile` composes without new kernel concepts) is `implemented`.

### Reference profile: Copilot (spec §29.1)

[`profiles/copilot`](../profiles/copilot/src/index.tsx) composes runtime + runs + continuations + frontend capabilities + state/artifact projections + AG-UI + React bindings + Astryx UI, to demonstrate common Copilot-style behavior needs no profile-specific kernel primitive. Its contract ([`profiles/copilot/src/index.tsx`](../profiles/copilot/src/index.tsx)):

```tsx
interface BackendTool {
  contract: CapabilityContract;
  description: string;
  inputSchema: { [key: string]: Json };
  handler: (input: Json) => Json | Promise<Json>;
  requiresApproval?: boolean;              // pause for human approval (a Continuation) before invoking
  statePatch?: (input: Json, output: Json) => readonly { op: string; path: string; ... }[]; // RFC 6902 patch, emitted as `state.changed`
}
createCopilotApp(options: CopilotAppOptions): Promise<CopilotApp>;
GenerativeSurface(props: { runId: string; components: Record<string, (props: Json) => ReactNode> }): ReactNode;
```

The copilot agent loops model → tool calls → backend tools (optionally approved) or frontend tools (client-served continuations) → model, streaming text as `message.delta`, publishing shared state as `state.changed`, and generative UI as `ui.render {component, props}`. **In progress**: `CG-PRF-002` is `candidate`; `createCopilotApp` and `GenerativeSurface` currently throw `"profile-copilot: not implemented"`.

### Reference profile: Harness (spec §29.2)

[`profiles/harness`](../profiles/harness/src/index.ts) composes model providers, a tool registry, an agent loop, sessions, storage, skills/extensions, a scheduler, sandbox adapters, and subagent composition, to demonstrate dynamic activation/deactivation and hot-swappable services. Its contract ([`profiles/harness/src/index.ts`](../profiles/harness/src/index.ts)):

```ts
interface Harness {
  runtime: Runtime;
  storage: ComponentHandle;                          // built-in storage.kv; dispose/remount to exercise hot-swap
  mount(component: Component): Promise<ComponentHandle>;
  send(sessionId: string, message: string): Promise<string>;
  schedule(agent: string, input: Json, at: number): Promise<string>;
  close(): Promise<void>;
}
createHarness(options: HarnessOptions): Promise<Harness>;
spawnSubagent(ctx: RunContext, id: string, agent: string, input: Json): Promise<Json>; // durable, resumes across restarts
```

**In progress**: `CG-PRF-003` is `candidate`.

## Status

| Requirement | Status |
|---|---|
| `CG-PRF-001` (`defineProfile`) | implemented |
| `CG-PRF-002` (Copilot profile) | candidate — in progress |
| `CG-PRF-003` (Harness profile) | candidate — in progress |

## Related

- [architecture.md](architecture.md) — dependency rules governing where a new package may sit.
- [security.md](security.md) — every capability invocation is policy-checked regardless of which layer added it.
