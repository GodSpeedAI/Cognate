import { EventSchema } from "@ag-ui/core/schemas";
import type { AgentDefinition } from "@godspeedai/runtime-api";
import { invokeFrontend } from "@godspeedai/runtime-api";
import { createRuntime } from "@godspeedai/runtime-bun";
import { createAgUiHandler } from "../src/index.ts";

export const agents: AgentDefinition[] = [
  {
    id: "agent.context",
    version: "1.0.0",
    async run(input) { return input; },
  },
  {
    id: "agent.remote",
    version: "1.0.0",
    async run(_input, ctx) {
      // Consumes a client-published remote offer (the lease-bound browser/MCP capability path):
      // list what is currently offered, select the first, and commit a durable remote wait.
      const offers = await ctx.remoteOffers("list");
      const offer = offers[0];
      if (!offer) return { applied: null };
      const applied = await ctx.invokeRemoteOffer("apply", offer.id, { from: "agent" });
      return { applied };
    },
  },
  {
    id: "agent.copilot",
    version: "1.0.0",
    async run(input, ctx) {
      const text = String((input as { message?: string }).message ?? "");
      for (const w of ["Checking ", "your ", "refund"]) await ctx.emit("message.delta", { text: w });
      await ctx.emit("state.changed", { snapshot: { refund: { amount: 3, status: "review" } } });
      const quote = await ctx.invoke("billing.quote", { amount: 3 });
      await ctx.emit("state.changed", { patch: [{ op: "replace", path: "/refund/status", value: "awaiting-approval" }] });
      if (text.includes("oauth")) await ctx.waitFor("oauth", { type: "oauth", condition: { kind: "oauth_callback" }, payload: {} });
      const approval = (await ctx.waitFor("approve", { type: "refund-approval", condition: { kind: "human_approval" }, payload: { quote } })) as { approved: boolean };
      const focus = await invokeFrontend(ctx, "focus", "map.focus", { lat: 1, lng: 2 });
      return { approved: approval.approved, focus };
    },
  },
];

/** `store` defaults to in-memory; pass a SQLite path to restart a server against the same durable history. */
export async function setup(store = ":memory:") {
  const runtime = await createRuntime({
    store,
    policy: { authorize: (r) => (r.actor.id === "mallory" ? { allow: false, policyId: "p", reason: "denied" } : { allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: ({ caller }) => (caller.actor.id === "mallory" ? { allow: false, reason: "denied" } : { allow: true, reason: "ok" }) },
    agents,
    components: [{ id: "billing", provides: [{ id: "billing.quote", version: "1.0.0" }], activate: (f) => f.provide({ id: "billing.quote", version: "1.0.0" }, (i) => ({ total: (i as { amount: number }).amount * 2 })) }],
  });
  const handler = createAgUiHandler({
    service: runtime.service,
    defaultAgent: "agent.copilot",
    authenticate: (h) => {
      // `Bearer <actor>` or `Bearer <actor>@<tenant>` (tenant defaults to tenant-a).
      const m = /^Bearer (\w+)(?:@([\w-]+))?$/.exec(h.get("authorization") ?? "");
      return m ? { actor: { id: m[1]!, kind: "user" }, tenant: m[2] ?? "tenant-a" } : undefined;
    },
  });
  const server = Bun.serve({ port: 0, fetch: handler });
  return { runtime, server, url: `${server.url.origin}/agui`, async close() { server.stop(true); await runtime.close(); } };
}

export type Event = { type: string; [k: string]: unknown };

/** POST a RunAgentInput and collect SSE events until the stream ends (or `stopAfter` events). */
export async function post(url: string, input: Record<string, unknown>, options: { token?: string | null; stopAfter?: number } = {}): Promise<{ status: number; events: Event[] }> {
  const controller = new AbortController();
  const response = await fetch(url, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json", accept: "text/event-stream", ...(options.token === null ? {} : { authorization: `Bearer ${options.token ?? "alice"}` }) }, body: JSON.stringify({ threadId: "t-1", runId: "r-1", messages: [], tools: [], context: [], state: {}, forwardedProps: {}, ...input }) });
  const events: Event[] = [];
  if (!response.body) return { status: response.status, events };
  const reader = response.body.getReader();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += new TextDecoder().decode(value);
      let index: number;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
        if (data) events.push(JSON.parse(data));
        if (options.stopAfter && events.length >= options.stopAfter) {
          controller.abort();
          return { status: response.status, events };
        }
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  }
  return { status: response.status, events };
}

export const valid = (events: Event[]) => events.every((e) => EventSchema.safeParse(e).success);
export const types = (events: Event[]) => events.map((e) => e.type);
