// CG-WIR-003 (spec §22, §40.G): the same service kit passes over Connect as in-process.
import { expect, test } from "bun:test";
import { runtimeServiceConformance } from "@godspeedai/runtime-api/conformance";
import { connectTransport, devToken, devTokenAuthenticator, serveRuntime } from "@godspeedai/protocol-connect-bun";
import { createRuntime } from "@godspeedai/runtime-bun";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { kitPolicies } from "../../runtime-bun/test/support.ts";
import { createRemoteRuntimeService } from "../src/index.ts";
import { createClient } from "@godspeedai/client";
import { alice } from "@godspeedai/runtime-api/conformance";

for (const binary of [false, true]) {
  test(`remote capability offer round-trips over Connect (${binary ? "binary" : "JSON"})`, async () => {
    const runtime = await createRuntime({
      store: ":memory:",
      policy: { authorize: () => ({ allow: true, policyId: "test", reason: "test" }) },
      actions: { authorize: () => ({ allow: true, reason: "test" }) },
      agents: [{ id: "agent.remote", version: "1.0.0", async run(_input, ctx) {
        const offers = await ctx.remoteOffers("plan");
        if (offers.length === 0) return { offered: false, result: null };
        return { offered: true, result: await ctx.invokeRemoteOffer("call", offers[0]!.id, { value: 3 }) };
      } }],
    });
    const server = serveRuntime({ service: runtime.service, authenticate: devTokenAuthenticator, port: 0 });
    const service = createRemoteRuntimeService(connectTransport(server.url, { useBinaryFormat: binary }), devToken);
    const client = createClient({ service, caller: alice });
    try {
      const stop = await client.offerCapability({ leaseId: "mounted", agent: "agent.remote", contract: { id: "selection.replace", version: "1.0.0" }, description: "Replace selection", inputSchema: { type: "object" } }, (input) => ({ received: input }));
      expect((await service.listRemoteOffers(alice, { agent: "agent.remote" })).map((offer) => offer.contract.id)).toEqual(["selection.replace"]);
      const { runId } = await client.startRun("agent.remote", {});
      let view = await service.getRun(alice, { runId });
      for (let i = 0; i < 500 && view.status !== "completed"; i++) {
        await Bun.sleep(10);
        view = await service.getRun(alice, { runId });
      }
      expect(view).toMatchObject({ status: "completed", output: { offered: true, result: { received: { value: 3 } } } });
      await stop();
      expect(await service.listRemoteOffers(alice, { agent: "agent.remote" })).toEqual([]);
    } finally {
      await client.close();
      await server.stop();
      await runtime.close();
    }
  });

  runtimeServiceConformance(
    `RuntimeService over Connect (${binary ? "binary" : "JSON"})`,
    async (setup) => {
      const dir = mkdtempSync(join(tmpdir(), "cognate-connect-"));
      const path = join(dir, "app.sqlite");
      const make = async () => {
        const runtime = await createRuntime({ store: path, agents: setup.agents, ...kitPolicies(setup) });
        const server = serveRuntime({ service: runtime.service, authenticate: devTokenAuthenticator, port: 0 });
        return { runtime, server, service: createRemoteRuntimeService(connectTransport(server.url, { useBinaryFormat: binary }), devToken) };
      };
      let current = await make();
      const stop = async () => {
        await current.server.stop();
        await current.runtime.close();
      };
      return {
        get service() {
          return current.service;
        },
        async restart() {
          await stop();
          current = await make();
          return current.service;
        },
        async close() {
          await stop();
          rmSync(dir, { recursive: true, force: true });
        },
      };
    },
    { persistent: true },
  );
}
