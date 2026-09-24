// CG-WIR-003 (spec §22, §40.G): the same service kit passes over Connect as in-process.
import { runtimeServiceConformance } from "@cognate/runtime-api/conformance";
import { connectTransport, devToken, devTokenAuthenticator, serveRuntime } from "@cognate/protocol-connect-bun";
import { createRuntime } from "@cognate/runtime-bun";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { kitPolicies } from "../../runtime-bun/test/support.ts";
import { createRemoteRuntimeService } from "../src/index.ts";

for (const binary of [false, true]) {
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
