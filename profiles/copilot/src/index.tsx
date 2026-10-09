// CG-PRF-002 (spec §29.1, §40.J): the copilot profile as a pure composition of registered components.
// No kernel additions: the model provider and each backend tool are mounted as ordinary kernel components
// (spec §8.3); the agent loop is authored entirely against `RunContext` (spec §12); AG-UI, React, and Astryx
// are the existing packages, unmodified.
import { allowCapabilities } from "@godspeedai/cognate-kernel-api";
import type { Component, Policy } from "@godspeedai/cognate-kernel-api";
import type { ModelMessage, ModelProvider, ModelRequest, ModelResponse, ToolCall, ToolDefinition } from "@godspeedai/cognate-capabilities";
import type { Json } from "@godspeedai/cognate-events";
import type { CapabilityContract } from "@godspeedai/cognate-kernel-api";
import { createAgUiHandler } from "@godspeedai/cognate-ag-ui";
import { type CognateClient } from "@godspeedai/cognate-client";
import { useCognate } from "@godspeedai/cognate-react";
import { type ComponentEntry, type ProfileDefinition, defineProfile } from "@godspeedai/cognate-profile";
import { modelComponent } from "@godspeedai/cognate-provider-openai-compatible";
import { devTokenAuthenticator } from "@godspeedai/cognate-protocol-connect-bun";
import { type AgentDefinition, type Caller, ContinuationClosedError, invokeFrontend, type RunContext } from "@godspeedai/cognate-runtime-api";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";
import type { Runtime } from "@godspeedai/cognate-runtime-bun";
import { type ReactNode, useEffect, useState } from "react";

export const COPILOT_AGENT = "agent.copilot";

const COPILOT_COMPONENTS = ["runtime", "runs", "continuations", "frontend-capabilities", "state-projections", "artifact-projections", "ag-ui", "react", "astryx"] as const;

/** The copilot profile as a composition of registered component names (spec §29.1). */
export const copilotProfile: ProfileDefinition = defineProfile({
  name: "copilot",
  description: "Copilot reference profile: model + tool loop over the runtime, continuations for approvals and frontend capabilities, state/artifact projections, AG-UI, React, and Astryx (spec §29.1).",
  components: COPILOT_COMPONENTS,
});

/** Registry entries backing the profile's component names; every one is backed by an existing package (no DEBT). */
export const copilotRegistry: readonly ComponentEntry<unknown>[] = [
  { name: "runtime", package: "@godspeedai/cognate-runtime-bun", supported: true, contribute: () => undefined },
  { name: "runs", package: "@godspeedai/cognate-runtime-api", supported: true, contribute: () => undefined },
  { name: "continuations", package: "@godspeedai/cognate-continuations", supported: true, contribute: () => undefined },
  { name: "frontend-capabilities", package: "@godspeedai/cognate-runtime-api", supported: true, contribute: () => undefined },
  { name: "state-projections", package: "@godspeedai/cognate-client", supported: true, contribute: () => undefined },
  { name: "artifact-projections", package: "@godspeedai/cognate-artifacts", supported: true, contribute: () => undefined },
  { name: "ag-ui", package: "@godspeedai/cognate-ag-ui", supported: true, contribute: () => undefined },
  { name: "react", package: "@godspeedai/cognate-react", supported: true, contribute: () => undefined },
  { name: "astryx", package: "@godspeedai/cognate-ui-astryx", supported: true, contribute: () => undefined },
];

export interface BackendTool {
  readonly contract: CapabilityContract;
  readonly description: string;
  readonly inputSchema: { readonly [key: string]: Json };
  readonly handler: (input: Json) => Json | Promise<Json>;
  /** Pause for human approval (a continuation) before invoking. */
  readonly requiresApproval?: boolean;
  /** Shared-state projection of a completed call: RFC 6902 patch emitted as `state.changed`. */
  readonly statePatch?: (input: Json, output: Json) => readonly { readonly op: string; readonly path: string; readonly value?: Json }[];
  /** Generative UI projection of a completed call: emitted as `ui.render`. */
  readonly render?: (input: Json, output: Json) => { readonly component: string; readonly props: Json };
  /** Artifact produced from a completed call. */
  readonly artifact?: (input: Json, output: Json) => { readonly name: string; readonly mediaType: string; readonly content: string };
}

export interface CopilotAppOptions {
  /** SQLite path (or ":memory:"). */
  readonly store: string;
  readonly model: ModelProvider;
  readonly instructions?: string;
  readonly backendTools?: readonly BackendTool[];
  /** Capabilities served by the connected UI (frontend tools), offered to the model as tools. */
  readonly frontendTools?: readonly { readonly name: string; readonly description: string; readonly inputSchema: { readonly [key: string]: Json } }[];
}

export interface CopilotApp {
  readonly runtime: Runtime;
  /** AG-UI endpoint for the copilot agent (authenticates `Bearer <tenant>:<user>` in dev). */
  readonly agUi: (request: Request) => Promise<Response>;
  close(): Promise<void>;
}

/** A kernel component publishing one backend tool at its own capability contract. */
function backendToolComponent(tool: BackendTool): Component {
  return {
    id: `copilot-tool:${tool.contract.id}`,
    provides: [tool.contract],
    activate(fiber) {
      fiber.provide(tool.contract, async (input) => tool.handler(input as Json));
    },
  };
}

/** Runs the provider's stream (when supported) to completion, recording text deltas alongside the final response. */
async function collectResponse(model: ModelProvider, request: ModelRequest): Promise<{ readonly response: ModelResponse; readonly deltas: readonly string[] }> {
  if (!model.features.stream) {
    const response = await model.generate(request);
    return { response, deltas: response.message.content.length > 0 ? [response.message.content] : [] };
  }
  const deltas: string[] = [];
  const toolCalls: ToolCall[] = [];
  let done: ModelResponse | undefined;
  for await (const delta of model.stream(request)) {
    if (delta.type === "text") deltas.push(delta.text);
    else if (delta.type === "tool_call") toolCalls.push(delta.call);
    else if (delta.type === "done") done = delta.response;
  }
  if (!done) throw new Error("model provider stream ended without a done delta");
  return { response: done, deltas };
}

function toolDefinition(name: string, description: string, inputSchema: { readonly [key: string]: Json }): ToolDefinition {
  return { name, description, inputSchema };
}

/**
 * Build a copilot application: the copilot agent loops model → tool calls → backend tools (optionally approved) or
 * frontend tools (client-served continuations) → model, streaming text as `message.delta`, publishing shared state as
 * `state.changed`, generative UI as `ui.render {component, props}`, and artifacts via the run context.
 */
export async function createCopilotApp(options: CopilotAppOptions): Promise<CopilotApp> {
  const backendTools = options.backendTools ?? [];
  const frontendTools = options.frontendTools ?? [];
  const backendByName = new Map(backendTools.map((tool) => [tool.contract.id, tool]));
  const frontendByName = new Map(frontendTools.map((tool) => [tool.name, tool]));

  const toolDefs: ToolDefinition[] = [
    ...backendTools.map((tool) => toolDefinition(tool.contract.id, tool.description, tool.inputSchema)),
    ...frontendTools.map((tool) => toolDefinition(tool.name, tool.description, tool.inputSchema)),
  ];

  const policy: Policy = allowCapabilities("copilot-tools", ["model.generate", ...backendTools.map((tool) => tool.contract.id)]);

  const copilotAgent: AgentDefinition = {
    id: COPILOT_AGENT,
    version: "1.0.0",
    async run(input, ctx: RunContext): Promise<Json> {
      const { message } = input as { readonly message: string };
      // Shared application state starts empty so `add`-style patches (e.g. `add /refund`) apply cleanly.
      await ctx.emit("state.changed", { snapshot: {} });

      const messages: ModelMessage[] = [];
      if (options.instructions) messages.push({ role: "system", content: options.instructions });
      messages.push({ role: "user", content: message });

      for (let turn = 0; ; turn++) {
        const request: ModelRequest = { messages, ...(toolDefs.length > 0 ? { tools: toolDefs } : {}) };
        const stepResult = await ctx.step(`model:${turn}`, async () => (await collectResponse(options.model, request)) as unknown as Json);
        const { response, deltas } = stepResult as unknown as { readonly response: ModelResponse; readonly deltas: readonly string[] };
        for (const text of deltas) await ctx.emit("message.delta", { text });

        if (response.toolCalls.length === 0) return { answer: response.message.content };

        messages.push({ role: "assistant", content: response.message.content, toolCalls: response.toolCalls });

        for (const call of response.toolCalls) {
          const backend = backendByName.get(call.name);
          if (backend) {
            if (backend.requiresApproval) {
              const decision = (await ctx.waitFor(`approval:${call.id}`, {
                type: `${call.name}.approval`,
                condition: { kind: "human_approval" },
                payload: { capability: call.name, input: call.arguments },
              }).catch((error: unknown) => {
                if (error instanceof ContinuationClosedError) return { approved: false };
                throw error;
              })) as { readonly approved?: boolean } | null;
              if (!decision?.approved) {
                messages.push({ role: "tool", toolCallId: call.id, content: `refused: ${call.name} was not approved` });
                continue;
              }
            }
            const output = await ctx.invoke(call.name, call.arguments);
            if (backend.statePatch) await ctx.emit("state.changed", { patch: backend.statePatch(call.arguments, output) } as unknown as Json);
            if (backend.render) await ctx.emit("ui.render", backend.render(call.arguments, output));
            if (backend.artifact) {
              const built = backend.artifact(call.arguments, output);
              await ctx.artifact({ name: built.name, mediaType: built.mediaType, bytes: new TextEncoder().encode(built.content) });
            }
            messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(output) });
            continue;
          }

          const frontend = frontendByName.get(call.name);
          if (frontend) {
            const value = await invokeFrontend(ctx, `frontend:${call.id}`, call.name, call.arguments);
            messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(value) });
            continue;
          }

          messages.push({ role: "tool", toolCallId: call.id, content: `unknown tool: ${call.name}` });
        }
      }
    },
  };

  const components: Component[] = [modelComponent(options.model), ...backendTools.map((tool) => backendToolComponent(tool))];

  const runtime = await createRuntime({
    store: options.store,
    policy,
    actions: { authorize: () => ({ allow: true, reason: "copilot profile allows its own callers (spec §29.1)" }) },
    agents: [copilotAgent],
    components,
  });

  const agUi = createAgUiHandler({ service: runtime.service, defaultAgent: COPILOT_AGENT, authenticate: devTokenAuthenticator as (headers: Headers) => Caller | undefined });

  return {
    runtime,
    agUi,
    async close() {
      await runtime.close();
    },
  };
}

interface RenderEvent {
  readonly component: string;
  readonly props: Json;
}

/** Synchronously drains buffered `ui.render` events for `runId` (the client replays its buffer into `subscribe`). */
function bufferedRenders(client: CognateClient, runId: string): RenderEvent[] {
  const renders: RenderEvent[] = [];
  const stop = client.subscribe({ runId }, (event) => {
    if (event.eventType === "ui.render") renders.push(event.payload as unknown as RenderEvent);
  });
  stop();
  return renders;
}

/** Renders a run's `ui.render` events with an application-supplied component registry (generative UI projection). */
export function GenerativeSurface({ runId, components }: { readonly runId: string; readonly components: Readonly<Record<string, (props: Json) => ReactNode>> }): ReactNode {
  const client = useCognate();
  // The lazy initializer re-runs on every render pass with no prior state (as in `renderToString`), so it always
  // reflects the run's currently committed events; a live client additionally keeps this fresh via `useEffect` below.
  const [renders, setRenders] = useState<readonly RenderEvent[]>(() => bufferedRenders(client, runId));
  useEffect(() => {
    setRenders(bufferedRenders(client, runId));
    return client.subscribe({ runId }, (event) => {
      if (event.eventType !== "ui.render") return;
      setRenders((prev) => [...prev, event.payload as unknown as RenderEvent]);
    });
  }, [client, runId]);

  return (
    <>
      {renders.map((render, index) => {
        const Render = components[render.component];
        return Render ? <Render key={index} {...(render.props as Record<string, unknown>)} /> : <div key={index}>Unknown component: {render.component}</div>;
      })}
    </>
  );
}
