import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Code, ConnectError } from "@connectrpc/connect";
import { createFixtureClient } from "./src/client.js";
import { createFixtureFetchHandler, serverStreamCancellation } from "./src/server.js";

// Real server on an ephemeral port. `port: 0` asks Bun to pick a free port;
// `server.port` reports what was actually bound.
let server: ReturnType<typeof Bun.serve>;
let boundPort: number;
let baseUrl: string;

beforeAll(() => {
  server = Bun.serve({ port: 0, fetch: createFixtureFetchHandler() });
  boundPort = server.port as number;
  baseUrl = `http://localhost:${boundPort}`;
});

afterAll(() => {
  server.stop(true);
});

describe("unary", () => {
  test("echoes the request message (JSON content type)", async () => {
    const client = createFixtureClient({ baseUrl, useBinaryFormat: false });
    const res = await client.unary({ message: "hello" });
    expect(res.message).toBe("hello");
  });

  test("echoes the request message (binary/proto content type)", async () => {
    const client = createFixtureClient({ baseUrl, useBinaryFormat: true });
    const res = await client.unary({ message: "hello-binary" });
    expect(res.message).toBe("hello-binary");
  });
});

describe("server streaming", () => {
  test("delivers an ordered multi-message stream", async () => {
    const client = createFixtureClient({ baseUrl });
    const seen: number[] = [];
    for await (const msg of client.serverStream({ message: "tick", count: 5 })) {
      seen.push(msg.sequence);
      expect(msg.message).toBe("tick");
    }
    expect(seen).toEqual([0, 1, 2, 3, 4]);
  });

  test("AbortSignal cancellation mid-stream is observed by the handler", async () => {
    serverStreamCancellation.reset();
    const client = createFixtureClient({ baseUrl });
    const controller = new AbortController();
    const received: number[] = [];

    const iterate = async () => {
      try {
        for await (const msg of client.serverStream(
          { message: "tick", count: 50 },
          { signal: controller.signal },
        )) {
          received.push(msg.sequence);
          if (received.length === 2) {
            controller.abort();
          }
        }
      } catch {
        // Aborting mid-stream is expected to surface as a client-side error;
        // what this test verifies is server-side cancellation observation.
      }
    };

    await iterate();
    // The handler polls context.signal.aborted between 20ms-spaced messages;
    // give it a couple of ticks to notice before asserting.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received.length).toBeLessThan(50);
    expect(serverStreamCancellation.observedByHandler).toBe(true);
  });
});

describe("client streaming", () => {
  test("observed: fetch-based transport rejects streaming request bodies over HTTP/1.1", async () => {
    // @connectrpc/connect-web's createConnectTransport is fetch()-based.
    // node_modules/@connectrpc/connect-web/dist/esm/connect-transport.js:146-147
    // throws synchronously for any non-server-streaming stream() call:
    //   "The fetch API does not support streaming request bodies"
    // This is the Connect spec's documented limitation of the fetch-based
    // transport, not a bug in this fixture. We assert the failure instead of
    // working around it, per the no-fake-pass constraint.
    const client = createFixtureClient({ baseUrl });
    async function* oneMessage() {
      yield { message: "only-message" };
    }
    let observedError: ConnectError | undefined;
    try {
      await client.clientStream(oneMessage());
      throw new Error("expected clientStream() to fail over the fetch transport");
    } catch (err) {
      observedError = ConnectError.from(err);
    }
    // promise-client wraps the transport's synchronous throw (a bare string,
    // not an Error) into a ConnectError with Code.Unknown; the original
    // string survives as `.rawMessage` / `.cause`.
    expect(observedError).toBeDefined();
    expect(observedError?.code).toBe(Code.Unknown);
    expect(observedError?.rawMessage).toBe("The fetch API does not support streaming request bodies");
  });
});

describe("error and deadline mapping", () => {
  test("thrown ConnectError(Code.PermissionDenied) maps to the client", async () => {
    const client = createFixtureClient({ baseUrl });
    let observed: ConnectError | undefined;
    try {
      await client.unary({ message: "__permission_denied__" });
    } catch (err) {
      observed = ConnectError.from(err);
    }
    expect(observed).toBeDefined();
    expect(observed?.code).toBe(Code.PermissionDenied);
  });

  test("a client timeout shorter than the handler's work yields Code.DeadlineExceeded", async () => {
    const client = createFixtureClient({ baseUrl, defaultTimeoutMs: 50 });
    let observed: ConnectError | undefined;
    try {
      await client.unary({ message: "__slow__" });
    } catch (err) {
      observed = ConnectError.from(err);
    }
    expect(observed).toBeDefined();
    expect(observed?.code).toBe(Code.DeadlineExceeded);
  });
});

describe("server restart", () => {
  test("a new call succeeds after the server restarts on the same port", async () => {
    server.stop(true);
    server = Bun.serve({ port: boundPort, fetch: createFixtureFetchHandler() });
    expect(server.port).toBe(boundPort);

    const client = createFixtureClient({ baseUrl });
    const res = await client.unary({ message: "post-restart" });
    expect(res.message).toBe("post-restart");
  });
});

// Bidirectional streaming: characterized, never claimed. EchoService (this
// fixture's proto) intentionally defines no bidi RPC. The Connect protocol
// requires HTTP/2 for bidi streaming (https://connectrpc.com/docs/protocol/),
// and Bun.serve() in this fixture serves plain HTTP/1.1 with no h2c/TLS
// negotiation attempted. No test below exercises or claims bidi support; see
// API_NOTES.md's mode matrix for the recorded "not attempted" status.
