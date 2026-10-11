// Journey J-CFG-model-provider: save a model config -> provider mounted -> hot-swap to a new base
// URL without restart; the secret never appears in any event, payload, or projection.
import postgres from "postgres";
import { schemaFor, postgresUrl } from "../src/store.ts";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { bootApp, bootAimock, withTempHome } from "./helpers.ts";

describe("J-CFG-model-provider", () => {
  test("save config -> provider mounted -> hot-swap -> secret never recorded", async () => {
    await withTempHome(async (home) => {
      const aimockA = await bootAimock();
      const aimockB = await bootAimock();
      const { app, client } = await bootApp(home);
      try {
        const secretValue = "sk-super-secret-value-should-never-be-recorded";
        await client.invoke("model.configure", {
          providerId: "mock",
          baseURL: `http://127.0.0.1:${aimockA.port}/v1`,
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
          baseURL: `http://127.0.0.1:${aimockB.port}/v1`,
          protocol: "openai-compatible",
          model: "mock-model-1",
          apiKey: secretValue,
        });
        const responseB = (await client.invoke("model.generate", { messages: [{ role: "user", content: "hello again" }] })) as {
          readonly message: { readonly content: string };
        };
        expect(responseB.message.content).toContain("Summary");

        await app.runtime.idle();

        const configRows = (await app.runtime.service.readProjection({ actor: { id: "operator", kind: "user" }, tenant: "local" }, { name: "model-config" })).rows;
        const current = configRows.find((r) => r.key === "current")?.value as { readonly baseURL?: string } | undefined;
        expect(current?.baseURL).toBe(`http://127.0.0.1:${aimockB.port}/v1`);

        // Scan the durable store for the secret. It must not appear anywhere (PostgreSQL: query the
        // app's schema directly — payloads, metadata, records, and derived folds).
        const schema = schemaFor(home);
        const url = postgresUrl();
        const scan = postgres(url, { max: 1, onnotice: () => {} });
        try {
          const t = (name: string) => scan`${scan(schema)}.${scan(name)}`;
          const payloadRows = (await scan`SELECT payload::text AS text FROM ${t("payloads")}`).map((r) => r.text as string);
          const metadataRows = (await scan`SELECT metadata::text AS text FROM ${t("events")} WHERE metadata IS NOT NULL`).map((r) => r.text as string);
          const recordRows = (await scan`SELECT value::text AS text FROM ${t("records")}`).map((r) => r.text as string);
          const projectionRows = (await scan`SELECT value::text AS text FROM ${t("projection_state")}`).map((r) => r.text as string);
          for (const text of [...payloadRows, ...metadataRows, ...recordRows, ...projectionRows]) {
            expect(text ?? "").not.toContain(secretValue);
          }
        } finally {
          await scan.end({ timeout: 1 });
        }
      } finally {
        await app.stop();
        await aimockA.stop();
        await aimockB.stop();
      }
    });
  });
});
