// CG-WIR-002 (spec §37 Phase 4): a second process observes and controls a runtime through generated protobuf clients.
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { devTokenAuthenticator, serveRuntime } from "@cognate/protocol-connect-bun";
import { kitAgents } from "@cognate/runtime-api/conformance";
import { createRuntime } from "@cognate/runtime-bun";

const dir = mkdtempSync(join(tmpdir(), "cognate-2p-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("a separate Bun process starts a run, streams its events, and resolves its continuation", async () => {
  const runtime = await createRuntime({
    store: join(dir, "app.sqlite"),
    policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: kitAgents({ quotes: 0, lookups: 0 }),
  });
  const server = serveRuntime({ service: runtime.service, authenticate: devTokenAuthenticator, port: 0 });
  const script = join(dir, "client.ts");
  writeFileSync(
    script,
    `import { createClient } from ${JSON.stringify(Bun.resolveSync("@connectrpc/connect", resolve("packages/protocol-connect-bun")))};
     import { createConnectTransport } from ${JSON.stringify(Bun.resolveSync("@connectrpc/connect-web", resolve("packages/protocol-connect-bun")))};
     import { RuntimeService, ContinuationAction, ContinuationStatus, RunStatus } from ${JSON.stringify(resolve("packages/proto/src/index.ts"))};
     const transport = createConnectTransport({ baseUrl: ${JSON.stringify(server.url)}, useBinaryFormat: true });
     const client = createClient(RuntimeService, transport);
     const headers = { authorization: "Bearer tenant-a:alice" };
     const run = await client.startRun({ agent: "agent.approval", input: { amount: 7 }, idempotencyKey: "2p" }, { headers });
     let waiting;
     for (let i = 0; i < 300; i++) { waiting = await client.getRun({ runId: run.runId }, { headers }); if (waiting.status === RunStatus.WAITING) break; await Bun.sleep(10); }
     const { continuations } = await client.listContinuations({ runId: run.runId, status: ContinuationStatus.OPEN }, { headers });
     await client.resolveContinuation({ continuationId: continuations[0].id, action: ContinuationAction.RESUME, input: { approved: true }, idempotencyKey: "ok" }, { headers });
     const seen = [];
     const controller = new AbortController();
     for await (const e of client.streamEvents({ runId: run.runId, follow: true }, { headers, signal: controller.signal })) {
       seen.push(e.eventType);
       if (e.eventType === "run.completed") { controller.abort(); break; }
     }
     console.log(JSON.stringify({ runId: run.runId, seen }));`,
  );
  const proc = Bun.spawn(["bun", script], { stdout: "pipe", stderr: "pipe" });
  const [exit, out, err] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  expect(err.trim()).toBe("");
  expect(exit).toBe(0);
  const { runId, seen } = JSON.parse(out.trim()) as { runId: string; seen: string[] };
  expect(seen).toContain("run.started");
  expect(seen).toContain("run.waiting");
  expect(seen.at(-1)).toBe("run.completed");
  expect((await runtime.service.getRun({ actor: { id: "alice", kind: "user" }, tenant: "tenant-a" }, { runId })).status).toBe("completed");
  await server.stop();
  await runtime.close();
}, 30_000);
