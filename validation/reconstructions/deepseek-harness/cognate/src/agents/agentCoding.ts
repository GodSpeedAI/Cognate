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
import { InvocationFailedError, type AgentDefinition, type RunContext } from "@cognate/runtime-api";
import { approvalDeniedToolResult, approvalGate } from "../domain/approvalGate.ts";
import {
  EXIT_PLAN_MODE_NOT_IN_PLAN_MODE,
  PLAN_APPROVED_TOOL_RESULT,
  extractPlanHeading,
  isPlanOffCommand,
  planRequestChangesToolResult,
  splitPlanPrefix,
} from "../domain/planGate.ts";
import { PathEscapeError } from "../capabilities/tools.ts";
import type { ToolBashResult, ToolEditResult, ToolReadResult, ToolRunCodeResult } from "../capabilities/tools.ts";
import type { PlanState, TodoItem } from "../projections/plans.ts";

export const AGENT_CODING = "agent.coding";

/** Usage pass U4 (reference-behavior-matrix.md §15): agent presets. A preset scopes which tools the
 *  model may call this turn — `standard` is the everyday catalog (no `run_code`), `ptc` adds
 *  batch-style privileged execution (`run_code`, the approval-escalation tool), `minimal` reduces
 *  the agent to the terminal tool only. A run WITHOUT a preset (direct API calls, existing tests)
 *  keeps the full catalog — the composer always sends one. */
export type AgentPreset = "standard" | "ptc" | "minimal";

export const PRESET_TOOLS: Readonly<Record<AgentPreset, readonly string[]>> = {
  standard: ["read", "edit", "bash", "todo_write", "exit_plan_mode", "subagent"],
  ptc: ["read", "edit", "bash", "todo_write", "exit_plan_mode", "subagent", "run_code"],
  minimal: ["bash"],
};

export function isAgentPreset(value: unknown): value is AgentPreset {
  return typeof value === "string" && (value === "standard" || value === "ptc" || value === "minimal");
}

export function toolsForPreset(preset: string | undefined, catalog: readonly ToolDefinition[]): readonly ToolDefinition[] {
  if (!isAgentPreset(preset)) return catalog;
  const allowed = new Set(PRESET_TOOLS[preset]);
  return catalog.filter((t) => allowed.has(t.name));
}

export interface AgentCodingInput {
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly message: string;
  /** Session access mode for `approvalGate`'s comparison; defaults to `"read-only"`. See
   *  `approvalGate.ts` and `DEVIATIONS.md` ("access-mode dropdown is inert this tranche"). */
  readonly mode?: string;
  /** Usage pass U4 (§15): the session's agent preset — scopes the turn's tool catalog (see
   *  `PRESET_TOOLS`); the composer sends the per-session choice, defaulting to the Settings →
   *  Agent presets "new task default". Absent (direct API runs) keeps the full catalog. */
  readonly preset?: string;
}

const MAX_TOOL_STEPS = 20;

// T11 (J-H-provider-error / J-H-cancellation): 1 initial attempt + 5 retries, matching the
// reference's "automatic retry budget of 5 attempts" (reference-behavior-matrix.md §8). Backoff is
// short and configurable via `MODEL_RETRY_BACKOFF_MS` so tests run fast (~10ms) without changing
// the retry count itself.
const MAX_MODEL_RETRIES = 5;
const DEFAULT_RETRY_BACKOFF_MS = 300;

function retryBackoffMs(): number {
  const raw = Number(process.env.MODEL_RETRY_BACKOFF_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_RETRY_BACKOFF_MS;
}

/**
 * Classifies a failed `model.generate` invocation into the `{ code, message }` the UI's failure
 * block renders ("This turn failed" / message / CODE, reference-behavior-matrix.md §8).
 * Prefers structured `failure.details` (provider error's `kind`/`status` now recorded by
 * `packages/runtime-bun/src/invoker.ts`'s `failureJson`), with fallback to message-regex
 * matching for backward compatibility (e.g. "Request timed out." → TIMEOUT).
 */
function classifyModelFailure(error: InvocationFailedError): { readonly code: string; readonly message: string } {
  const failure = error.failure as { readonly details?: Record<string, unknown>; readonly message?: unknown } | null;
  const details = failure?.details;

  // Prefer structured error details over message regex fallback
  if (details?.kind === "cancelled") return { code: "TIMEOUT", message: "Request timed out." };
  if (typeof details?.status === "number") {
    if (details.status === 408) return { code: "TIMEOUT", message: "Request timed out." };
    if (details.status === 500) return { code: "HTTP_500", message: "Internal server error" };
    return { code: `HTTP_${details.status}`, message: `Request failed (HTTP ${details.status}).` };
  }

  // Fallback: message regex (backward compatibility)
  const failureMessage = failure?.message;
  const raw = typeof failureMessage === "string" ? failureMessage : error.message;
  if (/timed out/i.test(raw)) return { code: "TIMEOUT", message: "Request timed out." };
  return { code: "HTTP_500", message: "Internal server error" };
}

/**
 * `ctx.invoke("model.generate", ...)` with explicit, durably recorded retries. Each attempt is its
 * own `ctx.invoke` call (a distinct step id), so replay never re-runs a completed attempt — it just
 * returns the recorded result/failure. `callIndex` (the tool-loop step number) keys the backoff step
 * id so concurrent... (sequential, actually) model calls within one turn don't collide.
 */
async function invokeModelGenerate(ctx: RunContext, callIndex: number, messages: ModelMessage[], tools: readonly ToolDefinition[]): Promise<ModelResponse> {
  for (let attempt = 1; attempt <= MAX_MODEL_RETRIES + 1; attempt++) {
    try {
      return (await ctx.invoke("model.generate", { messages, tools } as unknown as Json)) as unknown as ModelResponse;
    } catch (error) {
      // A cancelled run must stop retrying immediately, not spend its remaining backoff/attempts —
      // `ctx.emit`/`ctx.step` would throw the runtime's internal halt sentinel anyway (via `guard()`),
      // but checking here keeps the intent explicit and avoids emitting a spurious retry/failure
      // event on the way out.
      if (ctx.signal.aborted) throw error;
      if (!(error instanceof InvocationFailedError)) throw error;

      const classified = classifyModelFailure(error);
      if (attempt > MAX_MODEL_RETRIES) {
        await ctx.emit("turn.failed", classified as unknown as Json);
        throw new Error(classified.message);
      }
      await ctx.emit("model.request.retried", { attempt, maxRetries: MAX_MODEL_RETRIES, error: classified } as unknown as Json);
      await ctx.step(`backoff:${callIndex}:${attempt}`, async () => {
        const ms = retryBackoffMs();
        await Bun.sleep(ms);
        return ms;
      });
    }
  }
  /* istanbul ignore next -- unreachable: the loop above always returns or throws */
  throw new Error("unreachable");
}

export const TOOL_DEFS: ToolDefinition[] = [
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
  workspace: { readonly root: string; readonly executionWorldId: string },
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
    const existed = await ctx.step(`edit-exists:${call.id}`, async () => {
      try {
        const worldId = workspace.executionWorldId;
        const { path } = (await ctx.invoke("filesystem.resolve", { worldId, root: workspace.root, path: filePath })) as unknown as { path: string };
        const { stat } = (await ctx.invoke("filesystem.stat", { worldId, path })) as unknown as { stat: { kind: string } | null };
        return stat?.kind === "file";
      } catch {
        return false;
      }
    });
    if (existed && !readFiles.has(filePath)) {
      const error = `fs_not_observed: read ${filePath} before editing it`;
      await ctx.emit("tool.call.failed", { sessionId, toolCallId: call.id, tool: call.name, error });
      return `Error: ${error}`;
    }
  }

  try {
    const result = (await ctx.invoke(`tool.${call.name}`, { workspaceRoot: workspace.root, executionWorldId: workspace.executionWorldId, ...args } as unknown as Json)) as unknown as Json;
    if (call.name === "read") readFiles.add(String(args.file_path ?? ""));
    const text = formatToolResult(call.name, result);
    await ctx.emit("tool.call.completed", { sessionId, toolCallId: call.id, tool: call.name, result });
    return text;
  } catch (error) {
    const message = error instanceof PathEscapeError || error instanceof Error ? error.message : String(error);
    await ctx.emit("tool.call.failed", { sessionId, toolCallId: call.id, tool: call.name, error: message });
    return `Error: ${message}`;
  }
}

export const agentCodingAgent: AgentDefinition = {
  id: AGENT_CODING,
  version: "1.0.0",
  async run(input, ctx) {
    const { sessionId, workspaceId, message, mode, preset } = input as unknown as AgentCodingInput;
    // Usage pass U4 (§15): the preset scopes this turn's tool catalog; an absent preset (direct API
    // runs) keeps the full TOOL_DEFS list.
    const turnTools = toolsForPreset(preset, TOOL_DEFS);
    // `mode` rides the turn event so the `sessions` projection can fold the session's CURRENT
    // access mode from run inputs (usage pass U2 — the composer's per-session access-mode dropdown
    // becomes this input's source); absent (direct API runs) keeps whatever the projection already
    // folded, and `approvalGate` independently defaults an absent mode to "read-only".
    const turnPayload: Record<string, string> = { sessionId, workspaceId, message };
    if (typeof mode === "string") turnPayload.mode = mode;
    if (isAgentPreset(preset)) turnPayload.preset = preset;
    await ctx.emit("session.turn.started", turnPayload as unknown as Json);

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
    const workspace = (await ctx.invoke("workspace.path", { workspaceId })) as unknown as { readonly root: string; readonly executionWorldId: string };
    const messages: ModelMessage[] = [...history, { role: "user", content: message }];
    const readFiles = new Set<string>();

    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const response = await invokeModelGenerate(ctx, step, messages, turnTools);
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
        // Usage pass U4 (SS15): a preset scopes the catalog the model was given - a call for a tool
        // outside it fails closed with the reference's own observed wording (`Error: unknown tool
        // "run_code"` under Standard mode, reference-behavior-matrix.md SS6.2 precondition 1).
        if (!turnTools.some((t) => t.name === call.name)) {
          const unknownTool = `Error: unknown tool "${call.name}"`;
          await ctx.emit("tool.call.failed", { sessionId, toolCallId: call.id, tool: call.name, error: unknownTool });
          messages.push({ role: "tool", content: unknownTool, toolCallId: call.id });
          continue;
        }
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
            resultText = await invokeTool(ctx, sessionId, workspace, call, readFiles);
          }
        } else {
          resultText = await invokeTool(ctx, sessionId, workspace, call, readFiles);
        }
        messages.push({ role: "tool", content: resultText, toolCallId: call.id });
      }
    }

    const text = "Reached the tool-call step limit for this turn.";
    await ctx.emit("message.completed", { sessionId, workspaceId, text });
    return { text };
  },
};
