// Client transport usable from Bun: @connectrpc/connect-web's createConnectTransport
// is a plain fetch()-based Transport with no browser-only dependency, so it runs
// unmodified under Bun. It documents support for unary + server-streaming only;
// client-streaming and bidi throw synchronously (see connect-transport.js:146-147,
// "The fetch API does not support streaming request bodies"). That is exercised,
// not worked around, in connect.test.ts.
import { createClient } from "@connectrpc/connect";
import type { Client, Transport } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { EchoService } from "../gen/fixture/v1/echo_pb.js";

export interface FixtureClientOptions {
  baseUrl: string;
  useBinaryFormat?: boolean;
  defaultTimeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export function createFixtureTransport(options: FixtureClientOptions): Transport {
  return createConnectTransport({
    baseUrl: options.baseUrl,
    useBinaryFormat: options.useBinaryFormat ?? false,
    defaultTimeoutMs: options.defaultTimeoutMs,
    fetch: options.fetch,
  });
}

export function createFixtureClient(options: FixtureClientOptions): Client<typeof EchoService> {
  return createClient(EchoService, createFixtureTransport(options));
}
