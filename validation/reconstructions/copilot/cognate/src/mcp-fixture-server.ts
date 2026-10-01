// Deterministic local MCP server fixture for the open-ended Generative UI leg (settlement gate 13).
//
// The pinned reference surface mounts an MCP App only after the agent calls a real MCP tool that
// returns a UI resource, and the pinned MCP middleware resolves that resource against an external
// server (https://mcp.excalidraw.com) that must never be contacted here
// (showcase/harness/src/probes/scripts/d5-mcp-apps.ts, pinned at the manifest commit). This module
// is the isolated stand-in: a real MCP server (official SDK, Streamable HTTP transport, ephemeral
// loopback port) exposing the same shape of behavior — a `create_view` tool whose result advertises
// a UI resource via `_meta.ui.resourceUri`, and a `text/html` resource that renders the created view
// and posts exactly one interaction result back to its host.
//
// Determinism: the tool and resource callbacks are pure functions of their inputs plus one
// module-scoped "last created view" (the fixture serves one client at a time, sequentially). No
// timers, no randomness, no external fetches inside the document.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";

/** The MCP tool the fixture exposes; the reference surface's demo tool has the same name. */
export const MCP_FIXTURE_TOOL = "create_view";
/** The UI resource the tool result advertises (MCP Apps `_meta.ui.resourceUri` semantic). */
export const MCP_FIXTURE_RESOURCE_URI = "ui://fixture/create-view";
export const MCP_FIXTURE_SERVER_NAME = "cognate-mcp-fixture";
/** Streamable HTTP endpoint path served by the fixture. */
export const MCP_FIXTURE_ENDPOINT = "/mcp";
/** `source` value the sandboxed document stamps on its postMessage payload. */
export const MCP_FIXTURE_APP_SOURCE = "mcp-fixture-app";
/** `type` value of the interaction result the sandboxed document posts to its host. */
export const MCP_FIXTURE_RESULT_TYPE = "mcp-app-result";

export interface FixtureRow {
  readonly label: string;
  readonly value: string;
}

export interface FixtureView {
  readonly title: string;
  readonly rows: readonly FixtureRow[];
}

export interface FixtureViewStructured {
  readonly viewId: string;
  readonly title: string;
  readonly rows: readonly FixtureRow[];
  readonly resourceUri: string;
}

/** FNV-1a over the view content, so the same invocation always yields the same view id. */
export function fixtureViewId(view: FixtureView): string {
  const text = JSON.stringify([view.title, view.rows]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `view-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function fixtureViewStructured(view: FixtureView): FixtureViewStructured {
  return { viewId: fixtureViewId(view), title: view.title, rows: view.rows, resourceUri: MCP_FIXTURE_RESOURCE_URI };
}

/**
 * The UI resource document: self-contained HTML that renders the structured content and exposes
 * exactly one interactive control. The control postMessages a deterministic result to the host
 * (`window.parent`), which is the whole interface a sandboxed frame needs — so the host can keep
 * the frame on an opaque origin (see McpOpenEndedSurface for the sandbox decision).
 */
export function fixtureViewDocument(view: FixtureView): string {
  const structured = fixtureViewStructured(view);
  // JSON embedded as data, never as markup: `<` is escaped so the payload cannot break out of the
  // data block or inject elements into the sandboxed document.
  const payload = JSON.stringify({ viewId: structured.viewId, title: structured.title, rows: structured.rows }).replace(/</g, "\\u003c");
  const items = view.rows
    .map((row) => `      <li><span class="label">${escapeHtml(row.label)}</span><span class="value">${escapeHtml(row.value)}</span></li>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(structured.title)}</title>
<style>
  body { font: 13px/1.5 sans-serif; margin: 0; padding: 12px; color: #1c1c1c; }
  h1 { font-size: 15px; margin: 0 0 8px; }
  ul { list-style: none; margin: 0 0 12px; padding: 0; }
  li { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px solid #e4e4e4; }
  .label { color: #555; }
  .value { font-weight: 600; }
  #approve-view { font: inherit; padding: 6px 14px; border-radius: 6px; border: 1px solid #2f6f4f; background: #2f6f4f; color: #fff; cursor: pointer; }
</style>
</head>
<body data-view-id="${escapeHtml(structured.viewId)}">
  <h1>${escapeHtml(structured.title)}</h1>
  <ul id="view-rows">
${items}
  </ul>
  <button id="approve-view" type="button">Approve view</button>
  <script type="application/json" id="view-data">${payload}</script>
  <script>
    (function () {
      var data = JSON.parse(document.getElementById("view-data").textContent);
      document.getElementById("approve-view").addEventListener("click", function () {
        parent.postMessage({
          source: ${JSON.stringify(MCP_FIXTURE_APP_SOURCE)},
          type: ${JSON.stringify(MCP_FIXTURE_RESULT_TYPE)},
          viewId: data.viewId,
          result: { action: "approve-view", title: data.title, rows: data.rows.length }
        }, "*");
      });
    })();
  </script>
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The fixture serves one deterministic conversation at a time: the created view is the one the
// resource read returns. Sequential tool-then-read use (what the bridge does) is always consistent.
let currentView: FixtureView | undefined;

/** Records the view a tool invocation created; the resource read renders this view. */
export function recordCreatedView(view: FixtureView): FixtureViewStructured {
  currentView = view;
  return fixtureViewStructured(view);
}

export function lastCreatedView(): FixtureView | undefined {
  return currentView;
}

/** A fresh SDK MCP server with the fixture's tool and UI resource registered. */
export function createFixtureMcpServer(): McpServer {
  const server = new McpServer({ name: MCP_FIXTURE_SERVER_NAME, version: "1.0.0" });
  server.registerTool(
    MCP_FIXTURE_TOOL,
    {
      description: "Create a deterministic view and return the UI resource that renders it",
      inputSchema: {
        title: z.string(),
        rows: z.array(z.object({ label: z.string(), value: z.string() })),
      },
    },
    async ({ title, rows }) => {
      const structured = recordCreatedView({ title, rows });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(structured) }],
        structuredContent: structured as unknown as { [key: string]: unknown },
        _meta: { ui: { resourceUri: MCP_FIXTURE_RESOURCE_URI } },
      };
    },
  );
  server.registerResource(
    "create-view-app",
    MCP_FIXTURE_RESOURCE_URI,
    { description: "Sandboxed interactive document rendering the created view", mimeType: "text/html" },
    async () => {
      const view = currentView;
      if (!view) throw new Error(`no view has been created yet; invoke ${MCP_FIXTURE_TOOL} first`);
      return { contents: [{ uri: MCP_FIXTURE_RESOURCE_URI, mimeType: "text/html", text: fixtureViewDocument(view) }] };
    },
  );
  return server;
}

export interface McpFixtureServer {
  /** Streamable HTTP endpoint URL, e.g. http://127.0.0.1:54321/mcp. */
  readonly url: string;
  close(): Promise<void>;
}

/**
 * Serves the fixture over Streamable HTTP on an ephemeral loopback port. Stateless mode (no
 * session ids): the SDK requires a fresh transport + server per request, which is exactly what a
 * deterministic fixture wants — every request is answered from the same registrations.
 *
 * The server is raw `node:http`, not `Bun.serve`, and every exchange is buffered text. Test hosts
 * register a DOM globals set (happy-dom), after which the SDK's server transport builds its
 * replies from the DOM Response class and `Bun.serve` rejects them ("Expected a Response object").
 * A node handler only reads status/headers/text off that reply and writes them itself, so the
 * fixture works identically under pristine or DOM-replaced globals.
 */
export async function startMcpFixtureServer(): Promise<McpFixtureServer> {
  const server = createHttpServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const send = (status: number, body: string | null, contentType?: string, allow?: string) => {
      const headers: Record<string, string> = {};
      if (contentType) headers["content-type"] = contentType;
      if (allow) headers.allow = allow;
      if (body != null) headers["content-length"] = String(Buffer.byteLength(body));
      response.writeHead(status, headers);
      response.end(body ?? undefined);
    };
    if (url.pathname !== MCP_FIXTURE_ENDPOINT) return send(404, "not found", "text/plain");
    if (request.method !== "POST" && request.method !== "DELETE") {
      // The fixture offers no standalone GET SSE stream; 405 is the spec-expected answer and the
      // official client treats it as "server does not offer an SSE stream" rather than an error.
      return send(405, null, undefined, "POST, DELETE");
    }
    // enableJsonResponse: every tool/resource exchange is one plain JSON request/response —
    // no SSE layer, which keeps the fixture byte-deterministic for any conforming client.
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString("utf8");
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await createFixtureMcpServer().connect(transport);
    const inbound = new Request(`http://localhost${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers as unknown as HeadersInit,
      ...(request.method === "POST" ? { body } : {}),
    });
    const upstream = await transport.handleRequest(inbound);
    const text = await upstream.text();
    send(upstream.status, text === "" ? null : text, upstream.headers.get("content-type") ?? "application/json");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fixture server did not bind an ephemeral port");
  return {
    url: `http://127.0.0.1:${address.port}${MCP_FIXTURE_ENDPOINT}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
