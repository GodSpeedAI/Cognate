// Single Bun process: Cognate Runtime + Connect RuntimeService + AG-UI + bundled React UI + CSS.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgUiHandler } from "@godspeedai/cognate-ag-ui";
import { allowCapabilities, type Policy } from "@godspeedai/cognate-kernel-api";
import { createClient } from "@godspeedai/cognate-client";
import { registerRuntimeService } from "@godspeedai/cognate-protocol-connect";
import { devToken, devTokenAuthenticator } from "@godspeedai/cognate-protocol-connect-bun";
import type { Caller, RuntimeService } from "@godspeedai/cognate-runtime-api";
import { createRuntime, type ActionPolicy, type Runtime } from "@godspeedai/cognate-runtime-bun";
import { createConnectRouter } from "@connectrpc/connect";
import { createFetchHandler } from "@connectrpc/connect/protocol";

import { loadJourneyABindings, loadJourneyCBindings } from "./domain.ts";
import { chatAgent, deterministicModelComponent, JOURNEY_A_AGENT, threadHistoryProjection } from "./journey.ts";
import { connectMcpBridge, type McpBridge } from "./mcp-bridge.ts";
import { startMcpFixtureServer } from "./mcp-fixture-server.ts";
import {
  controlledRenderProjection,
  declarativeCatalogProjection,
  journeyDAgent,
  journeyEAgent,
  journeyFAgent,
  journeyGAgent,
  journeyHAgent,
  journeyJAgent,
  journeyKAgent,
  journeyMcpAgent,
  JOURNEY_MCP_AGENT,
  mcpAppProjection,
  richThreadProjection,
} from "./remaining-journeys.ts";
import { remoteCapabilityAgent } from "./remote-capability.tsx";
import { sharedStateAgent, sharedStateCanvasProjection } from "./shared-state.ts";

export const LOCAL_OPERATOR = { actor: { id: "operator", kind: "user" as const }, tenant: "tenant-a" };

export interface ServerOptions {
  readonly port: number;
  readonly home: string;
}

export interface AppServer {
  readonly url: string;
  readonly runtime: Runtime;
  stop(): Promise<void>;
}

function buildPolicy(): Policy {
  return allowCapabilities("copilot-reconstruction", [
    "model.generate",
    "browser.selection.apply",
    "conversation.start",
    "conversation.send",
    "conversation.stream",
    "conversation.observe",
    "state.observe",
    "state.update",
    "state.stream",
  ]);
}

function buildActionPolicy(): ActionPolicy {
  return {
    authorize: () => ({ allow: true, reason: "local operator authorized" }),
  };
}

const BROWSER_ENTRY_TEMPLATE = (caller: { readonly tenant: string; readonly actorId: string }) => `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@godspeedai/cognate-client";
import { CognateProvider } from "@godspeedai/cognate-react";
import { connectTransport, devToken } from "@godspeedai/cognate-protocol-connect-bun";
import { createRemoteRuntimeService } from "@godspeedai/cognate-protocol-connect";
import { App } from "../src/ui/App.tsx";

const caller = { tenant: ${JSON.stringify(caller.tenant)}, actor: { id: ${JSON.stringify(caller.actorId)}, kind: "user" } };
const transport = connectTransport(window.location.origin);
const service = createRemoteRuntimeService(transport, () => devToken(caller));
const client = createClient({ service, caller });

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(createElement(CognateProvider, { client }, createElement(App)));
}
`;

function indexHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cognate Copilot Reconstruction</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/app.css" />
</head>
<body>
<div id="root"></div>
<script>document.documentElement.dataset.theme="light"</script>
<script type="module" src="/app.js"></script>
</body>
</html>
`;
}

export async function startServer(options: ServerOptions): Promise<AppServer> {
  const home = options.home;
  await mkdir(home, { recursive: true });
  const storePath = join(home, "copilot.sqlite");

  await loadJourneyABindings();
  await loadJourneyCBindings();

  const runtime = await createRuntime({
    store: storePath,
    policy: buildPolicy(),
    actions: buildActionPolicy(),
    // The served runtime hosts every canonical journey agent (J-A..J-K + open-ended MCP) so each
    // UI surface can start its runs; the agents and projections themselves stay exactly as the
    // suite tests them.
    agents: [
      chatAgent,
      sharedStateAgent,
      remoteCapabilityAgent,
      journeyDAgent,
      journeyEAgent,
      journeyFAgent,
      journeyGAgent,
      journeyHAgent,
      journeyJAgent,
      journeyKAgent,
      journeyMcpAgent,
    ],
    components: [deterministicModelComponent()],
    projections: [
      { projection: threadHistoryProjection, public: true },
      { projection: sharedStateCanvasProjection, public: true },
      { projection: controlledRenderProjection, public: true },
      { projection: declarativeCatalogProjection, public: true },
      { projection: richThreadProjection, public: true },
      { projection: mcpAppProjection, public: true },
    ],
  });

  const agUiHandler = createAgUiHandler({
    service: runtime.service,
    defaultAgent: JOURNEY_A_AGENT,
    authenticate: (headers): Caller | undefined => {
      const match = /^Bearer ([\w-]+)$/.exec(headers.get("authorization") ?? "");
      return match ? { actor: { id: match[1]!, kind: "user" }, tenant: "tenant-a" } : LOCAL_OPERATOR;
    },
  });

  const connectRouter = createConnectRouter({});
  registerRuntimeService(connectRouter, runtime.service, { authenticate: devTokenAuthenticator, maxJsonDepth: 32 });
  const connectHandlersByPath = new Map<string, (req: Request) => Promise<Response>>();
  for (const uHandler of connectRouter.handlers) {
    connectHandlersByPath.set(uHandler.requestPath, createFetchHandler(uHandler, { httpVersion: "1.1" }));
  }

  const appDir = fileURLToPath(new URL("..", import.meta.url));
  const generatedDir = join(appDir, ".generated");
  await mkdir(generatedDir, { recursive: true });
  const entryPath = join(generatedDir, "entry.tsx");
  await writeFile(entryPath, BROWSER_ENTRY_TEMPLATE({ tenant: LOCAL_OPERATOR.tenant, actorId: LOCAL_OPERATOR.actor.id }));

  const build = await Bun.build({ entrypoints: [entryPath], target: "browser", format: "esm" });
  if (!build.success) {
    throw new Error(`server: failed to bundle UI: ${build.logs.map((log) => String(log)).join("; ")}`);
  }
  const bundleJs = await build.outputs[0]!.text();
  const appCssPath = fileURLToPath(new URL("./ui/tokens.css", import.meta.url));
  const appCss = existsSync(appCssPath) ? await Bun.file(appCssPath).text() : "";

  // Open-ended MCP (gate 13): an isolated deterministic MCP server fixture stands in for the
  // external MCP host the pinned reference cannot reach, and the consume bridge publishes its
  // tools into the runtime's remote-offer set for the operator's caller. Disposal of the server
  // revokes those offers through the bridge.
  const fixture = await startMcpFixtureServer();
  const bridgeClient = createClient({ service: runtime.service, caller: LOCAL_OPERATOR });
  let bridge: McpBridge | undefined;
  try {
    bridge = await connectMcpBridge({ serverUrl: fixture.url, client: bridgeClient, agent: JOURNEY_MCP_AGENT });
  } catch (error) {
    await bridgeClient.close();
    await fixture.close();
    throw error;
  }

  const server = Bun.serve({
    port: options.port,
    hostname: "127.0.0.1",
    idleTimeout: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/health") {
        return Response.json({
          ok: true,
          reconstruction: "copilotkit",
          backend: "cognate-runtime-bun",
          port: options.port,
          endpoints: {
            ui: `http://127.0.0.1:${options.port}/`,
            agUi: `http://127.0.0.1:${options.port}/agui`,
            connect: `http://127.0.0.1:${options.port}/cognate.v1.RuntimeService/`,
          },
        });
      }
      if (url.pathname === "/agui") {
        return agUiHandler(request);
      }
      if (url.pathname.startsWith("/cognate.v1.RuntimeService/")) {
        const handler = connectHandlersByPath.get(url.pathname);
        return handler ? handler(request) : new Response("not found", { status: 404 });
      }
      if (url.pathname === "/app.js") {
        // The bundle is large; compress it and let the browser reuse it across reloads.
        const gzipped = Bun.gzipSync(new TextEncoder().encode(bundleJs));
        return new Response(gzipped, {
          headers: {
            "content-type": "text/javascript; charset=utf-8",
            "content-encoding": "gzip",
            "cache-control": "public, max-age=3600",
          },
        });
      }
      if (url.pathname === "/app.css") {
        return new Response(appCss, {
          headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=3600" },
        });
      }
      if (url.pathname === "/") return new Response(indexHtml(), { headers: { "content-type": "text/html" } });
      return new Response("not found", { status: 404 });
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    runtime,
    async stop() {
      server.stop(true);
      await bridge.dispose();
      await bridgeClient.close();
      await fixture.close();
      await runtime.close();
    },
  };
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3190);
  const home = process.env.COGNATE_HARNESS_HOME ?? join(dirname(fileURLToPath(new URL(".", import.meta.url))), "..", ".data");
  const app = await startServer({ port, home });
  console.log(`[copilot-cognate] Cognate Copilot reconstruction listening on ${app.url}`);
  console.log(`[copilot-cognate] dev auth: Authorization: Bearer ${devToken(LOCAL_OPERATOR)}`);
  console.log(`[copilot-cognate] AG-UI SSE endpoint: ${app.url}/agui`);
}
