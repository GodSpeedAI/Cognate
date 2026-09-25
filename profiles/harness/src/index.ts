import { modelContract } from "@cognate/capabilities";
import type { ModelMessage, ModelProvider, ModelResponse } from "@cognate/capabilities";
import type { DurableStore, Json } from "@cognate/events";
import { isUnavailable, rulePolicy } from "@cognate/kernel-api";
import type { Component, ComponentHandle, Policy } from "@cognate/kernel-api";
import { defineProfile } from "@cognate/profile";
import type { ComponentEntry, ProfileDefinition } from "@cognate/profile";
import type { AgentDefinition, Caller, RunContext } from "@cognate/runtime-api";
import { createRuntime } from "@cognate/runtime-bun";
import type { ActionPolicy, Runtime } from "@cognate/runtime-bun";

export const LOOP_AGENT = "agent.loop";

// The harness composes registered components only; no kernel primitives are added (spec §29.2, §40.K).
const HARNESS_COMPONENTS = ["model-providers", "tool-registry", "agent-loop", "sessions", "storage", "skills", "scheduler", "sandbox", "subagents"] as const;

export const harnessProfile: ProfileDefinition = defineProfile({
  name: "harness",
  description: "Reference harness: model providers, tool registry, agent loop, sessions, storage, skills, scheduler, sandbox, and subagents (spec §29.2).",
  components: HARNESS_COMPONENTS,
});

export const harnessRegistry: readonly ComponentEntry<unknown>[] = HARNESS_COMPONENTS.map((name) => ({
  name,
  package: "@cognate/profile-harness",
  supported: true,
  contribute: () => undefined,
}));

/** A tool is a capability `tool.<name>` plus a description and JSON Schema the loop offers to the model. */
export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: { readonly [key: string]: Json };
  readonly handler: (input: Json) => Json | Promise<Json>;
  /** Other capabilities this tool requires (dependency-driven activation, spec §35). */
  readonly requires?: Readonly<Record<string, { readonly capability: string }>>;
}

/** Full tool metadata behind a mounted `tool.<name>` / `skill:<name>` component, keyed by component identity. */
const toolSpecOf = new WeakMap<Component, ToolSpec>();
const skillSpecOf = new WeakMap<Component, readonly ToolSpec[]>();

/** Kernel component publishing one tool; mount/dispose it to add/remove the tool live. */
export function toolComponent(tool: ToolSpec): Component {
  const component: Component = {
    id: `tool:${tool.name}`,
    requires: tool.requires,
    provides: [{ id: `tool.${tool.name}`, version: "1.0.0", attributes: { description: tool.description } }],
    activate(fiber) {
      fiber.provide({ id: `tool.${tool.name}`, version: "1.0.0", attributes: { description: tool.description } }, (input) => tool.handler(input as Json));
    },
  };
  toolSpecOf.set(component, tool);
  return component;
}

/** A skill/extension: a named bundle of tools mounted as one component. */
export function skillComponent(skill: { readonly name: string; readonly tools: readonly ToolSpec[] }): Component {
  const component: Component = {
    id: `skill:${skill.name}`,
    provides: skill.tools.map((tool) => ({ id: `tool.${tool.name}`, version: "1.0.0", attributes: { description: tool.description } })),
    activate(fiber) {
      for (const tool of skill.tools) fiber.provide({ id: `tool.${tool.name}`, version: "1.0.0", attributes: { description: tool.description } }, (input) => tool.handler(input as Json));
    },
  };
  skillSpecOf.set(component, skill.tools);
  return component;
}

/** Publishes `model.generate` for a provider (replaceable: dispose one, mount another). */
export function providerComponent(provider: ModelProvider): Component {
  const contract = modelContract(provider);
  return {
    id: `model-provider:${provider.id}`,
    provides: [contract],
    activate(fiber) {
      fiber.provide(contract, (input, context) => provider.generate(input as Parameters<ModelProvider["generate"]>[0], context.signal));
    },
  };
}

/** Publishes `storage.kv` ({op:"get"|"set"|"delete", key, value?}) backed by durable records, partitioned by the caller's tenant (§32). */
export function storageComponent(store: DurableStore): Component {
  return {
    id: "storage:kv",
    provides: [{ id: "storage.kv", version: "1.0.0" }],
    activate(fiber) {
      fiber.provide({ id: "storage.kv", version: "1.0.0" }, async (rawInput, ctx) => {
        const input = rawInput as { readonly op: "get" | "set" | "delete"; readonly key: string; readonly value?: Json };
        const id = `${ctx.tenant}/${input.key}`;
        if (input.op === "get") {
          const record = await store.getRecord("kv", id);
          return record && (record.value as { present: boolean }).present ? (record.value as { value: Json }).value : null;
        }
        for (;;) {
          const existing = await store.getRecord("kv", id);
          const expectedVersion = existing?.version ?? 0;
          const value = input.op === "set" ? (input.value ?? null) : null;
          try {
            await store.commit({ appends: [], records: [{ collection: "kv", id, expectedVersion, value: { present: input.op === "set", value } }] });
            return value;
          } catch (error) {
            if ((error as Error).name === "RecordConflictError") continue;
            throw error;
          }
        }
      });
    },
  };
}

/** Publishes `subagent.start`: starts a run as the system caller with a durable idempotency key. */
function subagentStartComponent(runtime: Runtime): Component {
  return {
    id: "subagent:start",
    provides: [{ id: "subagent.start", version: "1.0.0" }],
    activate(fiber) {
      fiber.provide({ id: "subagent.start", version: "1.0.0" }, async (rawInput, ctx) => {
        // The child runs in the invoking caller's tenant (HandlerContext.tenant, spec §32).
        const input = rawInput as { readonly agent: string; readonly input: Json; readonly key: string };
        const view = await runtime.service.startRun({ actor: { id: "system", kind: "system" }, tenant: ctx.tenant }, { agent: input.agent, input: input.input, idempotencyKey: input.key });
        return { runId: view.runId };
      });
    },
  };
}

/** Publishes `sandbox.exec`: a scrubbed, timed-out Bun subprocess. */
function sandboxComponent(limits: { readonly timeoutMs: number; readonly maxOutputBytes: number }): Component {
  return {
    id: "sandbox:exec",
    provides: [{ id: "sandbox.exec", version: "1.0.0" }],
    activate(fiber) {
      fiber.provide({ id: "sandbox.exec", version: "1.0.0" }, async (rawInput) => {
        const { code } = rawInput as { readonly code: string };
        const proc = Bun.spawn(["bun", "-e", code], { env: { PATH: process.env.PATH ?? "" }, stdout: "pipe", stderr: "pipe" });
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, limits.timeoutMs);
        const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
        clearTimeout(timer);
        const truncate = (text: string): string => {
          const bytes = new TextEncoder().encode(text);
          return bytes.length <= limits.maxOutputBytes ? text : new TextDecoder().decode(bytes.slice(0, limits.maxOutputBytes));
        };
        return { exitCode, stdout: truncate(stdout), stderr: truncate(stderr), timedOut };
      });
    },
  };
}

export interface HarnessOptions {
  readonly store: string;
  readonly instructions?: string;
  /** Maximum model/tool iterations per loop run. */
  readonly maxSteps?: number;
  /** Sandbox limits for `sandbox.exec` (Bun subprocess, scrubbed environment). */
  readonly sandbox?: { readonly timeoutMs: number; readonly maxOutputBytes: number };
  /** Identity the harness acts as for send/session/schedule (default LOCAL_OPERATOR). */
  readonly caller?: Caller;
  /** Additional agents (e.g. subagents) served by the runtime alongside the loop agent. */
  readonly agents?: readonly AgentDefinition[];
}

export interface Harness {
  readonly runtime: Runtime;
  /** Handle of the built-in `storage.kv` component (dispose/remount it to exercise §35). */
  readonly storage: ComponentHandle;
  /** Mount a component in the harness root scope (providers, tools, skills). */
  mount(component: Component): Promise<ComponentHandle>;
  /** Start the loop agent in a session (sessions group runs by `session:<id>` correlation). */
  send(sessionId: string, message: string): Promise<string>;
  /** Runs of a session, oldest first, with their status and output (a projection over run events). */
  session(sessionId: string): Promise<readonly { readonly runId: string; readonly status: string; readonly output: Json }[]>;
  /** Start `agent` with `input` at or after `at` (epoch ms), durably. Returns a schedule id. */
  schedule(agent: string, input: Json, at: number): Promise<string>;
  close(): Promise<void>;
}

const DEFAULT_SANDBOX = { timeoutMs: 30_000, maxOutputBytes: 200_000 };
const DEFAULT_MAX_STEPS = 8;
/** Default operator identity for a local, single-user harness; pass `caller` to run as someone else. */
export const LOCAL_OPERATOR: Caller = { actor: { id: "operator", kind: "user" }, tenant: "local" };

function sessionInputOf(input: Json): string | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const sessionId = (input as { readonly sessionId?: Json }).sessionId;
  return typeof sessionId === "string" ? sessionId : undefined;
}

/**
 * Build a harness. Built-in components: the loop agent (model → tool calls → tools → model, tools discovered from the
 * kernel each step), `storage.kv` backed by durable records, `sandbox.exec`, the scheduler, and sessions.
 */
export async function createHarness(options: HarnessOptions): Promise<Harness> {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const HARNESS_USER: Caller = options.caller ?? LOCAL_OPERATOR;
  const HARNESS_SYSTEM: Caller = { actor: { id: "system", kind: "system" }, tenant: HARNESS_USER.tenant };
  const sandboxLimits = options.sandbox ?? DEFAULT_SANDBOX;

  // This harness's own tool registry: name -> spec, kept live by effects registered on tool/skill activation.
  const tools = new Map<string, ToolSpec>();

  function withToolRegistry(component: Component): Component {
    const specs = toolSpecOf.has(component) ? [toolSpecOf.get(component)!] : skillSpecOf.get(component);
    if (!specs) return component;
    return {
      ...component,
      async activate(fiber) {
        await component.activate(fiber);
        for (const spec of specs) tools.set(spec.name, spec);
        fiber.effects.register(() => {
          for (const spec of specs) tools.delete(spec.name);
        });
      },
    };
  }

  function offeredTools(): ToolSpec[] {
    const offered: ToolSpec[] = [];
    for (const [name, spec] of tools) {
      const lease = runtime.kernel.resolve({ capability: `tool.${name}` });
      if (!isUnavailable(lease) && lease.valid) offered.push(spec);
    }
    return offered;
  }

  const loopAgent: AgentDefinition = {
    id: LOOP_AGENT,
    version: "1.0.0",
    async run(input, ctx) {
      const { message } = input as { readonly message: string; readonly sessionId?: string };
      const messages: ModelMessage[] = [];
      if (options.instructions) messages.push({ role: "system", content: options.instructions });
      messages.push({ role: "user", content: message });
      const steps: Json[] = [];
      for (let step = 0; step < maxSteps; step++) {
        const toolDefs = offeredTools().map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
        const response = (await ctx.invoke("model.generate", { messages, tools: toolDefs } as unknown as Json)) as unknown as ModelResponse;
        if (response.finishReason !== "tool_calls" || response.toolCalls.length === 0) return { answer: response.message.content, steps };
        messages.push({ role: "assistant", content: response.message.content, toolCalls: response.toolCalls });
        for (const call of response.toolCalls) {
          const result = await ctx.invoke(`tool.${call.name}`, call.arguments);
          steps.push({ tool: call.name, arguments: call.arguments, result });
          messages.push({ role: "tool", content: JSON.stringify(result), toolCallId: call.id });
        }
      }
      return { answer: "max steps reached", steps };
    },
  };

  const policy: Policy = rulePolicy("harness-allow-all", [() => ({ allow: true, policyId: "harness-allow-all", reason: "harness policy allows all invocations by default (spec §29.2)" })]);
  const actions: ActionPolicy = { authorize: () => ({ allow: true, reason: "harness actions policy allows system and default users (spec §29.2)" }) };

  const runtime = await createRuntime({ store: options.store, policy, actions, agents: [loopAgent, ...(options.agents ?? [])] });

  async function mount(component: Component): Promise<ComponentHandle> {
    const handle = await runtime.kernel.mount(withToolRegistry(component));
    await handle.waitFor("ACTIVE", 10_000).catch(() => {});
    return handle;
  }

  const storageHandle = await mount(storageComponent(runtime.store));
  await mount(sandboxComponent(sandboxLimits));
  await mount(subagentStartComponent(runtime));

  // Resolve any subagent `run_completion` continuation whose child run `runId` is already terminal.
  async function resolveSubagentCompletion(runId: string): Promise<void> {
    const view = await runtime.service.getRun(HARNESS_SYSTEM, { runId }).catch(() => undefined);
    if (!view || view.status === "running" || view.status === "waiting") return;
    for (const continuation of await runtime.service.listContinuations(HARNESS_SYSTEM, { status: "OPEN" })) {
      if (continuation.type !== "subagent") continue;
      const condition = continuation.condition as { readonly kind?: string; readonly runId?: string };
      if (condition.kind !== "run_completion" || condition.runId !== runId) continue;
      await runtime.service
        .resolveContinuation(HARNESS_SYSTEM, { continuationId: continuation.id, action: "resume", input: view.output, idempotencyKey: `subagent-complete:${continuation.id}` })
        .catch(() => {});
    }
  }

  // A child may finish before its parent's `run_completion` continuation is even durably opened (ordinary
  // race) or before the harness restarts and resubscribes (crash/restart window); check both directions.
  async function checkAlreadyResolved(parentRunId: string): Promise<void> {
    for (const continuation of await runtime.service.listContinuations(HARNESS_SYSTEM, { runId: parentRunId, status: "OPEN" })) {
      if (continuation.type !== "subagent") continue;
      const condition = continuation.condition as { readonly kind?: string; readonly runId?: string };
      if (condition.kind === "run_completion" && condition.runId) await resolveSubagentCompletion(condition.runId);
    }
  }

  const unsubscribeCommits = runtime.store.onCommitted((events) => {
    for (const event of events) {
      if (!event.runId) continue;
      if (event.eventType === "run.completed" || event.eventType === "run.failed" || event.eventType === "run.cancelled") void resolveSubagentCompletion(event.runId);
      if (event.eventType === "run.waiting") void checkAlreadyResolved(event.runId);
    }
  });

  // On start, a child may already have finished before its continuation was durably recorded (crash/restart window).
  for (const continuation of await runtime.service.listContinuations(HARNESS_SYSTEM, { status: "OPEN" })) {
    if (continuation.type !== "subagent") continue;
    const condition = continuation.condition as { readonly kind?: string; readonly runId?: string };
    if (condition.kind === "run_completion" && condition.runId) await resolveSubagentCompletion(condition.runId);
  }

  async function send(sessionId: string, message: string): Promise<string> {
    const view = await runtime.service.startRun(HARNESS_USER, { agent: LOOP_AGENT, input: { message, sessionId }, idempotencyKey: crypto.randomUUID(), correlationId: `session:${sessionId}` });
    return view.runId;
  }

  async function session(sessionId: string): Promise<readonly { readonly runId: string; readonly status: string; readonly output: Json }[]> {
    // Served by the runtime's run index (DEBT-019), not an event-log scan.
    const runs = await runtime.service.listRuns(HARNESS_USER, { correlationId: `session:${sessionId}` });
    return runs.map((view) => ({ runId: view.runId, status: view.status, output: view.output }));
  }

  async function schedule(agent: string, input: Json, at: number): Promise<string> {
    const id = crypto.randomUUID();
    await runtime.store.commit({ appends: [], records: [{ collection: "schedules", id, expectedVersion: 0, value: { agent, input, at, started: false } }] });
    return id;
  }

  async function tickScheduler(): Promise<void> {
    const now = Date.now();
    for (const record of await runtime.store.listRecords("schedules", { started: false })) {
      const value = record.value as { readonly agent: string; readonly input: Json; readonly at: number };
      if (value.at > now) continue;
      try {
        await runtime.store.commit({ appends: [], records: [{ collection: "schedules", id: record.id, expectedVersion: record.version, value: { ...value, started: true } }] });
      } catch {
        continue; // lost the race to another tick; the winner starts it.
      }
      const sessionId = sessionInputOf(value.input);
      await runtime.service.startRun(HARNESS_SYSTEM, { agent: value.agent, input: value.input, idempotencyKey: record.id, ...(sessionId ? { correlationId: `session:${sessionId}` } : {}) }).catch(() => {});
    }
  }
  const schedulerTimer = setInterval(() => void tickScheduler().catch(() => {}), 20);

  async function close(): Promise<void> {
    clearInterval(schedulerTimer);
    unsubscribeCommits();
    await runtime.close();
  }

  return { runtime, storage: storageHandle, mount, send, session, schedule, close };
}

/** Durably start a subagent run from inside a run and wait for its output (resumes across restarts). */
export async function spawnSubagent(ctx: RunContext, id: string, agent: string, input: Json): Promise<Json> {
  const { runId } = (await ctx.invoke("subagent.start", { agent, input, key: `${ctx.runId}:${id}` })) as { readonly runId: string };
  return ctx.waitFor(id, { type: "subagent", condition: { kind: "run_completion", runId }, payload: { agent } });
}
