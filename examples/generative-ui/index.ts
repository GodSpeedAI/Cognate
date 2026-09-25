// Example: generative-ui — an agent emits `ui.render` events that a component registry renders to HTML.
// Docs: docs/ui.md (ADR-0009; spec §12: `ui.render {component, props}` is a generative UI projection).
import { resolve } from "node:path";
import { createClient } from "@cognate/client";
import type { AgentDefinition } from "@cognate/runtime-api";
import { createRuntime } from "@cognate/runtime-bun";
import { alice } from "@cognate/runtime-api/conformance";

// react/react-dom aren't hoisted to the repo root; resolve them the way the codebase's own stdio-transport
// test does for out-of-workspace-root scripts, relative to a package that declares them (packages/ui-astryx).
const reactPath = Bun.resolveSync("react", resolve("packages/ui-astryx"));
const reactDomServerPath = Bun.resolveSync("react-dom/server", resolve("packages/ui-astryx"));
const React = (await import(reactPath)) as typeof import("react");
const { renderToString } = (await import(reactDomServerPath)) as typeof import("react-dom/server");

const cardAgent: AgentDefinition = {
  id: "agent.card",
  version: "1.0.0",
  async run(input, ctx) {
    const { amount } = input as { readonly amount: number };
    await ctx.emit("ui.render", { component: "RefundCard", props: { amount } });
    await ctx.emit("ui.render", { component: "StatusBadge", props: { status: "approved" } });
    return { rendered: true };
  },
};

// A minimal application-supplied registry, analogous to what `GenerativeSurface` accepts.
const components: Record<string, (props: Record<string, unknown>) => unknown> = {
  RefundCard: (props) => React.createElement("section", { "aria-label": "refund-card" }, `Refund: ${props.amount}`),
  StatusBadge: (props) => React.createElement("span", { className: "badge" }, String(props.status)),
};

async function main() {
  const runtime = await createRuntime({
    store: ":memory:",
    policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: [cardAgent],
  });
  const client = createClient({ service: runtime.service, caller: alice });
  try {
    const { runId } = await client.startRun("agent.card", { amount: 42 });
    await waitUntil(() => client.run(runId).get(), (s) => s.status === "completed");

    const renders: { component: string; props: Record<string, unknown> }[] = [];
    const stop = client.subscribe({ runId }, (e) => {
      if (e.eventType === "ui.render") renders.push(e.payload as { component: string; props: Record<string, unknown> });
    });
    stop();
    if (renders.length !== 2) throw new Error(`expected two ui.render events, got: ${JSON.stringify(renders)}`);

    const html = renders.map((r) => renderToString(components[r.component]?.(r.props) as never)).join("");
    if (!html.includes("refund-card") || !html.includes("Refund: 42") || !html.includes("badge")) throw new Error(`unexpected rendered HTML: ${html}`);

    console.log(`ok: generative UI rendered ${renders.length} ui.render events to HTML via react-dom/server: ${html}`);
  } finally {
    await client.close();
    await runtime.close();
  }
}

async function waitUntil<T>(read: () => T, ok: (v: T) => boolean, ms = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = read();
    if (ok(value)) return value;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for condition, last value: ${JSON.stringify(value)}`);
    await Bun.sleep(10);
  }
}

await main();
