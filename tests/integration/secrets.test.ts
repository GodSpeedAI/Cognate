// CG-SEC-002 (spec §32): provider credentials never reach events, artifacts, traces, or cognitive entries.
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryIndex, hashingEmbedder } from "@godspeedai/cognate-cognitive-memory";
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";

const SECRET = "sk-live-7f3a9c1e5b2d4f60aa11";
const dir = mkdtempSync(join(tmpdir(), "cognate-secret-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("a provider holding a credential leaves no secret bytes in the database or cognitive index", async () => {
  const index = createMemoryIndex({ dimension: 64 });
  const agent: AgentDefinition = { id: "agent.model", version: "1.0.0", run: async (input, ctx) => ({ answer: await ctx.invoke("model.generate", input) }) };
  const runtime = await createRuntime({
    store: join(dir, "app.sqlite"),
    policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: [agent],
    cognition: { index, embedder: hashingEmbedder(64), persistent: false },
    components: [
      {
        id: "model-provider",
        provides: [{ id: "model.generate", version: "1.0.0" }],
        activate(fiber) {
          const credentials = { apiKey: SECRET }; // held by the provider, never passed to the runtime
          fiber.provide({ id: "model.generate", version: "1.0.0" }, (input) => ({ text: `answer to ${(input as { q: string }).q}`, authorized: credentials.apiKey.length > 0 }));
        },
      },
    ],
  });
  const { runId } = await runtime.service.startRun(alice, { agent: "agent.model", input: { q: "hello" }, idempotencyKey: "m1" });
  await runtime.idle();
  expect((await runtime.service.getRun(alice, { runId })).status).toBe("completed");
  await runtime.close();
  for (const file of readdirSync(dir)) expect(readFileSync(join(dir, file)).includes(SECRET)).toBe(false);
  const hits = await index.similar({ vector: (await hashingEmbedder(64).embed(["hello"]))[0]!, k: 10, tenant: "tenant-a" });
  for (const hit of hits) expect(JSON.stringify(await index.get(hit.id))).not.toContain(SECRET);
});
