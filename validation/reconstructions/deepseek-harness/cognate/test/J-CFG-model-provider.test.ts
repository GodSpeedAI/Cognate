// Journey J-CFG-model-provider: save a model config -> provider mounted -> hot-swap to a new base
// URL without restart; the secret never appears in any event, payload, or projection.
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { bootApp, bootMockModel, withTempHome } from "./helpers.ts";

describe("J-CFG-model-provider", () => {
  test("save config -> provider mounted -> hot-swap -> secret never recorded", async () => {
    await withTempHome(async (home) => {
      const mockA = await bootMockModel();
      const mockB = await bootMockModel();
      const { app, client } = await bootApp(home);
      try {
        const secretValue = "sk-super-secret-value-should-never-be-recorded";
        await client.invoke("model.configure", {
          providerId: "mock",
          baseURL: `http://127.0.0.1:${mockA.port}/v1`,
          protocol: "openai-compatible",
          model: "mock-model-1",
          apiKey: secretValue,
        });

        const responseA = (await client.invoke("model.generate", { messages: [{ role: "user", content: "hello" }] })) as {
          readonly message: { readonly content: string };
        };
        expect(responseA.message.content).toContain("Summary");

        // Hot-swap: new base URL, no restart.
        await client.invoke("model.configure", {
          providerId: "mock",
          baseURL: `http://127.0.0.1:${mockB.port}/v1`,
          protocol: "openai-compatible",
          model: "mock-model-1",
          apiKey: secretValue,
        });
        const responseB = (await client.invoke("model.generate", { messages: [{ role: "user", content: "hello again" }] })) as {
          readonly message: { readonly content: string };
        };
        expect(responseB.message.content).toContain("Summary");

        await app.runtime.idle();

        const configRows = await app.runtime.service.readProjection({ actor: { id: "operator", kind: "user" }, tenant: "local" }, { name: "model-config" });
        const current = configRows.find((r) => r.key === "current")?.value as { readonly baseURL?: string } | undefined;
        expect(current?.baseURL).toBe(`http://127.0.0.1:${mockB.port}/v1`);

        // Scan the durable SQLite store for the secret. It must not appear anywhere.
        const db = new Database(join(home, "app.sqlite"), { readonly: true });
        try {
          const payloadRows = (db.query("SELECT payload FROM payloads").all() as { payload: string }[]).map((r) => r.payload);
          const metadataRows = (db.query("SELECT metadata FROM events WHERE metadata IS NOT NULL").all() as { metadata: string }[]).map((r) => r.metadata);
          const recordRows = (db.query("SELECT value FROM records").all() as { value: string }[]).map((r) => r.value);
          const projectionRows = (db.query("SELECT value FROM projection_state").all() as { value: string }[]).map((r) => r.value);
          for (const text of [...payloadRows, ...metadataRows, ...recordRows, ...projectionRows]) {
            expect(text ?? "").not.toContain(secretValue);
          }
        } finally {
          db.close();
        }
      } finally {
        await app.stop();
        await mockA.stop();
        await mockB.stop();
      }
    });
  });
});
