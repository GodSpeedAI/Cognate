import type { ModelProvider } from "@cognate/capabilities";
import type { Json } from "@cognate/events";
import type { CapabilityContract } from "@cognate/kernel-api";
import type { ComponentEntry, ProfileDefinition } from "@cognate/profile";
import type { Runtime } from "@cognate/runtime-bun";
import type { ReactNode } from "react";

export const COPILOT_AGENT = "agent.copilot";

/** The copilot profile as a composition of registered component names (spec §29.1). */
export declare const copilotProfile: ProfileDefinition;
/** Registry entries backing the profile's component names; unsupported ones carry their DEBT reason. */
export declare const copilotRegistry: readonly ComponentEntry<unknown>[];

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

/**
 * Build a copilot application: the copilot agent loops model → tool calls → backend tools (optionally approved) or
 * frontend tools (client-served continuations) → model, streaming text as `message.delta`, publishing shared state as
 * `state.changed`, generative UI as `ui.render {component, props}`, and artifacts via the run context.
 */
export function createCopilotApp(_options: CopilotAppOptions): Promise<CopilotApp> {
  throw new Error("profile-copilot: not implemented");
}

/** Renders a run's `ui.render` events with an application-supplied component registry (generative UI projection). */
export function GenerativeSurface(_props: { readonly runId: string; readonly components: Readonly<Record<string, (props: Json) => ReactNode>> }): ReactNode {
  throw new Error("profile-copilot: not implemented");
}
