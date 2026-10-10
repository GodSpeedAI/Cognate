// Serves RuntimeService on Bun.serve with authentication, payload limits, and a default deadline
// (spec §32). HTTP/1.1 only: unary + server streaming (DEBT-004).
import { createConnectRouter } from "@connectrpc/connect";
import type { ConnectRouter, ConnectRouterOptions, Transport } from "@connectrpc/connect";
import { createFetchHandler } from "@connectrpc/connect/protocol";
import { createConnectTransport } from "@connectrpc/connect-web";
import { registerRuntimeService } from "@godspeedai/cognate-protocol-connect";
import type { Caller, RuntimeService } from "@godspeedai/cognate-runtime-api";

export interface ServeOptions {
  readonly service: RuntimeService;
  readonly authenticate: (headers: Headers) => Caller | undefined | Promise<Caller | undefined>;
  readonly port?: number;
  readonly hostname?: string;
  readonly limits?: {
    /** Reject request bodies larger than this (default 1 MiB) with resource_exhausted. */
    readonly maxBodyBytes?: number;
    /** Reject JSON values nested deeper than this (default 32) with invalid_argument. */
    readonly maxJsonDepth?: number;
    /** Server-side deadline applied to unary calls without a shorter client deadline (default 30 s). */
    readonly defaultDeadlineMs?: number;
  };
}

export interface RuntimeServer {
  readonly url: string;
  stop(): Promise<void>;
}

const CONNECT_TIMEOUT_HEADER = "Connect-Timeout-Ms";

function connectErrorResponse(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ code, message }), { status, headers: { "content-type": "application/json" } });
}

// Modeled on @connectrpc/connect-node's connectNodeAdapter: there is no first-party Bun adapter, so
// we index a ConnectRouter's UniversalHandlers by requestPath and bridge each to the Fetch API via
// the ready-made universal-handler↔fetch bridge (compatibility/phase0/connect/API_NOTES.md).
function createConnectFetchHandler(options: { routes: (router: ConnectRouter) => void } & ConnectRouterOptions): (req: Request) => Promise<Response> {
  const router = createConnectRouter(options);
  options.routes(router);
  const handlersByPath = new Map<string, (req: Request) => Promise<Response>>();
  for (const uHandler of router.handlers) {
    handlersByPath.set(uHandler.requestPath, createFetchHandler(uHandler, { httpVersion: "1.1" }));
  }
  return async (req: Request) => {
    const handler = handlersByPath.get(new URL(req.url).pathname);
    return handler ? handler(req) : new Response("not found", { status: 404 });
  };
}

/** Serve RuntimeService over the Connect protocol (HTTP/1.1: unary + server streaming; DEBT-004). */
export function serveRuntime(options: ServeOptions): RuntimeServer {
  const maxBodyBytes = options.limits?.maxBodyBytes ?? 1_048_576;
  const maxJsonDepth = options.limits?.maxJsonDepth ?? 32;
  const defaultDeadlineMs = options.limits?.defaultDeadlineMs ?? 30_000;

  const connectFetch = createConnectFetchHandler({
    routes(router) {
      registerRuntimeService(router, options.service, { authenticate: options.authenticate, maxJsonDepth });
    },
  });

  const server = Bun.serve({
    port: options.port ?? 0,
    hostname: options.hostname,
    async fetch(req) {
      const contentLength = req.headers.get("content-length");
      if (contentLength !== null) {
        const declared = Number(contentLength);
        if (Number.isFinite(declared) && declared > maxBodyBytes) {
          return connectErrorResponse("resource_exhausted", `request body exceeds maximum size of ${maxBodyBytes} bytes`, 429);
        }
      }

      let request = req;
      if (!request.headers.has(CONNECT_TIMEOUT_HEADER)) {
        const headers = new Headers(request.headers);
        headers.set(CONNECT_TIMEOUT_HEADER, String(defaultDeadlineMs));
        request = new Request(request.url, { method: request.method, headers, body: request.body ?? undefined, duplex: request.body ? "half" : undefined } as RequestInit);
      }

      return connectFetch(request);
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    async stop() {
      await server.stop(true);
    },
  };
}

/** A fetch-based Connect transport usable from Bun and browsers.
 *
 * Bun's fetch caches repeated identical unary POST responses (observed on Bun 1.4.0: a client
 * re-reading a projection kept receiving its first response until the cache entry was bypassed;
 * recorded as DEBT-027), so this helper defaults to `cache: "no-store"` — a Bun runtime has no HTTP
 * cache to benefit from anyway. Pass `fetch` explicitly to override. */
export function connectTransport(baseUrl: string, options?: { readonly useBinaryFormat?: boolean }): Transport {
  const fetchNoCache = ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" })) as typeof globalThis.fetch;
  return createConnectTransport({ baseUrl, useBinaryFormat: options?.useBinaryFormat ?? false, fetch: fetchNoCache });
}

/** Test/dev authenticator: `Bearer <tenant>:<principalId>`. Not for production use. */
export function devTokenAuthenticator(headers: Headers): Caller | undefined {
  const match = /^Bearer ([^:\s]+):([^:\s]+)$/.exec(headers.get("authorization") ?? "");
  return match ? { tenant: match[1]!, actor: { id: match[2]!, kind: "user" } } : undefined;
}

export const devToken = (caller: Caller): string => `${caller.tenant}:${caller.actor.id}`;
