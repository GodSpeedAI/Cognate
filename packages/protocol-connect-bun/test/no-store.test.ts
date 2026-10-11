// DEBT-027 mitigation, server side: every response from serveRuntime carries cache-control:
// no-store, so Bun's fetch response cache can never freeze repeated unary POSTs — even for clients
// that build their transport without a no-store fetch override.
import { afterAll, describe, expect, test } from "bun:test";
import { createConnectTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";
import { RuntimeService } from "@godspeedai/cognate-proto";
import type { RuntimeService as RuntimeServiceT } from "@godspeedai/cognate-runtime-api";
import { devTokenAuthenticator, serveRuntime } from "../src/index.ts";

let calls = 0;
const stub = {
  async readProjection(_caller: unknown, _request: { name: string }) {
    calls += 1;
    // A different row set per call: a frozen cached response would repeat the first row count.
    return {
      rows: Array.from({ length: calls }, (_, i) => ({ key: `k${i}`, value: i as unknown as import("@godspeedai/cognate-events").Json })),
      checkpoint: null,
    };
  },
  events() {
    return (async function* () {})();
  },
} as unknown as RuntimeServiceT;

const server = serveRuntime({ service: stub, authenticate: devTokenAuthenticator, port: 0 });
afterAll(async () => {
  await server.stop();
});

describe("DEBT-027: serveRuntime marks responses uncacheable", () => {
  test("every response carries cache-control: no-store", async () => {
    const response = await fetch(`${server.url}/cognate.v1.RuntimeService/ReadProjection`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer tenant-a:alice" },
      body: JSON.stringify({ name: "p" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("an unconfigured transport (default fetch) still sees fresh data on repeat calls", async () => {
    // The exact shape that went stale before the fix: the same unary POST twice through a transport
    // using Bun's default fetch.
    const transport = createConnectTransport({ baseUrl: server.url, useBinaryFormat: true });
    const client = createClient(RuntimeService, transport);
    const read = async (): Promise<number> => {
      const response = await client.readProjection({ name: "p" }, { headers: { authorization: "Bearer tenant-a:alice" } });
      return response.entries.length;
    };
    const first = await read();
    const second = await read();
    expect(second).toBe(first + 1); // a frozen cached response would repeat `first`
  });
});
