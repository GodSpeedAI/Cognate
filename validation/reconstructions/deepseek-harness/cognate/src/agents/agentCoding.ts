// `agent.coding`: one run per user turn (`{ sessionId, workspaceId, message }`), correlated by
// `session:<id>`. Folds prior turns via `session.history`, resolves the workspace root via
// `workspace.path`, then runs a deterministic, replay-safe tool loop against `model.generate`:
// model -> tool_calls -> invoke `tool.<name>` capabilities (approval-gated for privileged escalation,
// see `approvalGate.ts`) -> tool results back to the model -> repeat until the model returns a plain
// answer or the step budget is exhausted. All I/O goes through `ctx.invoke`/`ctx.step`/`ctx.waitFor`;
// the only non-deterministic local state is `readFiles`, a plain `Set` rebuilt identically on every
// replay from the same sequence of recorded `tool.read` results, so it stays deterministic.
import type { ModelMessage, ModelResponse, ToolCall, ToolDefinition } from "@cognate/capabilities";
import type { Json } from "@cognate/events";
import type { AgentDefinition, RunContext } from "@cognate/runtime-api";
import { approvalDeniedToolResult, approvalGate } from "../domain/approvalGate.ts";
import {
  EXIT_PLAN_MODE_NOT_IN_PLAN_MODE,
  PLAN_APPROVED_TOOL_RESULT,
  extractPlanHeading,
  isPlanOffCommand,
  planRequestChangesToolResult,
  splitPlanPrefix,
} from "../domain/planGate.ts";
import { PathEscapeError, fileExists } from "../capabilities/tools.ts";
import type { ToolBashResult, ToolEditResult, ToolReadResult, ToolRunCodeResult } from "../capabilities/tools.ts";
import type { PlanState, TodoItem } from "../projections/plans.ts";

export const AGENT_CODING = "agent.coding";

export interface AgentCodingInput {
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly message: string;
  /** Session access mode for `approvalGate`'s comparison; defaults to `"read-only"`. See
   *  `approvalGate.ts` and `DEVIATIONS.md` ("access-mode dropdown is inert this tranche"). */
  readonly mode?: string;
}

const MAX_TOOL_STEPS = 20;

const TOOL_DEFS: ToolDefinition[] = [
  {
    name: "read",
    description: "Read a file's contents from the workspace.",
    inputSchema: { type: "object", properties: { file_path: { type: "string" } }, required: ["file_path"] },
  },
  {
    name: "edit",
    description: "Replace an exact string in a file (old_string must match uniquely unless replace_all is set).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        old_string: { type: "string" },
        new_string: { type: "string" },
        replace_all: { type: "boolean" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  {
    name: "bash",
    description: "Run a shell command in the workspace.",
    inputSchema: { type: "object", properties: { command: { type: "string" }, description: { type: "string" } }, required: ["command"] },
  },
  {
    name: "todo_write",
    description: "Record or update the plan's to-do list.",
    inputSchema: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: { content: { type: "string" }, status: { type: "string" } },
            required: ["content", "status"],
          },
        },
      },
      required: ["todos"],
    },
  },
  {
    name: "exit_plan_mode",
    description: "Present a markdown plan for review and, on approval, leave plan mode.",
    inputSchema: { type: "object", properties: { plan: { type: "string" } }, required: ["plan"] },
  },
  {
    name: "subagent",
    description: "Delegate a task to a background subagent.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string" },
        prompt: { type: "string" },
        run_in_background: { type: "boolean" },
      },
      required: ["description", "prompt"],
    },
  },
  {
    name: "run_code",
    description: "Run a code snippet, optionally requesting an escalated sandbox permission (approval-gated).",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        description: { type: "string" },
        sandbox_permissions: { type: "string" },
        justification: { type: "string" },
      },
      required: ["code"],
    },
  },
];

function summarizeArgs(args: Readonly<Record<string, unknown>>): Json {
  return args as Json;
}

/** Formats a tool's success result as the plain-text `ModelMessage` content the model sees. */
function formatToolResult(name: string, result: Json): string {
  if (name === "read") return (result as unknown as ToolReadResult).content;
  if (name === "edit") {
    const r = result as unknown as ToolEditResult;
    return `Edited ${r.file_path} (${r.replacements} replacement${r.replacements === 1 ? "" : "s"}).`;
  }
  if (name === "bash") {
    const r = result as unknown as ToolBashResult;
    const parts = [r.stdout, r.stderr].map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts.join("\n") : `(command exited ${r.exitCode} with no output)`;
  }
  if (name === "run_code") {
    const r = result as unknown as ToolRunCodeResult;
    const parts = [r.stdout, r.stderr].map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts.join("\n") : "(run_code completed with no output)";
  }
  return JSON.stringify(result);
}

async function invokeTool(
  ctx: RunContext,
  sessionId: string,
  workspaceRoot: string,
  call: ToolCall,
  readFiles: Set<string>,
): Promise<string> {
  const args = (call.arguments ?? {}) as Record<string, unknown>;

  // Read-before-edit guard (journey J-C-tool-execution: "edit tool (gated by prior read of the
  // unchanged file: fs_not_observed ... if violated)"). A file that does not exist yet (a new file)
  // needs no prior read.
  if (call.name === "edit") {
    const filePath = String(args.file_path ?? "");
    // Boxed in `ctx.step` (not called bare) so this filesystem read stays replay-safe: the same
    // recorded answer is returned on replay instead of re-touching the disk.
    const existed = await ctx.step(`edit-exists:${call.id}`, () => fileExists(workspaceRoot, filePath));
    if (existed && !readFiles.has(filePath)) {
      const error = `fs_not_observed: read ${filePath} before editing it`;
      await ctx.emit("tool.call.failed", { sessionId, toolCallId: call.id, tool: call.name, error });
      return `Error: ${error}`;
    }
  }

  try {
    const result = (await ctx.invoke(`tool.${call.name}`, { workspaceRoot, ...args } as unknown as Json)) as unknown as Json;
    if (call.name === "read") readFiles.add(String(args.file_path ?? ""));
    const text = formatToolResult(call.name, result);
    await ctx.emit("tool.call.completed", { sessionId, toolCallId: call.id, tool: call.name, result });
    return text;
  } catch (error) {
    const message = error instanceof PathEscapeError ? error.message : error instanceof Error ? error.message : String(error);
    await ctx.emit("tool.call.failed", { sessionId, toolCallId: call.id, tool: call.name, error: message });
    return `Error: ${message}`;
  }
}

export const agentCodingAgent: AgentDefinition = {
  id: AGENT_CODING,
  version: "1.0.0",
  async run(input, ctx) {
    const { sessionId, workspaceId, message, mode } = input as unknown as AgentCodingInput;
    await ctx.emit("session.turn.started", { sessionId, workspaceId, message });

    // Plan mode (J-E-plan): session state folded from this agent's own `plan.mode.changed`/
    // `plan.todos.updated`/`plan.review.*` events by the `plans` projection (`planGate.ts` has the
    // pure helpers; `planState.ts` is the read-side capability). "/plan off" is a pure control
    // command handled without a model round trip; a leading "/plan " prefix (composer literal-
    // insertion, reference-behavior-matrix.md §6.3) turns plan mode on for this and following turns
    // without altering the text sent to the model.
    let planState = (await ctx.invoke("plan.state", { sessionId })) as unknown as PlanState;

    if (isPlanOffCommand(message)) {
      if (planState.on) await ctx.emit("plan.mode.changed", { sessionId, on: false });
      const text = "Plan mode off.";
      await ctx.emit("message.completed", { sessionId, workspaceId, text });
      return { text };
    }

    if (splitPlanPrefix(message) && !planState.on) {
      await ctx.emit("plan.mode.changed", { sessionId, on: true });
      planState = { ...planState, on: true };
    }

    const history = (await ctx.invoke("session.history", { sessionId, excludeRunId: ctx.runId })) as unknown as ModelMessage[];
    const workspace = (await ctx.invoke("workspace.path", { workspaceId })) as unknown as { readonly path: string };
    const messages: ModelMessage[] = [...history, { role: "user", content: message }];
    const readFiles = new Set<string>();

    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const response = (await ctx.invoke("model.generate", { messages, tools: TOOL_DEFS } as unknown as Json)) as unknown as ModelResponse;
      if (response.toolCalls.length === 0) {
        await ctx.emit("message.completed", { sessionId, workspaceId, text: response.message.content });
        return { text: response.message.content };
      }

      messages.push({ role: "assistant", content: response.message.content ?? "", toolCalls: response.toolCalls });

      for (const call of response.toolCalls) {
        const args = (call.arguments ?? {}) as Record<string, unknown>;
        // Emitted once, up front, regardless of whether this call needs approval — so the UI (and
        // any other observer of durable events) always has a `tool.call.*` entry to hang an
        // approval's pending/decided state off of. Emitting it only after approval would leave a
        // pending approval with no visible "current tool" card at all (`useToolTimeline` keys tool
        // entries off this event; see `src/ui/App.tsx`).
        await ctx.emit("tool.call.started", { sessionId, toolCallId: call.id, tool: call.name, args: summarizeArgs(args) });
        const approvalDecision = approvalGate({ tool: call.name, args, mode });
        let resultText: string;
        if (call.name === "todo_write") {
          const todos = (Array.isArray(args.todos) ? args.todos : []) as TodoItem[];
          await ctx.emit("plan.todos.updated", { sessionId, todos } as unknown as Json);
          const inProgress = todos.filter((t) => t.status === "in_progress").length;
          const pending = todos.filter((t) => t.status === "pending").length;
          resultText = `Todos updated (${inProgress} in progress, ${pending} pending).`;
          await ctx.emit("tool.call.completed", { sessionId, toolCallId: call.id, tool: call.name, result: { todos } } as unknown as Json);
        } else if (call.name === "exit_plan_mode") {
          if (!planState.on) {
            resultText = EXIT_PLAN_MODE_NOT_IN_PLAN_MODE;
            await ctx.emit("tool.call.failed", { sessionId, toolCallId: call.id, tool: call.name, error: resultText });
          } else {
            const markdown = String(args.plan ?? "");
            const heading = extractPlanHeading(markdown);
            await ctx.emit("plan.review.requested", { sessionId, toolCallId: call.id, heading, markdown });
            const decision = (await ctx.waitFor(`plan-review:${call.id}`, {
              type: "plan-review",
              condition: { kind: "human_approval" },
              payload: { tool: call.name, toolCallId: call.id, heading, markdown } as unknown as Json,
            })) as unknown as { readonly approved: boolean; readonly feedback?: string };
            await ctx.emit("plan.review.decided", { sessionId, toolCallId: call.id, approved: decision.approved });
            if (decision.approved) {
              await ctx.emit("plan.mode.changed", { sessionId, on: false });
              planState = { ...planState, on: false };
              resultText = PLAN_APPROVED_TOOL_RESULT;
              await ctx.emit("tool.call.completed", { sessionId, toolCallId: call.id, tool: call.name, result: { approved: true } });
            } else {
              resultText = planRequestChangesToolResult(decision.feedback);
              await ctx.emit("tool.call.failed", { sessionId, toolCallId: call.id, tool: call.name, error: resultText });
            }
          }
        } else if (call.name === "subagent") {
          // J-F-delegation: fire-and-forget delegation (reference-behavior-matrix.md §6.4) — starts
          // a durable child `agent.coding` run, correlated `subagent:<parentRunId>:<id>` (this app's
          // own `subagent.start` capability, not `@cognate/profile-harness`'s `spawnSubagent` — see
          // `src/capabilities/subagentStart.ts`), and returns immediately with the reference's exact
          // reflection text. There is no `ctx.waitFor` here: the parent does not block on the child,
          // and does not durably record the child's completion itself — the child's own events carry
          // that (folded by the `subagents` projection, `src/projections/subagents.ts`). The child's
          // result "returns to the parent" via `session.history` on the *next* parent turn instead
          // (`src/capabilities/sessionHistory.ts`), not on this turn's tool result.
          const description = String(args.description ?? "");
          const childPrompt = String(args.prompt ?? "");
          const { runId: childRunId } = (await ctx.invoke("subagent.start", {
            agent: AGENT_CODING,
            input: { sessionId: `${sessionId}:sub:${call.id}`, workspaceId, message: childPrompt },
            key: `${ctx.runId}:${call.id}`,
          } as unknown as Json)) as unknown as { readonly runId: string };
          await ctx.emit("subagent.spawned", { sessionId, toolCallId: call.id, description, prompt: childPrompt, childRunId });
          resultText = `started subagent ${childRunId}`;
          await ctx.emit("tool.call.completed", { sessionId, toolCallId: call.id, tool: call.name, result: { childRunId } });
        } else if (approvalDecision.required) {
          const permission = approvalDecision.permission ?? "";
          const justification = approvalDecision.justification ?? "";
          await ctx.emit("tool.approval.requested", {
            sessionId,
            toolCallId: call.id,
            tool: call.name,
            permission,
            justification,
          } as unknown as Json);
          const approval = (await ctx.waitFor(`approve:${call.id}`, {
            type: "tool-approval",
            condition: { kind: "human_approval" },
            payload: { tool: call.name, args: summarizeArgs(args), permission, justification } as unknown as Json,
          })) as unknown as { readonly approved: boolean };
          await ctx.emit("tool.approval.decided", { sessionId, toolCallId: call.id, approved: approval.approved });
          if (!approval.approved) {
            resultText = approvalDeniedToolResult(permission);
            await ctx.emit("tool.call.failed", { sessionId, toolCallId: call.id, tool: call.name, error: resultText });
          } else {
            resultText = await invokeTool(ctx, sessionId, workspace.path, call, readFiles);
          }
        } else {
          resultText = await invokeTool(ctx, sessionId, workspace.path, call, readFiles);
        }
        messages.push({ role: "tool", content: resultText, toolCallId: call.id });
      }
    }

    const text = "Reached the tool-call step limit for this turn.";
    await ctx.emit("message.completed", { sessionId, workspaceId, text });
    return { text };
  },
};
