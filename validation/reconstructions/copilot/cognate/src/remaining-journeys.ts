import { createAgUiHandler } from "@godspeedai/cognate-ag-ui";
import type { Json } from "@godspeedai/cognate-events";
import { allowCapabilities } from "@godspeedai/cognate-kernel-api";
import type { Projection, ProjectionWrite } from "@godspeedai/cognate-projections";
import type { AgentDefinition, Caller, RunContext } from "@godspeedai/cognate-runtime-api";
import { invokeFrontend } from "@godspeedai/cognate-runtime-api";
import { createRuntime, type Runtime } from "@godspeedai/cognate-runtime-bun";
import {
  DECLARATIVE_OPERATION,
  JOURNEY_D_AGENT,
  JOURNEY_E_AGENT,
  JOURNEY_F_AGENT,
  JOURNEY_G_AGENT,
  JOURNEY_H_AGENT,
  JOURNEY_J_AGENT,
  JOURNEY_K_AGENT,
  JOURNEY_MCP_AGENT,
} from "./constants.ts";
import { deterministicModelComponent } from "./journey.ts";
import { storeConfigFor } from "./store.ts";
import { mcpToolContract } from "./mcp-bridge.ts";
import { sharedStateCanvasProjection } from "./shared-state.ts";

// ── Canonical journey identities ──────────────────────────────────────────────
// One agent id per canonical journey in .sea/interaction/canonical-journey-catalog.md.
// The ids live in constants.ts so browser surfaces can name their agent without importing
// this server-side module; they are re-exported here for the suite's imports.
export {
  DECLARATIVE_OPERATION,
  JOURNEY_D_AGENT,
  JOURNEY_E_AGENT,
  JOURNEY_F_AGENT,
  JOURNEY_G_AGENT,
  JOURNEY_H_AGENT,
  JOURNEY_J_AGENT,
  JOURNEY_K_AGENT,
  JOURNEY_MCP_AGENT,
};

export const CONTROLLED_RENDER_COMPONENT = "FlightSearchCard";
export const CONTINUATION_MESSAGE = "Continuing after the meeting decision.";
export const LIVE_RECOVERY_CHUNKS = ["Delivering ", "committed ", "progress ", "before ", "terminalization"] as const;
export const RICH_THREAD_MESSAGE = "Rich thread turn";

function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[name] : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// ── J-D agent context: immutable invocation input, separate from agent-writable state ──
export const journeyDAgent: AgentDefinition = {
  id: JOURNEY_D_AGENT,
  version: "1.0.0",
  async run(input, ctx) {
    const context = field(input, "context");
    const entries = Array.isArray(context) ? context : [];
    const published = entries.map((entry) => text(field(entry, "value"))).join("");
    // The mounted surface's contribution arrived as run input. The agent's own write goes to a
    // different durable channel, so neither can reach back and edit the recorded invocation.
    await ctx.updateSharedState("agent-context-note", { snapshot: { note: "agent-writable" } });
    return { context: published === "" ? null : published };
  },
};

// ── J-E controlled rendering: invocation evidence projected through a renderer catalog ──
export const journeyEAgent: AgentDefinition = {
  id: JOURNEY_E_AGENT,
  version: "1.0.0",
  async run(input, ctx) {
    const query = text(field(input, "query"));
    await ctx.emit("ui.render", { component: CONTROLLED_RENDER_COMPONENT, props: { query, status: "in_progress" } });
    const response = await ctx.invoke("model.generate", { messages: [{ role: "user", content: query }], stream: true });
    const answer = text(field(field(response, "message"), "content"));
    await ctx.emit("ui.render", { component: CONTROLLED_RENDER_COMPONENT, props: { query, status: "complete", answer } });
    return { answer };
  },
};

export const controlledRenderProjection: Projection = {
  name: "controlled-rendering",
  version: "1",
  apply(event, state) {
    if (event.eventType !== "ui.render" || !event.runId) return [];
    if (field(event.payload, "component") !== CONTROLLED_RENDER_COMPONENT) return [];
    const key = `${event.tenant}/run/${event.runId}`;
    const current = state.get(key) as { readonly phase?: string; readonly renders?: number } | undefined;
    const status = text(field(field(event.payload, "props"), "status"));
    return [{ key, value: { component: CONTROLLED_RENDER_COMPONENT, phase: status === "complete" ? "terminal" : "pending", renders: (current?.renders ?? 0) + 1 } }];
  },
};

// ── J-F tool human decision: an inline UI answers a waiting tool ──
export const journeyFAgent: AgentDefinition = {
  id: JOURNEY_F_AGENT,
  version: "1.0.0",
  async run(input, ctx) {
    const prompt = text(field(input, "prompt"));
    const decision = await invokeFrontend(ctx, "meeting-decision", "schedule.meeting", { prompt });
    await ctx.emit("message.delta", { text: CONTINUATION_MESSAGE });
    return { decision, continued: true };
  },
};

// ── J-G runtime interrupt: a run-level condition, discovered without a tool result ──
export const journeyGAgent: AgentDefinition = {
  id: JOURNEY_G_AGENT,
  version: "1.0.0",
  async run(input, ctx) {
    const reason = text(field(input, "reason")) || text(field(input, "message")) || "interrupted";
    const resolution = await ctx.waitFor("interrupt", {
      type: "run-interrupt",
      condition: { kind: "interrupt", source: "runtime" },
      payload: { reason },
    });
    return { resumed: true, resolution };
  },
};

// ── J-H declarative UI: a catalog-constrained projection with a returned interaction ──
export const DECLARATIVE_COMPONENT = "SalesDashboard";

export const declarativeCatalog = {
  [DECLARATIVE_COMPONENT]: { props: ["region", "revenue"], operations: [DECLARATIVE_OPERATION] },
} as const;

export type DeclarativeProps = { readonly [key: string]: string | number | boolean | null };

export type DeclarativeValidation =
  | { readonly ok: true; readonly component: string; readonly props: DeclarativeProps; readonly operations: readonly string[] }
  | { readonly ok: false; readonly reason: string };

/** Data-bound props a catalog may render: scalars only, so a projection write stays a JSON value. */
function scalarProps(value: unknown): DeclarativeProps {
  const props: Record<string, string | number | boolean | null> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return props;
  for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null || typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") props[name] = entry;
  }
  return props;
}

/** Application-owned catalog. It validates an agent-authored render before anything can display it. */
export function validateDeclarativeRender(payload: unknown): DeclarativeValidation {
  const component = text(field(payload, "component"));
  const entry = (declarativeCatalog as Record<string, { readonly props: readonly string[]; readonly operations: readonly string[] }>)[component];
  if (!entry) return { ok: false, reason: `unknown component: ${component || "(missing)"}` };
  const props = scalarProps(field(payload, "props"));
  for (const name of entry.props) if (!(name in props)) return { ok: false, reason: `${component} is missing its bound prop ${name}` };
  const rawOperations = field(payload, "operations");
  const operations = Array.isArray(rawOperations) ? rawOperations.map((operation) => text(field(operation, "id"))) : [];
  for (const id of operations) if (!entry.operations.includes(id)) return { ok: false, reason: `unknown operation: ${id || "(missing)"}` };
  return { ok: true, component, props, operations };
}

export function validateDeclarativeInteraction(component: string, operation: string): boolean {
  const entry = (declarativeCatalog as Record<string, { readonly operations: readonly string[] }>)[component];
  return entry !== undefined && entry.operations.includes(operation);
}

export const journeyHAgent: AgentDefinition = {
  id: JOURNEY_H_AGENT,
  version: "1.0.0",
  async run(_input, ctx: RunContext) {
    await ctx.emit("ui.render", {
      component: DECLARATIVE_COMPONENT,
      props: { region: "emea", revenue: 4200 },
      operations: [{ id: DECLARATIVE_OPERATION, label: "Select region" }],
    });
    await ctx.emit("ui.render", { component: "UnknownPanel", props: {}, operations: [{ id: "unresolvable" }] });
    const interaction = await ctx.waitFor("a2ui-interaction", {
      type: `a2ui:${DECLARATIVE_OPERATION}`,
      condition: { kind: "declarative_operation", component: DECLARATIVE_COMPONENT, operation: DECLARATIVE_OPERATION },
      payload: { component: DECLARATIVE_COMPONENT, operations: [DECLARATIVE_OPERATION] },
    });
    return { region: text(field(interaction, "region")) || null };
  },
};

export const declarativeCatalogProjection: Projection = {
  name: "declarative-catalog",
  version: "1",
  apply(event, state) {
    if (event.eventType !== "ui.render" || !event.runId) return [];
    const validated = validateDeclarativeRender(event.payload);
    // A rejected render leaves no projection row: the catalog's refusal is durable, not a render skip.
    if (!validated.ok) return [];
    const key = `${event.tenant}/run/${event.runId}`;
    const current = state.get(key) as { readonly renders?: number } | undefined;
    return [{ key, value: { component: validated.component, props: validated.props, operations: [...validated.operations], renders: (current?.renders ?? 0) + 1 } }];
  },
};

// ── J-J rich thread: replay keeps chat, tools and UI renderable without reauthorizing offers ──
export const journeyJAgent: AgentDefinition = {
  id: JOURNEY_J_AGENT,
  version: "1.0.0",
  async run(input, ctx) {
    await ctx.emit("message.delta", { text: text(field(input, "message")) || RICH_THREAD_MESSAGE });
    await ctx.emit("ui.render", { component: "ThreadSummaryCard", props: { title: text(field(input, "message")) || RICH_THREAD_MESSAGE } });
    const offers = await ctx.remoteOffers("discover-for-this-turn");
    const selected = offers[0];
    if (!selected) return { offers: [], tool: "no mounted capability" };
    const result = await ctx.invokeRemoteOffer("inspect-thread", selected.id, { target: "thread" });
    return { offers: offers.map((offer) => offer.id), tool: result };
  },
};

export type RichThreadView = {
  threadId: string;
  text: string;
  renders: { component: string; props: DeclarativeProps }[];
  tools: { type: string }[];
  status: string;
};

export const richThreadProjection: Projection = {
  name: "rich-thread",
  version: "1",
  apply(event, state) {
    if (!event.correlationId.startsWith("thread:")) return [];
    const key = `${event.tenant}/thread/${event.correlationId}`;
    const current = (state.get(key) as RichThreadView | undefined) ?? {
      threadId: event.correlationId,
      text: "",
      renders: [],
      tools: [],
      status: "idle",
    };
    if (event.eventType === "message.delta") {
      const delta = text(field(event.payload, "text"));
      if (!delta) return [];
      return [{ key, value: { ...current, text: current.text + delta } }];
    }
    if (event.eventType === "ui.render") {
      const component = text(field(event.payload, "component"));
      if (!component) return [];
      return [{ key, value: { ...current, renders: [...current.renders, { component, props: scalarProps(field(event.payload, "props")) }] } }];
    }
    if (event.eventType === "run.started") return [{ key, value: { ...current, status: "running" } }];
    if (event.eventType === "run.completed") return [{ key, value: { ...current, status: "completed" } }];
    if (event.eventType === "run.waiting") {
      const type = text(field(event.payload, "type"));
      if (!type.startsWith("remote:") && !type.startsWith("frontend:")) return [];
      if (current.tools.some((tool) => tool.type === type)) return [];
      return [{ key, value: { ...current, tools: [...current.tools, { type }] } }];
    }
    return [];
  },
};

// ── J-K live recovery: committed progress before terminalization, cursor resume without loss ──
export const journeyKAgent: AgentDefinition = {
  id: JOURNEY_K_AGENT,
  version: "1.0.0",
  async run(_input, ctx) {
    // The streaming phase is committed before any delta is delivered, so a resumed consumer has a
    // durable anchor to re-read from rather than guessing where the partial read stopped.
    await ctx.updateSharedState("live-recovery", { snapshot: { phase: "streaming" } });
    for (const chunk of LIVE_RECOVERY_CHUNKS) await ctx.emit("message.delta", { text: chunk });
    return { delivered: LIVE_RECOVERY_CHUNKS.length };
  },
};

// ── Open-ended Generative UI (MCP): tool invocation → UI resource → sandboxed interaction ──
// The display constants live in constants.ts so browser surfaces never import this server module;
// they are re-exported here for the server-side agent and tests.
export { MCP_APP_COMPONENT, MCP_APP_OPERATION, MCP_APP_OPERATION_LABEL } from "./constants.ts";
import { MCP_APP_COMPONENT, MCP_APP_OPERATION, MCP_APP_OPERATION_LABEL } from "./constants.ts";
export const MCP_TOOL_CONTRACT = mcpToolContract("create_view");

const MCP_DEFAULT_ROWS = [
  { label: "Step 1", value: "Capture request" },
  { label: "Step 2", value: "Route to capability" },
  { label: "Step 3", value: "Render result" },
] as const;

/** Shape the MCP bridge returns for a tool invocation: structured content plus its UI resource. */
export interface McpToolInvocation {
  readonly tool?: unknown;
  readonly viewId?: unknown;
  readonly structured?: unknown;
  readonly ui?: { readonly uri?: unknown; readonly mimeType?: unknown; readonly html?: unknown };
}

export const journeyMcpAgent: AgentDefinition = {
  id: JOURNEY_MCP_AGENT,
  version: "1.0.0",
  async run(input, ctx) {
    const title = text(field(input, "title")) || "Three-step flowchart";
    const rawRows = field(input, "rows");
    const rows = Array.isArray(rawRows) && rawRows.length > 0
      ? rawRows.map((row) => ({ label: text(field(row, "label")), value: text(field(row, "value")) }))
      : MCP_DEFAULT_ROWS.map((row) => ({ ...row }));

    // Discovery is recorded for replay before selection, exactly like any other remote offer.
    const offers = await ctx.remoteOffers("discover-mcp-tools");
    const selected = offers.find((offer) => offer.contract.id === MCP_TOOL_CONTRACT);
    if (!selected) {
      const unavailable: Json = { offers: offers.map((offer) => offer.contract.id), tool: "no MCP tool offered" };
      return unavailable;
    }

    // The selected tool call is committed as a durable `remote:mcp.create_view` continuation; the
    // bridge's published offer resolves it over the MCP protocol (tools/call + resources/read).
    const result = (await ctx.invokeRemoteOffer("invoke-mcp-tool", selected.id, { title, rows })) as McpToolInvocation;
    const html = text(field(result.ui, "html"));
    const resourceUri = text(field(result.ui, "uri"));
    const viewId = text(field(result, "viewId"));
    const tool = text(field(result, "tool"));
    if (html === "" || resourceUri === "") throw new Error(`MCP tool ${tool || MCP_TOOL_CONTRACT} returned no UI resource`);

    // The resolved UI resource becomes durable run truth through the general mechanisms: an
    // artifact attributed to this run, and a render event the projection validates before display.
    const artifactId = await ctx.artifact({ name: `mcp-ui-${viewId || "view"}.html`, mediaType: "text/html", bytes: new TextEncoder().encode(html) });
    await ctx.emit("ui.render", {
      component: MCP_APP_COMPONENT,
      props: { tool, viewId, resourceUri },
      artifactId,
      operations: [{ id: MCP_APP_OPERATION, label: MCP_APP_OPERATION_LABEL }],
    });

    // The sandboxed app's interaction is a durable wait of its own: the host surface resolves it
    // with the postMessage result the frame returned, and only then does the run settle.
    const interaction = await ctx.waitFor("mcp-app-interaction", {
      type: `mcp:${MCP_APP_OPERATION}`,
      condition: { kind: "mcp_app_interaction", component: MCP_APP_COMPONENT, operation: MCP_APP_OPERATION, resourceUri, viewId },
      payload: { component: MCP_APP_COMPONENT, operations: [MCP_APP_OPERATION], viewId, artifactId },
    });
    const settled: Json = { tool, viewId, artifactId, interaction };
    return settled;
  },
}

/**
 * Open-ended UI has no component catalog — the MCP server is the catalog, and the containment
 * boundary is the sandboxed frame, not schema validation. The projection therefore records the
 * validated identity of the render (component, tool, resource, artifact, declared operations) so a
 * replaying surface can rebuild the card without the live tool call.
 */
export const mcpAppProjection: Projection = {
  name: "mcp-open-ended",
  version: "1",
  apply(event, state) {
    if (event.eventType !== "ui.render" || !event.runId) return [];
    if (field(event.payload, "component") !== MCP_APP_COMPONENT) return [];
    const key = `${event.tenant}/run/${event.runId}`;
    const current = state.get(key) as { readonly renders?: number } | undefined;
    const rawOperations = field(event.payload, "operations");
    const operations = Array.isArray(rawOperations) ? rawOperations.map((operation) => text(field(operation, "id"))) : [];
    return [{
      key,
      value: {
        component: MCP_APP_COMPONENT,
        props: scalarProps(field(event.payload, "props")),
        artifactId: text(field(event.payload, "artifactId")),
        operations,
        renders: (current?.renders ?? 0) + 1,
      },
    }];
  },
};

export interface RemainingJourneysApp {
  readonly runtime: Runtime;
  readonly agUi: (request: Request) => Promise<Response>;
  close(): Promise<void>;
}

/** Isolated runtime composition over general Cognate primitives; no CopilotKit runtime is involved. */
export async function createRemainingJourneysApp(dataPath: string): Promise<RemainingJourneysApp> {
  const runtime = await createRuntime({
    store: storeConfigFor(dataPath, "copilot"),
    policy: allowCapabilities("remaining-journeys", ["model.generate"]),
    actions: { authorize: () => ({ allow: true, reason: "copilotkit reconstruction journeys make no external commitment" }) },
    agents: [journeyDAgent, journeyEAgent, journeyFAgent, journeyGAgent, journeyHAgent, journeyJAgent, journeyKAgent, journeyMcpAgent],
    components: [deterministicModelComponent()],
    projections: [
      { projection: controlledRenderProjection, public: true },
      { projection: declarativeCatalogProjection, public: true },
      { projection: richThreadProjection, public: true },
      { projection: sharedStateCanvasProjection, public: true },
      { projection: mcpAppProjection, public: true },
    ],
  });
  return {
    runtime,
    agUi: createAgUiHandler({
      service: runtime.service,
      defaultAgent: JOURNEY_K_AGENT,
      authenticate: (headers): Caller | undefined => {
        const match = /^Bearer ([\w-]+)$/.exec(headers.get("authorization") ?? "");
        return match ? { actor: { id: match[1]!, kind: "user" }, tenant: "tenant-a" } : undefined;
      },
    }),
    close: () => runtime.close(),
  };
}
