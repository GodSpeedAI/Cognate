/**
 * Cognate-owned hook interoperability IR.
 * Discovery is inert. This package never spawns a shell or fetches a hook URL.
 * Native semantics are retained so a superficially similar event is not confused with parity.
 */
import { createHash } from "node:crypto";

export type HarnessId = "claude" | "codex" | "gemini" | "opencode" | "cline" | "pi" | (string & {});
export type HookPhase =
  | "session.start" | "session.end" | "prompt.submit"
  | "tool.before" | "tool.after" | "tool.failure"
  | "model.before" | "model.after" | "context.compact"
  | "agent.stop" | "subagent.start" | "subagent.stop"
  | "permission.request" | "notification" | "interrupt";
export type HookScope = "system" | "managed" | "user" | "project" | "local" | "plugin";
export type HookFidelity = "exact" | "approximate" | "unmapped";
export type HookHandler = "command" | "http" | "prompt" | "agent" | "mcp" | "plugin" | "unknown";

export interface HookOrigin {
  readonly harness: HarnessId;
  readonly event: string;
  readonly scope: HookScope;
  readonly sourcePath: string;
  readonly pluginId?: string;
}
export interface HookDefinition {
  /** Stable hash of origin + native descriptor; not evidence that the command is safe. */
  readonly id: string;
  readonly origin: HookOrigin;
  readonly phase?: HookPhase;
  readonly fidelity: HookFidelity;
  readonly matcher?: string;
  readonly handler: HookHandler;
  /** Reference to native handler configuration, never serialized in a settlement receipt. */
  readonly native: Readonly<Record<string, unknown>>;
  readonly enabled: boolean;
  readonly trust: "trusted" | "untrusted" | "unknown";
  readonly discoveredFrom: "configuration" | "extension" | "executable" | "runtime";
  readonly evidence: readonly string[];
}
export interface HookInventory {
  readonly harness: HarnessId;
  readonly discovery: "complete" | "partial" | "unknown";
  readonly hooks: readonly HookDefinition[];
  readonly unresolved: readonly string[];
}

const nativeEvents: Record<string, Readonly<Record<string, { phase: HookPhase; fidelity: HookFidelity }>>> = {
  claude: {
    SessionStart: { phase: "session.start", fidelity: "exact" },
    SessionEnd: { phase: "session.end", fidelity: "exact" },
    UserPromptSubmit: { phase: "prompt.submit", fidelity: "exact" },
    PreToolUse: { phase: "tool.before", fidelity: "exact" },
    PostToolUse: { phase: "tool.after", fidelity: "exact" },
    PostToolUseFailure: { phase: "tool.failure", fidelity: "exact" },
    PreCompact: { phase: "context.compact", fidelity: "approximate" },
    Stop: { phase: "agent.stop", fidelity: "exact" },
    SubagentStart: { phase: "subagent.start", fidelity: "exact" },
    SubagentStop: { phase: "subagent.stop", fidelity: "exact" },
    PermissionRequest: { phase: "permission.request", fidelity: "exact" },
    Notification: { phase: "notification", fidelity: "exact" },
  },
  codex: {
    SessionStart: { phase: "session.start", fidelity: "exact" },
    SessionEnd: { phase: "session.end", fidelity: "exact" },
    UserPromptSubmit: { phase: "prompt.submit", fidelity: "exact" },
    PreToolUse: { phase: "tool.before", fidelity: "approximate" },
    PostToolUse: { phase: "tool.after", fidelity: "approximate" },
    PreCompact: { phase: "context.compact", fidelity: "approximate" },
    PostCompact: { phase: "context.compact", fidelity: "approximate" },
    PermissionRequest: { phase: "permission.request", fidelity: "exact" },
    SubagentStart: { phase: "subagent.start", fidelity: "exact" },
    SubagentStop: { phase: "subagent.stop", fidelity: "exact" },
    Stop: { phase: "agent.stop", fidelity: "approximate" },
    Interrupt: { phase: "interrupt", fidelity: "exact" },
  },
  gemini: {
    SessionStart: { phase: "session.start", fidelity: "exact" },
    SessionEnd: { phase: "session.end", fidelity: "exact" },
    BeforeAgent: { phase: "prompt.submit", fidelity: "approximate" },
    AfterAgent: { phase: "agent.stop", fidelity: "approximate" },
    BeforeTool: { phase: "tool.before", fidelity: "approximate" },
    AfterTool: { phase: "tool.after", fidelity: "approximate" },
    BeforeModel: { phase: "model.before", fidelity: "exact" },
    AfterModel: { phase: "model.after", fidelity: "exact" },
    PreCompress: { phase: "context.compact", fidelity: "approximate" },
    Notification: { phase: "notification", fidelity: "exact" },
  },
  cline: {
    TaskStart: { phase: "session.start", fidelity: "approximate" },
    TaskResume: { phase: "session.start", fidelity: "approximate" },
    TaskCancel: { phase: "interrupt", fidelity: "approximate" },
    UserPromptSubmit: { phase: "prompt.submit", fidelity: "exact" },
    PreToolUse: { phase: "tool.before", fidelity: "approximate" },
    PostToolUse: { phase: "tool.after", fidelity: "approximate" },
  },
};

/** No forced OpenCode/Pi mapping: plugin callbacks are code-defined, not always statically enumerable. */
export function mapNativeEvent(harness: HarnessId, event: string): { phase?: HookPhase; fidelity: HookFidelity } {
  return nativeEvents[harness]?.[event] ?? { fidelity: "unmapped" };
}

function hashNative(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}
export interface ParseHooksOptions {
  readonly harness: HarnessId;
  readonly scope: HookScope;
  readonly sourcePath: string;
  readonly trusted?: boolean;
  readonly pluginId?: string;
}
/** Safely parse declarative Claude/Codex/Gemini-style hooks; never dispatches commands. */
export function parseDeclarativeHooks(value: unknown, options: ParseHooksOptions): HookInventory {
  const config = isRecord(value) ? value : {};
  const hooksNode = config.hooks;
  if (!isRecord(hooksNode)) return { harness: options.harness, discovery: "partial", hooks: [], unresolved: ["no declarative hooks object; runtime/plugin hooks may still exist"] };
  const hooks: HookDefinition[] = [];
  const unresolved: string[] = [];
  for (const [event, groups] of Object.entries(hooksNode)) {
    const entries = Array.isArray(groups) ? groups : [groups];
    for (const group of entries) {
      if (!isRecord(group)) { unresolved.push(`unsupported ${event} hook descriptor`); continue; }
      const handlers = Array.isArray(group.hooks) ? group.hooks : [group];
      for (const native of handlers) {
        if (!isRecord(native)) { unresolved.push(`unsupported ${event} hook handler`); continue; }
        const map = mapNativeEvent(options.harness, event);
        if (map.fidelity === "unmapped") unresolved.push(`no verified event mapping for ${options.harness}:${event}`);
        const matcher = typeof group.matcher === "string" ? group.matcher : undefined;
        const handlerName = typeof native.type === "string" ? native.type : "unknown";
        const handler: HookHandler = ["command", "http", "prompt", "agent", "mcp", "plugin"].includes(handlerName) ? handlerName as HookHandler : "unknown";
        const origin: HookOrigin = { harness: options.harness, event, scope: options.scope, sourcePath: options.sourcePath, ...(options.pluginId ? { pluginId: options.pluginId } : {}) };
        hooks.push({
          id: hashNative({ origin, matcher, native }),
          origin,
          ...(map.phase ? { phase: map.phase } : {}),
          fidelity: map.fidelity,
          ...(matcher !== undefined ? { matcher } : {}),
          handler,
          native,
          enabled: native.enabled !== false && group.enabled !== false && group.disabled !== true,
          trust: options.trusted === undefined ? "unknown" : options.trusted ? "trusted" : "untrusted",
          discoveredFrom: options.pluginId ? "extension" : "configuration",
          evidence: [options.sourcePath],
        });
      }
    }
  }
  return { harness: options.harness, discovery: unresolved.length ? "partial" : "complete", hooks, unresolved };
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Merges scoped inventories (callers pass them highest precedence first) into one effective
 * inventory. Declarative hook scopes are additive in Claude/Codex/Gemini — a project hook does
 * not remove a user hook — so merging is a union deduplicated by hook id. The first occurrence
 * of an id (highest-precedence source) wins and its origin carries the scope it came from.
 * Runtime/plugin registrations that could not be inspected remain an explicit unresolved note:
 * an empty merged result is never reported as "complete".
 */
export function resolveEffectiveHooks(layers: readonly HookInventory[]): HookInventory {
  if (!layers.length) throw new Error("resolveEffectiveHooks: no layers provided");
  const harness = layers[0]!.harness;
  const byId = new Map<string, HookDefinition>();
  const unresolved: string[] = [];
  let allComplete = true;
  for (const layer of layers) {
    if (layer.discovery !== "complete") allComplete = false;
    unresolved.push(...layer.unresolved);
    for (const hook of layer.hooks) if (!byId.has(hook.id)) byId.set(hook.id, hook);
  }
  return {
    harness,
    discovery: allComplete ? "complete" : "partial",
    hooks: [...byId.values()],
    unresolved,
  };
}

export type HookEffect =
  | { readonly kind: "allow" }
  | { readonly kind: "deny"; readonly reason: string }
  | { readonly kind: "modify"; readonly input: unknown };
export interface HookInvocation {
  readonly phase: HookPhase;
  readonly sessionId: string;
  readonly toolName?: string;
  readonly input?: unknown;
}
export interface HookAuthorization {
  /** Approval is for exact, fingerprinted hook identity and phase, not for an entire project directory. */
  authorize(hook: HookDefinition, invocation: HookInvocation): boolean | Promise<boolean>;
}
export interface HookExecutor {
  /** Caller-owned execution boundary; this package deliberately provides no shell/HTTP executor. */
  invoke(hook: HookDefinition, invocation: HookInvocation): Promise<HookEffect>;
}
export interface HookReceipt {
  readonly hookId: string;
  readonly event: HookPhase;
  readonly decision: "not_applicable" | "unmapped" | "disabled" | "untrusted" | "unauthorized" | "no_executor" | "allow" | "deny" | "modify" | "failed";
  readonly reason?: string;
}
export interface HookDispatchResult {
  readonly effect: HookEffect;
  readonly receipts: readonly HookReceipt[];
}
/**
 * Conservative matcher subset. Unsupported native regex semantics MUST NOT silently
 * widen a hook's activation domain. Rich matchers require a harness-specific
 * conformance-tested evaluator, not JavaScript's unbounded user-supplied RegExp.
 */
export function matchHook(hook: HookDefinition, invocation: HookInvocation): boolean {
  if (!hook.matcher || hook.matcher === "*") return true;
  if (!invocation.toolName || !invocation.phase.startsWith("tool.")) return false;
  const patterns = hook.matcher.split("|");
  if (!patterns.length || patterns.length > 32) return false;
  if (!patterns.every(pattern => /^[A-Za-z0-9_.:\-]+$/.test(pattern))) return false;
  return patterns.includes(invocation.toolName);
}
export async function dispatchHooks(
  hooks: readonly HookDefinition[],
  invocation: HookInvocation,
  options: { readonly authorization?: HookAuthorization; readonly executor?: HookExecutor },
): Promise<HookDispatchResult> {
  const receipts: HookReceipt[] = [];
  let input = invocation.input;
  for (const hook of hooks) {
    const receipt = (decision: HookReceipt["decision"], reason?: string): void => {
      receipts.push({ hookId: hook.id, event: invocation.phase, decision, ...(reason ? { reason } : {}) });
    };
    if (hook.phase !== invocation.phase) { receipt(hook.fidelity === "unmapped" ? "unmapped" : "not_applicable"); continue; }
    if (hook.fidelity !== "exact") { receipt("unmapped", "mapping requires explicit semantic conformance"); continue; }
    if (!hook.enabled) { receipt("disabled"); continue; }
    if (!matchHook(hook, invocation)) { receipt("not_applicable", "matcher did not match or native syntax is unsupported"); continue; }
    if (hook.trust !== "trusted") { receipt("untrusted"); continue; }
    if (!options.authorization || !(await options.authorization.authorize(hook, invocation))) { receipt("unauthorized"); continue; }
    if (!options.executor) { receipt("no_executor"); continue; }
    try {
      const effect = await options.executor.invoke(hook, { ...invocation, input });
      receipt(effect.kind);
      if (effect.kind === "deny") return { effect, receipts };
      if (effect.kind === "modify") input = effect.input;
    } catch {
      receipt("failed", "handler failed; details withheld");
      // A failed pre-tool guard cannot be treated as allowing a tool to execute.
      if (invocation.phase === "tool.before" || invocation.phase === "permission.request") return { effect: { kind: "deny", reason: "approved safety hook failed" }, receipts };
    }
  }
  return { effect: input !== invocation.input ? { kind: "modify", input } : { kind: "allow" }, receipts };
}
