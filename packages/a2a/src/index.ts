// CG-A2A-001 (spec §6 optional protocols): publishes a runtime agent as an A2A (`@a2a-js/sdk` 1.2.1, protocol
// v1.0) agent. The SDK's own server framework (`DefaultRequestHandler` + `AgentExecutor`) targets Express and
// long-lived event buses, which doesn't fit a stateless `fetch` handler over a replay-based runtime; this
// implements the JSON-RPC wire contract directly, using the SDK's own proto-JSON codecs (`SendMessageRequest`,
// `SendMessageResponse`, `TaskState`, `Role`) so every shape on the wire is exactly what the SDK's `Client`
// (`ClientFactory` → `JsonRpcTransport`) sends and expects — never a guessed shape.
import type { Caller, ContinuationView, RunStatus, RunView, RuntimeService } from "@godspeedai/runtime-api";
import { type Message, SendMessageRequest, SendMessageResponse, type Task, TaskState } from "@a2a-js/sdk";

const AGENT_CARD_PATH = "/.well-known/agent-card.json";
const RPC_PATH = "/a2a";

/** Bounded wait for a run to leave `running`: matches the runtime's default background-loop tick. */
const WAIT_TIMEOUT_MS = 5_000;
const WAIT_POLL_MS = 10;

export interface A2AAdapterOptions {
  readonly service: RuntimeService;
  /** Runtime agent id served, e.g. `agent.refund`. */
  readonly agent: string;
  readonly card: { readonly name: string; readonly description: string; readonly version: string; readonly skills: readonly { readonly id: string; readonly name: string; readonly description: string }[] };
  readonly authenticate: (headers: Headers) => Caller | undefined | Promise<Caller | undefined>;
  /** Public base URL written into the agent card. */
  readonly baseUrl: string;
}

function jsonRpcError(id: unknown, code: number, message: string, httpStatus: number): Response {
  return Response.json({ jsonrpc: "2.0", id: (id as string | number | null) ?? null, error: { code, message } }, { status: httpStatus });
}

function extractText(message: Message): string {
  for (const part of message.parts) {
    if (part.content?.$case === "text") return part.content.value;
  }
  return "";
}

function mapRunStatus(status: RunStatus): TaskState {
  switch (status) {
    case "waiting":
      return TaskState.TASK_STATE_INPUT_REQUIRED;
    case "completed":
      return TaskState.TASK_STATE_COMPLETED;
    case "failed":
      return TaskState.TASK_STATE_FAILED;
    case "cancelled":
      return TaskState.TASK_STATE_CANCELED;
    case "running":
      return TaskState.TASK_STATE_WORKING;
  }
}

const SETTLED: ReadonlySet<RunStatus> = new Set(["waiting", "completed", "failed", "cancelled"]);

/**
 * Polls `getRun` until the run leaves `running`, or `WAIT_TIMEOUT_MS` elapses (then returns the last view).
 * `resumedContinuationId`, when given, is the continuation just resolved by this call: a `waiting` status still
 * listing it means the background loop hasn't re-executed yet, so that alone must not count as settled.
 */
async function waitForSettled(service: RuntimeService, caller: Caller, runId: string, resumedContinuationId?: string): Promise<RunView> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    const view = await service.getRun(caller, { runId });
    const stale = resumedContinuationId !== undefined && view.status === "waiting" && view.waitingOn.includes(resumedContinuationId);
    if ((SETTLED.has(view.status) && !stale) || Date.now() >= deadline) return view;
    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
  }
}

function toTask(runId: string, view: RunView): Task {
  const state = mapRunStatus(view.status);
  return {
    id: runId,
    contextId: runId,
    status: { state, message: undefined, timestamp: new Date().toISOString() },
    artifacts:
      state === TaskState.TASK_STATE_COMPLETED
        ? [
            {
              artifactId: `${runId}:output`,
              name: "output",
              description: "",
              parts: [{ content: { $case: "data", value: view.output }, metadata: undefined, filename: "", mediaType: "application/json" }],
              metadata: undefined,
              extensions: [],
            },
          ]
        : [],
    history: [],
    metadata: view.error ? { error: view.error } : undefined,
  };
}

/**
 * Fetch handler serving the A2A agent card at the SDK's well-known path and the JSON-RPC transport endpoint.
 * `SendMessage` starts (or, with a `taskId`, resumes) a durable run: A2A task id = Cognate run id; an open
 * continuation surfaces as `TASK_STATE_INPUT_REQUIRED`; completion returns the run output as a data artifact.
 */
export function createA2AHandler(options: A2AAdapterOptions): (request: Request) => Promise<Response> {
  const { service, agent, card, authenticate, baseUrl } = options;

  const agentCard = {
    name: card.name,
    description: card.description,
    version: card.version,
    supportedInterfaces: [{ url: `${baseUrl}${RPC_PATH}`, protocolBinding: "JSONRPC", tenant: "", protocolVersion: "1.0" }],
    provider: undefined,
    documentationUrl: undefined,
    capabilities: { extensions: [] },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: card.skills.map((skill) => ({ id: skill.id, name: skill.name, description: skill.description, tags: [], examples: [], inputModes: [], outputModes: [], securityRequirements: [] })),
    signatures: [],
  };

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === AGENT_CARD_PATH) {
      return Response.json(agentCard);
    }

    if (url.pathname !== RPC_PATH) return new Response("not found", { status: 404 });

    const caller = await authenticate(request.headers);
    if (!caller) return jsonRpcError(null, -32001, "unauthorized", 401);

    let body: { readonly id?: string | number | null; readonly method?: string; readonly params?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jsonRpcError(null, -32700, "Parse error", 400);
    }
    const id = body.id ?? null;

    if (body.method !== "SendMessage") {
      return jsonRpcError(id, -32601, `Method not found: ${String(body.method)}`, 404);
    }

    try {
      const parsed = SendMessageRequest.fromJSON(body.params);
      const message = parsed.message;
      if (!message) throw new Error("SendMessageRequest missing message");
      const text = extractText(message);

      let runId: string;
      let resumedContinuationId: string | undefined;
      if (message.taskId) {
        runId = message.taskId;
        const open: readonly ContinuationView[] = await service.listContinuations(caller, { runId, status: "OPEN" });
        const continuation = open[0];
        if (!continuation) throw new Error(`no open continuation for run ${runId}`);
        resumedContinuationId = continuation.id;
        await service.resolveContinuation(caller, { continuationId: continuation.id, action: "resume", input: { text }, idempotencyKey: message.messageId });
      } else {
        const started = await service.startRun(caller, { agent, input: { text }, idempotencyKey: message.messageId });
        runId = started.runId;
      }

      const view = await waitForSettled(service, caller, runId, resumedContinuationId);
      const task = toTask(runId, view);
      const result = SendMessageResponse.toJSON({ payload: { $case: "task", value: task } });
      return Response.json({ jsonrpc: "2.0", id, result });
    } catch (error) {
      return jsonRpcError(id, -32000, error instanceof Error ? error.message : "internal error", 500);
    }
  };
}
