// Example: connect — the same RuntimeService kit served and consumed over Connect RPC.
// Docs: docs/protocols.md (ADR-0003; spec §22: transport-independent RuntimeService over Connect).
import type { AgentDefinition } from "@godspeedai/runtime-api";
import { createRuntime } from "@godspeedai/runtime-bun";
import { connectTransport, devToken, devTokenAuthenticator, serveRuntime } from "@godspeedai/protocol-connect-bun";
import { createRemoteRuntimeService } from "@godspeedai/protocol-connect";

const echoAgent: AgentDefinition = {
  id: "agent.echo",
  version: "1.0.0",
  async run(input) {
    return { echoed: input };
  },
};

async function main() {
  const runtime = await createRuntime({
    store: ":memory:",
    policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: [echoAgent],
  });
  const server = serveRuntime({ service: runtime.service, authenticate: devTokenAuthenticator, port: 0 });
  try {
    // A client that only holds a transport and a token function -- no in-process access to `runtime`.
    const remote = createRemoteRuntimeService(connectTransport(server.url), devToken);
    const alice = { actor: { id: "alice", kind: "user" as const }, tenant: "tenant-a" };

    const started = await remote.startRun(alice, { agent: "agent.echo", input: { hello: "world" }, idempotencyKey: "connect-example" });
    const done = await waitUntil(() => remote.getRun(alice, { runId: started.runId }), (r) => r.status !== "running");
    if (done.status !== "completed") throw new Error(`run did not complete over Connect: ${JSON.stringify(done)}`);
    if (JSON.stringify(done.output) !== JSON.stringify({ echoed: { hello: "world" } })) throw new Error(`unexpected output: ${JSON.stringify(done.output)}`);

    console.log(`ok: run ${done.runId} started and completed over Connect RPC (${server.url}) with output ${JSON.stringify(done.output)}`);
  } finally {
    await server.stop();
    await runtime.close();
  }
}

async function waitUntil<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await read();
    if (ok(value)) return value;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for condition, last value: ${JSON.stringify(value)}`);
    await Bun.sleep(10);
  }
}

await main();
