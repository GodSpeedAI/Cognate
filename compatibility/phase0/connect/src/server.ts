import { Code, ConnectError } from "@connectrpc/connect";
import type { HandlerContext } from "@connectrpc/connect";
import { EchoService } from "../gen/fixture/v1/echo_pb.js";
import { createConnectFetchHandler } from "./connect-fetch-adapter.js";

/** Set by the server-stream handler each time it observes cancellation, so tests can assert it. */
export const serverStreamCancellation = {
  observedByHandler: false,
  reset(): void {
    this.observedByHandler = false;
  },
};

export function createFixtureFetchHandler() {
  return createConnectFetchHandler({
    httpVersion: "1.1",
    routes(router) {
      router.service(EchoService, {
        async unary(req, context: HandlerContext) {
          if (req.message === "__permission_denied__") {
            throw new ConnectError("permission denied by fixture", Code.PermissionDenied);
          }
          if (req.message === "__slow__") {
            // Deliberately outlast any client-supplied timeoutMs so the
            // deadline test observes Code.DeadlineExceeded rather than a
            // fast, unrelated response.
            await new Promise((resolve, reject) => {
              const t = setTimeout(resolve, 500);
              context.signal.addEventListener("abort", () => {
                clearTimeout(t);
                reject(context.signal.reason);
              });
            });
          }
          return { message: req.message };
        },

        async *serverStream(req, context: HandlerContext) {
          const count = req.count > 0 ? req.count : 1;
          for (let i = 0; i < count; i++) {
            if (context.signal.aborted) {
              serverStreamCancellation.observedByHandler = true;
              return;
            }
            yield { message: req.message, sequence: i };
            // Yield control so an in-flight abort can be observed between messages.
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        },

        async clientStream(reqs) {
          let count = 0;
          let lastMessage = "";
          for await (const req of reqs) {
            count++;
            lastMessage = req.message;
          }
          return { message: lastMessage, count };
        },
      });
    },
  });
}
