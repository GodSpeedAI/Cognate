// Child process for rlm-recovery.test.ts: runs an RLM invocation on a PostgreSQL schema and is then SIGKILLed by the
// test, so no abort signal, close() or release ever runs (a real crash). Usage:
//   bun rlm-crash-runtime.ts <postgres-url> <schema> <counter-file> <after-invoke|before-invoke>
// after-invoke: provider.invoke is entered (one line appended to the counter file) and never returns.
// before-invoke: the process kills itself after the dispatch intent is durable and just before provider.invoke.
import { appendFileSync } from "node:fs";
import type { Json } from "@godspeedai/cognate-events";
import type { AgentDefinition, InvocationView, ProviderFacts, RlmProvider } from "@godspeedai/cognate-runtime-api";
import { RLM_AGENT_ID, RLM_CAPABILITIES } from "@godspeedai/cognate-runtime-api";
import { openPostgresStore } from "@godspeedai/cognate-store-postgres";
import { createRlmAgent, createRlmComponent, createRlmRegistry, createRuntime, type Runtime } from "../../src/index.ts";

const [url, schema, counterFile, mode] = process.argv.slice(2) as [string, string, string, "after-invoke" | "before-invoke"];
const alice = { tenant: "rlm-recovery", actor: { id: "operator", kind: "user" as const } };
const DIGEST = `sha256:${"a".repeat(64)}`;
const facts: ProviderFacts = {
  capabilities: { maxDepth: 2, contextDecomposition: true, providerInternalSubagents: false, streaming: true, isolation: "process", resultDelivery: "return", cancellation: "process", paymentMetering: "reported" },
  toolPolicy: "contained",
  executable: { version: "1.0.0", sha256: "b".repeat(64) },
};
const provider: RlmProvider = {
  id: "test-provider",
  probe: async () => facts,
  async invoke() {
    appendFileSync(counterFile, "invoke\n");
    console.log("INVOKED");
    await new Promise(() => {}); // hangs until killed
    return { runId: "unreachable" };
  },
  async inspect(): Promise<InvocationView> {
    throw new Error("unreachable in this process");
  },
  async cancel() {},
};
const parent: AgentDefinition = {
  id: "agent.parent",
  version: "1.0.0",
  run: async (_input, ctx): Promise<Json> =>
    (await ctx.invoke(RLM_CAPABILITIES.invoke, {
      invocationId: "inv-crash",
      providerId: "test-provider",
      parent: { runId: ctx.runId, assignmentId: null, attempt: 0, depth: 0, maxDepth: 2, authorityTools: ["read"] },
      task: { purpose: "p", acceptance: [], contextRefs: [], contextDigest: DIGEST },
      authority: { tools: ["read"], mode: "read-only" },
      budget: { currency: "time", limit: "unknown" },
    } as unknown as Json)) as Json,
};

const database = await openPostgresStore({ url, schema, pollMs: 0 });
const registry = createRlmRegistry();
registry.register({ provider, label: "crash" });
let runtime: Runtime | undefined;
// before-invoke: the child's getRun calls are: intent fence (parent), its last look (own run), then the dispatch-step fence (parent); die on the third.
let childChecks = 0;
let armed = false;
const service = () => {
  const real = runtime!.service;
  if (mode !== "before-invoke") return real;
  return new Proxy(real, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      if (prop !== "startRun" && prop !== "getRun") return value.bind(target);
      return async (...args: unknown[]) => {
        if (prop === "startRun" && (args[1] as { agent?: string }).agent === RLM_AGENT_ID) armed = true;
        if (prop === "getRun" && armed && ++childChecks === 3) {
          console.log("INTENT-DURABLE");
          process.kill(process.pid, "SIGKILL");
        }
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
};
runtime = await createRuntime({
  store: { store: database.store },
  agents: [parent, createRlmAgent({ registry, getService: service, getStore: () => runtime!.store })],
  policy: { authorize: () => ({ allow: true as const, policyId: "test", reason: "test" }) },
  actions: { authorize: () => ({ allow: true as const, reason: "test" }) },
  components: [createRlmComponent({ registry, getService: service, getStore: () => runtime!.store })],
  execution: { maxConcurrentRuns: 2, resourceKeys: () => [], runOwnership: { leaseMs: 500 } },
});
const run = await runtime.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "crash-parent" });
console.log(`PARENT ${run.runId}`);
setInterval(() => {}, 1_000);
