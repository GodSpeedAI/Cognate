import type { ModelProvider } from "@cognate/capabilities";
import type { DurableStore, Json } from "@cognate/events";
import type { Component, ComponentHandle } from "@cognate/kernel-api";
import type { ComponentEntry, ProfileDefinition } from "@cognate/profile";
import type { AgentDefinition, RunContext } from "@cognate/runtime-api";
import type { Runtime } from "@cognate/runtime-bun";

export const LOOP_AGENT = "agent.loop";

export declare const harnessProfile: ProfileDefinition;
export declare const harnessRegistry: readonly ComponentEntry<unknown>[];

/** A tool is a capability `tool.<name>` plus a description and JSON Schema the loop offers to the model. */
export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: { readonly [key: string]: Json };
  readonly handler: (input: Json) => Json | Promise<Json>;
  /** Other capabilities this tool requires (dependency-driven activation, spec §35). */
  readonly requires?: Readonly<Record<string, { readonly capability: string }>>;
}

/** Kernel component publishing one tool; mount/dispose it to add/remove the tool live. */
export declare function toolComponent(tool: ToolSpec): Component;
/** A skill/extension: a named bundle of tools mounted as one component. */
export declare function skillComponent(skill: { readonly name: string; readonly tools: readonly ToolSpec[] }): Component;
/** Publishes `model.generate` for a provider (replaceable: dispose one, mount another). */
export declare function providerComponent(provider: ModelProvider): Component;
/** Publishes `storage.kv` ({op:"get"|"set"|"delete", key, value?}) backed by durable records in `store`. */
export declare function storageComponent(store: DurableStore): Component;

export interface HarnessOptions {
  readonly store: string;
  readonly instructions?: string;
  /** Maximum model/tool iterations per loop run. */
  readonly maxSteps?: number;
  /** Sandbox limits for `sandbox.exec` (Bun subprocess, scrubbed environment). */
  readonly sandbox?: { readonly timeoutMs: number; readonly maxOutputBytes: number };
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

/**
 * Build a harness. Built-in components: the loop agent (model → tool calls → tools → model, tools discovered from the
 * kernel each step), `storage.kv` backed by durable records, `sandbox.exec`, the scheduler, and sessions.
 */
export declare function createHarness(options: HarnessOptions): Promise<Harness>;

/** Durably start a subagent run from inside a run and wait for its output (resumes across restarts). */
export declare function spawnSubagent(ctx: RunContext, id: string, agent: string, input: Json): Promise<Json>;
