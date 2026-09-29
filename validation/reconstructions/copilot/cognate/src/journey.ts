import { createAgUiHandler } from "@cognate/ag-ui";
import type { ModelResponse } from "@cognate/capabilities";
import { allowCapabilities, type Policy } from "@cognate/kernel-api";
import { localProvider } from "@cognate/provider-local";
import { modelComponent } from "@cognate/provider-openai-compatible";
import type { Projection } from "@cognate/projections";
import type { AgentDefinition, Caller } from "@cognate/runtime-api";
import { createRuntime, type Runtime } from "@cognate/runtime-bun";
import { loadJourneyABindings, loadJourneyCBindings } from "./domain.ts";
import { sharedStateAgent, sharedStateCanvasProjection } from "./shared-state.ts";

export const JOURNEY_A_AGENT = "copilotkit-reconstruction.chat";
export const DEFAULT_THREAD_ID = "thread:demo";

type ThreadRun = { readonly runId: string; readonly status: "running" | "completed"; readonly text: string };
type ThreadHistory = { readonly threadId: string; readonly runs: readonly ThreadRun[] };

/** A durable, deterministic transcript projection. It is a view, never a second chat state machine. */
export const threadHistoryProjection: Projection = {
  name: "conversation-thread-history",
  version: "1",
  apply(event, state) {
    const threadId = event.correlationId;
    if (!threadId.startsWith("thread:")) return [];
    const key = `${event.tenant}/thread/${threadId}`;
    const current = state.get(key) as ThreadHistory | undefined;
    const history: ThreadHistory = current ?? { threadId, runs: [] };
    if (event.eventType === "run.started") return [{ key, value: { ...history, runs: [...history.runs, { runId: event.runId ?? "unknown", status: "running", text: "" }] } }];
    const index = history.runs.findIndex((run) => run.runId === event.runId);
    if (index < 0) return [];
    const run = history.runs[index]!;
    if (event.eventType === "run.invocation.progress" && event.metadata?.capability === "model.generate") {
      const payload = event.payload as { type?: unknown; text?: unknown };
      if (payload.type !== "text" || typeof payload.text !== "string") return [];
      const runs = [...history.runs];
      runs[index] = { ...run, text: run.text + payload.text };
      return [{ key, value: { ...history, runs } }];
    }
    if (event.eventType === "message.delta") {
      const payload = event.payload as { text?: unknown };
      if (typeof payload.text !== "string") return [];
      const runs = [...history.runs];
      runs[index] = { ...run, text: run.text + payload.text };
      return [{ key, value: { ...history, runs } }];
    }
    if (event.eventType === "run.completed") {
      const runs = [...history.runs];
      runs[index] = { ...run, status: "completed" };
      return [{ key, value: { ...history, runs } }];
    }
    return [];
  },
};

function deterministicModelComponent() {
  const provider = localProvider({
    id: "journey-a",
    rules: [{ respond: () => ({ message: { role: "assistant", content: "Hello from the deterministic Cognate chat." }, toolCalls: [], finishReason: "stop" }) }],
    chunkSize: 8,
  });
  return modelComponent(provider);
}

const agent: AgentDefinition = {
  id: JOURNEY_A_AGENT,
  version: "1.0.0",
  async run(input, ctx) {
    const message = String((input as { readonly message?: unknown }).message ?? "");
    const response = (await ctx.invoke("model.generate", { messages: [{ role: "user", content: message }], stream: true })) as unknown as ModelResponse;
    return { answer: response.message.content };
  },
};

function policy(): Policy {
  return allowCapabilities("journey-a", ["model.generate"]);
}

export interface JourneyAApp {
  readonly runtime: Runtime;
  readonly agUi: (request: Request) => Promise<Response>;
  close(): Promise<void>;
}

/** Real SQLite runtime and normal AG-UI adapter for J-A; no CopilotKit runtime is involved. */
export async function createJourneyAApp(store: string): Promise<JourneyAApp> {
  // The model declares conversation lifecycle affordances. RuntimeService start/list APIs and
  // durable events realize those actions here; `model.generate` is the only kernel capability
  // this thin agent needs, so no no-op conversation providers are introduced.
  await loadJourneyABindings();
  await loadJourneyCBindings();
  const runtime = await createRuntime({
    store,
    policy: policy(),
    actions: { authorize: () => ({ allow: true, reason: "J-A has no external commitment" }) },
    agents: [agent, sharedStateAgent],
    components: [deterministicModelComponent()],
    projections: [
      { projection: threadHistoryProjection, public: true },
      { projection: sharedStateCanvasProjection, public: true },
    ],
  });
  return {
    runtime,
    agUi: createAgUiHandler({
      service: runtime.service,
      defaultAgent: JOURNEY_A_AGENT,
      authenticate: (headers): Caller | undefined => {
        const match = /^Bearer ([\w-]+)$/.exec(headers.get("authorization") ?? "");
        return match ? { actor: { id: match[1]!, kind: "user" }, tenant: "tenant-a" } : undefined;
      },
    }),
    close: () => runtime.close(),
  };
}
