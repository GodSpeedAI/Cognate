// Single Bun process: runtime + Connect RuntimeService + bundled React UI + CSS.
// See APP/README.md for why this is a hand-composed `createRuntime` rather than `createHarness`.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allowCapabilities, rulePolicy } from "@cognate/kernel-api";
import type { Policy } from "@cognate/kernel-api";
import type { RuntimeService } from "@cognate/runtime-api";
import { createRuntime } from "@cognate/runtime-bun";
import type { ActionPolicy, Runtime } from "@cognate/runtime-bun";
import { devToken, devTokenAuthenticator } from "@cognate/protocol-connect-bun";
import { registerRuntimeService } from "@cognate/protocol-connect";
import { createConnectRouter } from "@connectrpc/connect";
import { createFetchHandler } from "@connectrpc/connect/protocol";
import { stylesheetPaths } from "@cognate/ui-astryx/styles";

import { bindTranche5, bindTranche7, bindTranche9, bindTranche10, loadDomain } from "../domain/index.ts";
import { agentConfigAgent } from "./agents/agentConfig.ts";
import { agentCodingAgent } from "./agents/agentCoding.ts";
import { secretPutComponent } from "./capabilities/secretPut.ts";
import { sessionHistoryComponent } from "./capabilities/sessionHistory.ts";
import { modelConfigureComponent } from "./capabilities/modelConfigure.ts";
import { workspaceSelectComponent } from "./capabilities/workspaceSelect.ts";
import { workspacePathComponent } from "./capabilities/workspacePath.ts";
import { toolCapabilitiesComponent } from "./capabilities/tools.ts";
import { planStateComponent } from "./capabilities/planState.ts";
import { subagentStartComponent } from "./capabilities/subagentStart.ts";
import { ProviderRegistry } from "./components/providerRegistry.ts";
import { modelConfigProjection } from "./projections/modelConfig.ts";
import { workspacesProjection } from "./projections/workspaces.ts";
import { sessionsProjection } from "./projections/sessions.ts";
import { plansProjection } from "./projections/plans.ts";
import { subagentsProjection } from "./projections/subagents.ts";
import { secretStore } from "./secrets.ts";

export const LOCAL_OPERATOR = { actor: { id: "operator", kind: "user" as const }, tenant: "local" };
const SYSTEM_CALLER = { actor: { id: "system", kind: "system" as const }, tenant: "local" };

export interface ServerOptions {
  readonly port: number;
  readonly home: string;
}

export interface AppServer {
  readonly url: string;
  readonly runtime: Runtime;
  stop(): Promise<void>;
}

const GRANTED_CAPABILITIES = [
  "model.generate",
  "model.configure",
  "secret.put",
  "workspace.select",
  "workspace.path",
  "session.history",
  "tool.read",
  "tool.edit",
  "tool.bash",
  "tool.run_code",
  "plan.state",
  "subagent.start",
];

function buildPolicy(): Policy {
  return rulePolicy(
    "deepseek-harness-app",
    [
      (request) => {
        const isOperatorOrSystem = request.actor.kind === "user" || request.actor.kind === "system";
        if (isOperatorOrSystem && GRANTED_CAPABILITIES.includes(request.capability.id)) {
          return { allow: true, policyId: "deepseek-harness-app", reason: `operator/system may invoke ${request.capability.id}` };
        }
        return undefined;
      },
    ],
  );
}

function buildActionPolicy(): ActionPolicy {
  return {
    authorize: () => ({ allow: true, reason: "local single-operator app: default deny is enforced at the capability layer" }),
  };
}

const BROWSER_ENTRY_TEMPLATE = (caller: { readonly tenant: string; readonly actorId: string }) => `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@cognate/client";
import { CognateProvider } from "@cognate/react";
import { connectTransport, devToken } from "@cognate/protocol-connect-bun";
import { createRemoteRuntimeService } from "@cognate/protocol-connect";
import { App } from "../src/ui/App.tsx";

const caller = { tenant: ${JSON.stringify(caller.tenant)}, actor: { id: ${JSON.stringify(caller.actorId)}, kind: "user" } };
const transport = connectTransport(window.location.origin);
const service = createRemoteRuntimeService(transport, () => devToken(caller));
const client = createClient({ service, caller });

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(createElement(CognateProvider, { client }, createElement(App)));
}
`;

function indexHtml(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Cognate Local Build</title>
<link rel="stylesheet" href="/astryx.css" />
<link rel="stylesheet" href="/theme.css" />
<link rel="stylesheet" href="/app.css" />
</head>
<body>
<div id="root"></div>
<script type="module" src="/app.js"></script>
</body>
</html>
`;
}

export async function startServer(options: ServerOptions): Promise<AppServer> {
  const home = options.home;
  await mkdir(home, { recursive: true });
  const storePath = join(home, "app.sqlite");
  const secretsPath = join(home, "secrets.json");
  const secrets = secretStore(secretsPath);

  const domain = await loadDomain();
  const bindings = bindTranche5(domain);
  const toolBindings = bindTranche7(domain);
  const planBindings = bindTranche9(domain);
  const subagentBindings = bindTranche10(domain);

  const serviceRef: { current: RuntimeService | undefined } = { current: undefined };
  const getService = () => {
    if (!serviceRef.current) throw new Error("runtime not ready");
    return serviceRef.current;
  };
  const knownWorkspaceIds = new Set<string>();

  const runtime = await createRuntime({
    store: storePath,
    policy: buildPolicy(),
    actions: buildActionPolicy(),
    agents: [agentConfigAgent, agentCodingAgent],
    components: [
      secretPutComponent(secrets, bindings.secretPut.semanticRef),
      sessionHistoryComponent(getService, bindings.sessionHistory.semanticRef),
      workspacePathComponent(getService, toolBindings.workspacePath.semanticRef),
      toolCapabilitiesComponent(toolBindings.toolRead.semanticRef),
      planStateComponent(getService, planBindings.planState.semanticRef),
      subagentStartComponent({ getService, systemActor: SYSTEM_CALLER.actor, semanticRef: subagentBindings.subagentStart.semanticRef }),
    ],
    projections: [
      { projection: modelConfigProjection, public: true },
      { projection: workspacesProjection, public: true },
      { projection: sessionsProjection, public: true },
      { projection: plansProjection, public: true },
      { projection: subagentsProjection, public: true },
    ],
    system: SYSTEM_CALLER.actor,
  });
  serviceRef.current = runtime.service;

  // Seed `knownWorkspaceIds` from the persisted projection (survives restart).
  for (const row of await runtime.service.readProjection(LOCAL_OPERATOR, { name: "workspaces" })) {
    if (row.key.startsWith("record/")) knownWorkspaceIds.add(row.key.slice("record/".length));
  }

  const registry = new ProviderRegistry(runtime.kernel, bindings.modelGenerate.semanticRef);
  await runtime.kernel.mount(
    workspaceSelectComponent({
      getService,
      systemCaller: SYSTEM_CALLER,
      getKnownWorkspaceIds: () => knownWorkspaceIds,
      semanticRef: bindings.workspaceSelect.semanticRef,
    }),
  );
  await runtime.kernel.mount(
    modelConfigureComponent({ registry, secrets, getService, systemCaller: SYSTEM_CALLER, semanticRef: bindings.modelConfigure.semanticRef }),
  );

  // Re-mount the last-configured provider on boot (survives restart): `model.generate` is not
  // itself durable state, only the fact `model.configured` is (via `model-config`) — a run resumed
  // after a restart (e.g. one paused on an open approval continuation) needs a live provider before
  // it can call `model.generate` again.
  const modelConfigRows = await runtime.service.readProjection(LOCAL_OPERATOR, { name: "model-config" });
  const currentModelConfig = modelConfigRows.find((r) => r.key === "current")?.value as
    | { readonly providerId: string; readonly baseURL: string; readonly protocol: "openai-compatible"; readonly model: string }
    | undefined;
  if (currentModelConfig) {
    await registry.swap(
      { providerId: currentModelConfig.providerId, baseURL: currentModelConfig.baseURL, protocol: currentModelConfig.protocol, model: currentModelConfig.model },
      secrets,
    );
  }

  // T10 (J-F-delegation): `spawnSubagent` (`@cognate/profile-harness`) opens a `"subagent"`
  // continuation with `condition: { kind: "run_completion", runId: <childRunId> }` and expects
  // *something* to resolve it once the child run finishes — `createHarness` wires exactly this via
  // a `runtime.store.onCommitted` subscriber (`profiles/harness/src/index.ts`
  // `resolveSubagentCompletion`/`checkAlreadyResolved`). This app hand-composes `createRuntime`
  // instead (see README.md "Why createRuntime, not createHarness"), so that watcher does not exist
  // unless this app provides its own — without it, every parent run that calls `subagent` would wait
  // on its child forever. Reproduced here against the same public `RuntimeService` API (`listRuns`/
  // `listContinuations`/`resolveContinuation`), not a copy of the harness's internal `store`-level
  // subscription.
  async function resolveSubagentCompletion(childRunId: string): Promise<void> {
    const view = await runtime.service.getRun(LOCAL_OPERATOR, { runId: childRunId }).catch(() => undefined);
    if (!view || view.status === "running" || view.status === "waiting") return;
    const output = view.status === "completed" ? view.output : { text: "", error: view.error ?? `child run ${view.status}` };
    for (const continuation of await runtime.service.listContinuations(LOCAL_OPERATOR, { status: "OPEN" })) {
      if (continuation.type !== "subagent") continue;
      const condition = continuation.condition as { readonly kind?: string; readonly runId?: string };
      if (condition.kind !== "run_completion" || condition.runId !== childRunId) continue;
      await runtime.service
        .resolveContinuation(LOCAL_OPERATOR, { continuationId: continuation.id, action: "resume", input: output, idempotencyKey: `subagent-complete:${continuation.id}` })
        .catch(() => {});
    }
  }

  // Startup catch-up: a child may have finished before its parent's continuation was durably opened
  // (ordinary race) or before this process restarted (crash/restart window) — check every OPEN
  // `"subagent"` continuation's child run now.
  for (const continuation of await runtime.service.listContinuations(LOCAL_OPERATOR, { status: "OPEN" })) {
    if (continuation.type !== "subagent") continue;
    const condition = continuation.condition as { readonly kind?: string; readonly runId?: string };
    if (condition.kind === "run_completion" && condition.runId) await resolveSubagentCompletion(condition.runId);
  }

  // Track newly added workspaces (so workspace.select can tell "add" from "reselect") and resolve
  // subagent completions, by following the tenant's event stream live; torn down on `stop()` via
  // AbortController.
  const eventsController = new AbortController();
  void (async () => {
    try {
      for await (const event of runtime.service.events(LOCAL_OPERATOR, { follow: true, signal: eventsController.signal })) {
        if (event.eventType === "workspace.added") {
          const payload = event.payload as { readonly workspaceId: string };
          knownWorkspaceIds.add(payload.workspaceId);
        } else if (
          (event.eventType === "run.completed" || event.eventType === "run.failed" || event.eventType === "run.cancelled") &&
          event.runId
        ) {
          void resolveSubagentCompletion(event.runId);
        }
      }
    } catch {
      // aborted on shutdown
    }
  })();

  // Connect RuntimeService handled in-process (same Bun.serve as the UI), not via a second
  // `serveRuntime` server proxied by `fetch()` (the pattern in packages/cli/src/index.ts `dev()`) —
  // that double Bun.serve hop was observed to leave `internal.stop()` hanging after an error
  // response reached the outer proxy in this app's tests. Building the fetch handler directly with
  // the same public `@connectrpc/connect` + `registerRuntimeService` calls `serveRuntime` uses
  // internally keeps this a genuinely single Bun process with no proxy layer to hang.
  const connectRouter = createConnectRouter({});
  registerRuntimeService(connectRouter, runtime.service, { authenticate: devTokenAuthenticator, maxJsonDepth: 32 });
  const connectHandlersByPath = new Map<string, (req: Request) => Promise<Response>>();
  for (const uHandler of connectRouter.handlers) {
    connectHandlersByPath.set(uHandler.requestPath, createFetchHandler(uHandler, { httpVersion: "1.1" }));
  }

  const appDir = fileURLToPath(new URL("..", import.meta.url));
  const generatedDir = join(appDir, ".generated");
  await mkdir(generatedDir, { recursive: true });
  const entryPath = join(generatedDir, "entry.tsx");
  await writeFile(entryPath, BROWSER_ENTRY_TEMPLATE({ tenant: LOCAL_OPERATOR.tenant, actorId: LOCAL_OPERATOR.actor.id }));
  const build = await Bun.build({ entrypoints: [entryPath], target: "browser", format: "esm" });
  if (!build.success) throw new Error(`server: failed to bundle the UI: ${build.logs.map((log) => String(log)).join("; ")}`);
  const bundleJs = await build.outputs[0]!.text();
  const cssPaths = stylesheetPaths();
  const appCssPath = fileURLToPath(new URL("./ui/app.css", import.meta.url));
  const appCss = existsSync(appCssPath) ? await Bun.file(appCssPath).text() : "";

  const server = Bun.serve({
    port: options.port,
    hostname: "127.0.0.1",
    idleTimeout: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/health") {
        return Response.json({ ok: true, semantic: { objects: domain.projection.objects.length, digest: domain.projection.source.digest } });
      }
      if (url.pathname.startsWith("/cognate.v1.RuntimeService/")) {
        const handler = connectHandlersByPath.get(url.pathname);
        return handler ? handler(request) : new Response("not found", { status: 404 });
      }
      if (url.pathname === "/app.js") return new Response(bundleJs, { headers: { "content-type": "text/javascript" } });
      if (url.pathname === "/astryx.css" && cssPaths[0]) return new Response(Bun.file(cssPaths[0]));
      if (url.pathname === "/theme.css" && cssPaths[1]) return new Response(Bun.file(cssPaths[1]));
      if (url.pathname === "/app.css") return new Response(appCss, { headers: { "content-type": "text/css" } });
      if (url.pathname === "/") return new Response(indexHtml(), { headers: { "content-type": "text/html" } });
      return new Response("not found", { status: 404 });
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    runtime,
    async stop() {
      eventsController.abort();
      server.stop(true);
      await runtime.close();
    },
  };
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3180);
  const home = process.env.COGNATE_HARNESS_HOME ?? join(dirname(fileURLToPath(new URL(".", import.meta.url))), "..", ".data");
  const app = await startServer({ port, home });
  console.log(`[deepseek-harness] listening on ${app.url} (home: ${home})`);
  console.log(`[deepseek-harness] dev auth: Authorization: Bearer ${devToken(LOCAL_OPERATOR)}`);
}
