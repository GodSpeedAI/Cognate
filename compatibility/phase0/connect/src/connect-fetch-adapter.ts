// Bun.serve() <-> Connect router adapter.
//
// There is no first-party "@connectrpc/connect-bun" package. This adapter is
// modeled directly on @connectrpc/connect-node's connectNodeAdapter
// (node_modules/@connectrpc/connect-node/dist/esm/connect-node-adapter.js):
// build a ConnectRouter, index its UniversalHandlers by requestPath, and for
// each incoming Request dispatch to the matching handler. Node's adapter
// converts Node req/res <-> UniversalServerRequest/Response by hand; Bun's
// server already speaks the Fetch API, so we use the ready-made
// universal-handler <-> fetch bridge exported from
// "@connectrpc/connect/protocol" (createFetchHandler) instead of writing our
// own byte-level conversion.
import type { ConnectRouter, ConnectRouterOptions } from "@connectrpc/connect";
import { createConnectRouter } from "@connectrpc/connect";
import { createFetchHandler } from "@connectrpc/connect/protocol";

export interface ConnectFetchAdapterOptions extends ConnectRouterOptions {
  routes: (router: ConnectRouter) => void;
  /** Reported HTTP version; Bun.serve() without TLS/h2c negotiation serves HTTP/1.1. */
  httpVersion?: string;
}

/**
 * Build a `(req: Request) => Promise<Response>` fetch handler from Connect
 * service registrations, suitable for Bun.serve({ fetch }).
 */
export function createConnectFetchHandler(
  options: ConnectFetchAdapterOptions,
): (req: Request) => Promise<Response> {
  const router = createConnectRouter(options);
  options.routes(router);

  const httpVersion = options.httpVersion ?? "1.1";
  const handlersByPath = new Map<string, (req: Request) => Promise<Response>>();
  for (const uHandler of router.handlers) {
    handlersByPath.set(uHandler.requestPath, createFetchHandler(uHandler, { httpVersion }));
  }

  return async function fetchHandler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const handler = handlersByPath.get(url.pathname);
    if (!handler) {
      return new Response("not found", { status: 404 });
    }
    return handler(req);
  };
}
