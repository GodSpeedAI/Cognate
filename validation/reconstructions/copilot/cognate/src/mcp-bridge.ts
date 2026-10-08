// MCP consume bridge: composes an external MCP server's tools into the runtime's eligible
// remote-offer set, and routes selected invocations back over the MCP protocol (settlement gate 13).
//
// This is the CONSUME direction of the MCP protocol — an agent using somebody else's MCP server —
// built entirely from general primitives (the same pattern packages/mcp uses for EXPOSE):
//
//   MCP `tools/list`          → one lease-bound remote capability offer per tool, published through
//                               CognateClient.offerCapability (the existing offer/lease mechanism:
//                               TTL + renewal, revoke on disposal, durable committed continuations).
//   agent ctx.invokeRemoteOffer → client engine resolves the committed continuation by calling the
//                               bridge handler, which performs MCP `tools/call` on the server.
//   MCP Apps `_meta.ui.resourceUri` in the tool result → MCP `resources/read` fetch of the UI
//                               document, returned to the agent inside the continuation result so
//                               the RUN records it durably (ctx.artifact + ctx.emit) through the
//                               normal run mechanisms.
//
// No new kernel primitive: discovery, invocation commitment, liveness and revocation are the
// runtime's own remote-offer/lease semantics; the bridge is a protocol adapter over them.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { request as httpRequest } from "node:http";
import type { CognateClient, FrontendHandler } from "@godspeedai/client";
import type { Json } from "@godspeedai/events";

/** The UI resource reference an MCP Apps tool result advertises. */
export interface McpUiResourceRef {
  readonly uri: string;
  readonly mimeType: string;
  readonly html: string;
}

/** The remote-capability contract id a bridged MCP tool is offered under. */
export function mcpToolContract(toolName: string): string {
  return `mcp.${toolName}`;
}

export interface McpBridgeOptions {
  /** Streamable HTTP endpoint of the MCP server to consume, e.g. http://127.0.0.1:54321/mcp. */
  readonly serverUrl: string;
  /** Client used to publish offers; its caller must be the one the target agent runs for. */
  readonly client: CognateClient;
  /** Agent id the bridged tools are offered to. */
  readonly agent: string;
  /** Offer TTL in ms; renewal before expiry keeps the lease a bounded liveness claim. */
  readonly ttlMs?: number;
}

export interface McpBridge {
  /** Bridged MCP tool names, in listing order. */
  readonly tools: readonly string[];
  /** Remote-capability contract ids the bridge published, aligned with {@link tools}. */
  readonly contracts: readonly string[];
  /** Revokes every published offer (lease disposal) and closes the MCP client connection. */
  dispose(): Promise<void>;
}

interface ToolTextResult {
  readonly structured: { readonly [key: string]: unknown } | undefined;
  readonly resourceUri: string | undefined;
}

function toolText(result: { readonly content?: unknown; readonly structuredContent?: unknown; readonly _meta?: unknown }): ToolTextResult {
  const structured = typeof result.structuredContent === "object" && result.structuredContent !== null
    ? (result.structuredContent as { readonly [key: string]: unknown })
    : undefined;
  // MCP Apps: the tool result advertises its UI resource under `_meta.ui.resourceUri`; fall back to
  // a structured field of the same name for servers that fold the reference into the payload.
  const meta = typeof result._meta === "object" && result._meta !== null ? (result._meta as { readonly ui?: { readonly resourceUri?: unknown } }) : undefined;
  const fromMeta = typeof meta?.ui?.resourceUri === "string" ? meta.ui.resourceUri : undefined;
  const fromStructured = typeof structured?.resourceUri === "string" ? structured.resourceUri : undefined;
  return { structured, resourceUri: fromMeta ?? fromStructured };
}

async function readUiResource(mcp: Client, uri: string): Promise<McpUiResourceRef | undefined> {
  const resource = await mcp.readResource({ uri });
  const content = resource.contents.find((entry): entry is Extract<(typeof resource)["contents"][number], { readonly text: string }> => "text" in entry && typeof entry.text === "string");
  if (!content) return undefined;
  return { uri: content.uri, mimeType: content.mimeType ?? "text/html", html: content.text };
}

/**
 * The bridge speaks HTTP directly over `node:http` and carries no ambient abort signal. Test hosts
 * register a DOM `fetch` on the process globals, and under such a registration `Bun.fetch` fails
 * after a successful wire exchange (it validates its result against the replaced global Response);
 * a DOM-registered `fetch` in turn fabricates empty responses for the MCP endpoint. Both paths are
 * unusable, so the transport goes one layer down: a bounded request/response exchange whose result
 * is a Response of the caller's global class — the SDK duck-types it (status, headers.get, json).
 * In-flight request cancellation is therefore not propagated into the HTTP layer — sound for this
 * adapter because every MCP exchange is a bounded request/response, and the disposal semantics
 * that matter (offer revocation; durable committed continuations) never ride on it.
 */
const NATIVE_FETCH: FetchLike = (url, init) => {
  const { signal: _ambient, method, headers, body } = init ?? {};
  const target = new URL(url instanceof URL ? url.href : String(url));
  const headerRecord: Record<string, string> = {};
  if (headers && typeof (headers as Headers).forEach === "function") {
    (headers as Headers).forEach((value, name) => {
      headerRecord[name] = value;
    });
  } else if (headers) {
    Object.assign(headerRecord, headers as Record<string, string>);
  }
  return new Promise<Response>((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: method ?? "GET",
        headers: headerRecord,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (value != null) responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : String(value));
          }
          resolve(new Response(text === "" ? null : text, { status: response.statusCode ?? 200, headers: responseHeaders }));
        });
      },
    );
    request.on("error", reject);
    if (typeof body === "string") request.write(body);
    else if (body != null) request.write(String(body));
    request.end();
  });
};

/**
 * Connects to an MCP server and publishes every listed tool as a remote capability offer for
 * `agent`. The returned bridge owns the offers: disposing it revokes them, after which the tools
 * are no longer eligible for new agent invocations (committed continuations stay durable).
 */
export async function connectMcpBridge(options: McpBridgeOptions): Promise<McpBridge> {
  const transport = new StreamableHTTPClientTransport(new URL(options.serverUrl), { fetch: NATIVE_FETCH });
  const mcp = new Client({ name: "cognate-mcp-bridge", version: "0.0.0" });
  await mcp.connect(transport);

  const listed = await mcp.listTools();
  const tools: string[] = [];
  const contracts: string[] = [];
  const revokes: (() => Promise<void>)[] = [];

  for (const tool of listed.tools) {
    const contract = mcpToolContract(tool.name);
    // The offer handler is the tool's other half: it runs when the agent's committed
    // `invokeRemoteOffer` continuation is scanned by this client, calls the MCP server, resolves
    // the tool's UI resource, and returns the durable result the run records.
    const handler: FrontendHandler = async (input) => {
      const result = await mcp.callTool({ name: tool.name, arguments: (input ?? {}) as { [key: string]: unknown } });
      if (result.isError) {
        const first = Array.isArray(result.content) ? result.content.find((part) => part.type === "text") : undefined;
        const text = first && "text" in first ? first.text : "MCP tool failed";
        throw new Error(`MCP tool ${tool.name} failed: ${text}`);
      }
      const { structured, resourceUri } = toolText(result);
      const ui = resourceUri ? await readUiResource(mcp, resourceUri) : undefined;
      // Structured content is JSON by protocol definition; the copy makes the Json typing honest.
      const structuredJson = structured === undefined ? undefined : (JSON.parse(JSON.stringify(structured)) as Json);
      const payload: { [key: string]: Json } = { tool: tool.name };
      if (typeof structured?.viewId === "string") payload.viewId = structured.viewId;
      if (structuredJson !== undefined) payload.structured = structuredJson;
      if (ui !== undefined) payload.ui = { uri: ui.uri, mimeType: ui.mimeType, html: ui.html };
      return payload;
    };
    const revoke = await options.client.offerCapability(
      {
        leaseId: crypto.randomUUID(),
        agent: options.agent,
        contract: { id: contract, version: "1.0.0" },
        description: tool.description ?? `MCP tool ${tool.name}`,
        inputSchema: (tool.inputSchema ?? { type: "object" }) as Json,
        ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema as Json }),
        ttlMs: options.ttlMs ?? 30_000,
      },
      handler,
    );
    tools.push(tool.name);
    contracts.push(contract);
    revokes.push(revoke);
  }

  return {
    tools,
    contracts,
    async dispose() {
      for (const revoke of revokes) await revoke();
      await mcp.close();
    },
  };
}
