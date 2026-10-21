// CG-E2E-001 (spec §36): the §36 end-to-end journey app. Started as a separate Bun process by
// global-setup.ts (DEBT-012); reads PORT, COGNATE_E2E_DB, COGNATE_E2E_DIR from the environment and
// prints "listening on http://127.0.0.1:<port>" once ready.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bindCapabilities, loadSemanticProjection } from "@godspeedai/cognate-domainforge";
import type { CapabilityContract, Component } from "@godspeedai/cognate-kernel-api";
import { allowCapabilities } from "@godspeedai/cognate-kernel-api";
import { cognitiveIndexer, type IndexDocument } from "@godspeedai/cognate-cognitive-api";
import { createRuVectorIndex } from "@godspeedai/cognate-cognitive-ruvector";
import { hashingEmbedder } from "@godspeedai/cognate-cognitive-memory";
import { createRvfIndex } from "@godspeedai/cognate-cognitive-rvf";
import { ProjectionRunner } from "@godspeedai/cognate-projections";
import { createSxrCliPort, observationIntent, ObservationDelivery } from "@godspeedai/cognate-realitytrace";
import type { AgentDefinition, RunContext } from "@godspeedai/cognate-runtime-api";
import { ContinuationClosedError } from "@godspeedai/cognate-runtime-api";
import { createRuntime, type PendingEvent } from "@godspeedai/cognate-runtime-bun";
import { devTokenAuthenticator, serveRuntime } from "@godspeedai/cognate-protocol-connect-bun";
import type { Json, StoredEvent } from "@godspeedai/cognate-events";

const PORT = Number(process.env.PORT ?? "43917");
const DB = process.env.COGNATE_E2E_DB ?? ":memory:";
const E2E_DIR = process.env.COGNATE_E2E_DIR ?? process.cwd();
const DIMENSION = 32;

const repoRoot = resolve(import.meta.dir, "..", "..");
const REALITYTRACE_BIN = join(repoRoot, ".tmp", "realitytrace", "bin", "realitytrace");
if (!existsSync(REALITYTRACE_BIN)) {
  console.error(`app.ts: RealityTrace CLI not found at ${REALITYTRACE_BIN}. Run "just setup-realitytrace" first.`);
  process.exit(1);
}

// ── DomainForge: semantic projection + explicit capability binding (spec §19) ─────────────────
const seaSource = readFileSync(join(import.meta.dir, "domain", "refund.sea"), "utf8");
const loaded = loadSemanticProjection(seaSource, { uri: "domain/refund.sea" });
if (!loaded.ok) {
  console.error(`app.ts: failed to parse domain/refund.sea: ${JSON.stringify(loaded.error)}`);
  process.exit(1);
}
const projection = loaded.projection;
const flow = projection.objects.find((o) => o.kind === "Flow");
if (!flow) {
  console.error("app.ts: expected a Flow object in domain/refund.sea");
  process.exit(1);
}

const [quoteContract, approveContract] = bindCapabilities(projection, [
  { semanticId: flow.ref.id, capability: { id: "billing.quote", version: "1.0.0" } },
  { semanticId: flow.ref.id, capability: { id: "refund.approve", version: "1.0.0" } },
]) as [CapabilityContract, CapabilityContract];

const REFUND_DESK_ID = "refund-desk";
const refundDesk: Component = {
  id: REFUND_DESK_ID,
  provides: [quoteContract, approveContract],
  activate(fiber) {
    fiber.provide(quoteContract, (input) => {
      const amount = (input as { readonly amount: number }).amount;
      return { total: amount * 2 };
    });
    fiber.provide(approveContract, (input) => {
      const { order, total } = input as { readonly order: number; readonly total: number };
      return { approved: true, order, total };
    });
  },
};

// ── Cognition: one completed-run extraction shared by the runtime's live indexer and the
// admin RVF snapshot rebuild, so both ever index the same documents from the same events. ──────
function extractRun(event: StoredEvent): readonly IndexDocument[] {
  if (event.eventType !== "run.completed" || !event.runId || event.payload === null) return [];
  return [
    {
      id: `run:${event.runId}`,
      sourceType: "run",
      sourceRef: `run:${event.runId}`,
      tenant: event.tenant,
      scopeId: event.scopeId,
      semanticRef: event.semanticRef ?? null,
      eventRef: event.eventId,
      traceRef: null,
      metadata: {},
      relationships: [],
      validFrom: event.recordedAt,
      validTo: null,
      text: JSON.stringify(event.payload),
    },
  ];
}

const embedder = hashingEmbedder(DIMENSION);
const cognitionIndex = await createRuVectorIndex({ dimension: DIMENSION, storagePath: join(E2E_DIR, "cognition.ruvector") });

// ── RealityTrace: real SXR-shaped CLI port, isolated HOME, prepared once at startup ─────────────
const realityTraceHome = join(E2E_DIR, "realitytrace-home");
mkdirSync(realityTraceHome, { recursive: true });
const observationPort = createSxrCliPort({
  bin: REALITYTRACE_BIN,
  repoDir: join(E2E_DIR, "realitytrace-repo"),
  env: { HOME: realityTraceHome },
});
await observationPort.prepare({ title: "Cognate §36 e2e journey" });

// ── Agent: parse an order number, recall prior interactions, quote, wait for human approval,
// approve, and produce a JSON receipt artifact (spec §36). ──────────────────────────────────────
const ORDER_RE = /order\s+(\d+)/i;

const refundAgent: AgentDefinition = {
  id: "agent.refund",
  version: "1.0.0",
  async run(input, ctx: RunContext): Promise<Json> {
    const { message } = input as { readonly message: string };
    const match = ORDER_RE.exec(message);
    const order = match ? Number(match[1]) : 0;

    const recall = await ctx.recall("prior", { text: message, k: 3 });
    const recalled = recall.status === "ok" ? recall.items.map((item) => item.sourceRef) : [];
    if (recalled.length >= 1) {
      await ctx.emit("message.delta", { text: `Recalled ${recalled.length} prior interaction(s). ` });
      // A related prior interaction was found: this run just surfaces the recall (spec §36's
      // journey only asks the *first* run to quote, wait for approval, and produce an artifact).
      return { recalled, artifactId: null };
    }

    const quote = (await ctx.invoke("billing.quote", { amount: order })) as { readonly total: number };
    await ctx.emit("message.delta", { text: `Quote: ${quote.total}` });

    const decision = (await ctx
      .waitFor("refund-approval", {
        type: "refund.approval",
        condition: { kind: "human_approval" },
        payload: { order, total: quote.total },
      })
      .catch((error: unknown) => {
        if (error instanceof ContinuationClosedError) return { approved: false };
        throw error;
      })) as { readonly approved?: boolean } | null;

    if (!decision?.approved) {
      return { recalled, artifactId: null, approved: false };
    }

    await ctx.invoke("refund.approve", { order, total: quote.total });
    const artifactId = await ctx.artifact({
      name: "refund-receipt.json",
      mediaType: "application/json",
      bytes: new TextEncoder().encode(JSON.stringify({ approved: true, order, total: quote.total })),
    });

    return { recalled, artifactId, approved: true };
  },
};

// ── Runtime: SQLite store, cognition, and RealityTrace observation intents for every capability
// invocation (spec §13.1, §20). ─────────────────────────────────────────────────────────────────
const runtime = await createRuntime({
  store: DB,
  policy: allowCapabilities("refund-app", ["billing.quote", "refund.approve"]),
  actions: { authorize: () => ({ allow: true, reason: "the e2e journey app allows its own callers" }) },
  agents: [refundAgent],
  components: [refundDesk],
  cognition: { index: cognitionIndex, embedder, extract: extractRun, persistent: false },
  outboxFor: (event: PendingEvent) => {
    if (event.eventType !== "run.invocation") return [];
    const capabilityId = typeof event.metadata?.capability === "string" ? (event.metadata.capability as string) : undefined;
    return [observationIntent(event, { classification: "reversible_effect", ...(capabilityId ? { capabilityId } : {}) })];
  },
});

const observationDelivery = new ObservationDelivery(runtime.store, {
  port: observationPort,
  backoff: { baseMs: 50, maxMs: 5_000, maxAttempts: 10 },
});
const observationTimer = setInterval(() => {
  observationDelivery.drain().catch(() => {});
}, 50);

// ── Connect: an internal serveRuntime instance, reverse-proxied from the app's own origin ──────
const internal = serveRuntime({ service: runtime.service, authenticate: devTokenAuthenticator, port: 0, hostname: "127.0.0.1" });

// ── UI: bundle the browser entry with Bun.build, serve Astryx CSS, and the shell page ──────────
const { stylesheetPaths } = await import("@godspeedai/cognate-ui-astryx/styles");
const cssPaths = stylesheetPaths();
const build = await Bun.build({ entrypoints: [join(import.meta.dir, "browser.tsx")], target: "browser", format: "esm" });
if (!build.success) {
  console.error(`app.ts: failed to bundle the UI: ${build.logs.map((log) => String(log)).join("; ")}`);
  process.exit(1);
}
const bundleJs = await build.outputs[0]!.text();

function indexHtml(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Refund copilot</title>
<link rel="stylesheet" href="/astryx.css" />
<link rel="stylesheet" href="/theme.css" />
</head>
<body>
<div id="root"></div>
<script type="module" src="/app.js"></script>
</body>
</html>
`;
}

const healthPayload = { ok: true, semantic: { objects: projection.objects.length, digest: projection.source.digest }, components: [REFUND_DESK_ID] };

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") return Response.json(healthPayload);

    if (url.pathname.startsWith("/cognate.v1.RuntimeService/")) {
      const init: RequestInit & { duplex?: "half" } = { method: request.method, headers: request.headers, body: request.body };
      if (request.body) init.duplex = "half";
      return fetch(new Request(internal.url + url.pathname + url.search, init));
    }

    if (url.pathname === "/admin/rvf-snapshot" && request.method === "POST") {
      const dir = join(E2E_DIR, "rvf-snapshots");
      mkdirSync(dir, { recursive: true });

      // createRvfIndex retries the transient native FsyncFailed case itself (DEBT-018).
      const workingPath = join(dir, `working-${crypto.randomUUID()}.rvf`);
      const rvfIndex = await createRvfIndex({ dimension: DIMENSION, path: workingPath }).catch((error: unknown) => error as Error);
      if (rvfIndex instanceof Error) return Response.json({ error: `rvf index create failed: ${rvfIndex.message}` }, { status: 500 });
      try {
        const runner = new ProjectionRunner(runtime.store, cognitiveIndexer({ name: "admin.rvf.snapshot", version: "1", index: rvfIndex, embedder, extract: extractRun }));
        const caughtUp = await runner.catchUp();
        await runner.stop();
        if (caughtUp.status !== "ok") {
          return Response.json({ error: `projection ${caughtUp.status}` }, { status: 500 });
        }
        const storeHead = (await runtime.store.readAll()).at(-1)?.position ?? 0;
        const manifest = await rvfIndex.snapshot(runtime.store, {
          dir,
          name: `snapshot-${Date.now()}`,
          lineage: "cognate-e2e",
          indexedThrough: caughtUp.position,
          storeHead,
          onBehind: "fail",
          frameworkVersion: "0.0.0",
        });
        return Response.json(manifest);
      } finally {
        await rvfIndex.close();
      }
    }

    if (url.pathname === "/app.js") return new Response(bundleJs, { headers: { "content-type": "text/javascript" } });
    if (url.pathname === "/astryx.css" && cssPaths[0]) return new Response(Bun.file(cssPaths[0]));
    if (url.pathname === "/theme.css" && cssPaths[1]) return new Response(Bun.file(cssPaths[1]));
    if (url.pathname === "/") return new Response(indexHtml(), { headers: { "content-type": "text/html" } });

    return new Response("not found", { status: 404 });
  },
});

async function shutdown(): Promise<void> {
  clearInterval(observationTimer);
  server.stop(true);
  await internal.stop();
  await runtime.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

console.log(`listening on http://127.0.0.1:${server.port}`);
