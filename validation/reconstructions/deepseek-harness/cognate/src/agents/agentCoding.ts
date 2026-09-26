// `agent.coding`: one run per user turn (`{ sessionId, workspaceId, message }`), correlated by
// `session:<id>`. Folds prior turns via `session.history`, generates through `model.generate`
// (streamed deltas surface as `run.invocation.progress` — see modelProvider.ts), and completes with
// a plain answer. Tool loop is a placeholder for a later tranche (T7).
import type { ModelMessage, ModelResponse } from "@cognate/capabilities";
import type { Json } from "@cognate/events";
import type { AgentDefinition } from "@cognate/runtime-api";

export const AGENT_CODING = "agent.coding";

export interface AgentCodingInput {
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly message: string;
}

export const agentCodingAgent: AgentDefinition = {
  id: AGENT_CODING,
  version: "1.0.0",
  async run(input, ctx) {
    const { sessionId, workspaceId, message } = input as unknown as AgentCodingInput;
    await ctx.emit("session.turn.started", { sessionId, workspaceId, message });
    const history = (await ctx.invoke("session.history", { sessionId, excludeRunId: ctx.runId })) as unknown as ModelMessage[];
    const messages: ModelMessage[] = [...history, { role: "user", content: message }];
    const response = (await ctx.invoke("model.generate", { messages } as unknown as Json)) as unknown as ModelResponse;
    await ctx.emit("message.completed", { sessionId, workspaceId, text: response.message.content });
    return { text: response.message.content };
  },
};
