// CG-WIR-003 (in-process half): the runtime passes the transport-independent service kit on SQLite and memory.
import { runtimeServiceConformance } from "@godspeedai/cognate-runtime-api/conformance";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntime } from "../src/index.ts";
import { kitPolicies } from "./support.ts";

runtimeServiceConformance(
  "runtime-bun on SQLite file",
  async (setup) => {
    const dir = mkdtempSync(join(tmpdir(), "cognate-runtime-"));
    const path = join(dir, "app.sqlite");
    const make = () => createRuntime({ store: path, agents: setup.agents, ...kitPolicies(setup) });
    let runtime = await make();
    return {
      get service() {
        return runtime.service;
      },
      async restart() {
        await runtime.close();
        runtime = await make();
        return runtime.service;
      },
      async close() {
        await runtime.close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  },
  { persistent: true },
);

runtimeServiceConformance(
  "runtime-bun on in-memory SQLite",
  async (setup) => {
    const runtime = await createRuntime({ store: ":memory:", agents: setup.agents, ...kitPolicies(setup) });
    return { service: runtime.service, close: () => runtime.close() };
  },
  { persistent: false },
);
