// Maps the transport-independent RuntimeService (spec §22, ADR-0011) onto the generated Connect
// service. Caller identity always comes from the transport's authenticator (spec §32), never from
// message bodies. The same ServiceError code round-trips through the wire in both directions.
import { fromJson, toJson } from "@bufbuild/protobuf";
import { type Value, ValueSchema } from "@bufbuild/protobuf/wkt";
import type { ConnectRouter, HandlerContext, Transport } from "@connectrpc/connect";
import { Code, ConnectError, createClient } from "@connectrpc/connect";
import {
  type Continuation,
  ContinuationAction as PbContinuationAction,
  ContinuationStatus as PbContinuationStatus,
  type Event as PbEvent,
  type JsonPatchOp as PbJsonPatchOp,
  ResolveOutcome as PbResolveOutcome,
  type Run,
  type RemoteCapabilityOffer as PbRemoteCapabilityOffer,
  RunStatus as PbRunStatus,
  RuntimeService as RuntimeServiceDesc,
  type SemanticRef as PbSemanticRef,
  type StateUpdate as PbStateUpdate,
} from "@godspeedai/cognate-proto";
import type { Json, StoredEvent } from "@godspeedai/cognate-events";
import type { SemanticRef } from "@godspeedai/cognate-kernel-api";
import type { Caller, ContinuationView, JsonPatchOp, RemoteCapabilityOffer, RunView, RuntimeService, ServiceErrorCode, StateUpdate } from "@godspeedai/cognate-runtime-api";
import { ServiceError } from "@godspeedai/cognate-runtime-api";

export interface HandlerOptions {
  /** Establish the caller from request headers (e.g. `authorization: Bearer …`); undefined → unauthenticated. */
  readonly authenticate: (headers: Headers) => Caller | undefined | Promise<Caller | undefined>;
  /** Maximum nesting depth of JSON values (google.protobuf.Value) accepted from clients. */
  readonly maxJsonDepth: number;
}

/** The ServiceError ↔ Connect code table (exported for tests and other transports). */
export const errorCodes: Readonly<Record<ServiceErrorCode, number>> = {
  not_found: Code.NotFound,
  permission_denied: Code.PermissionDenied,
  invalid_argument: Code.InvalidArgument,
  failed_precondition: Code.FailedPrecondition,
  unavailable: Code.Unavailable,
  deadline_exceeded: Code.DeadlineExceeded,
  already_exists: Code.AlreadyExists,
  unauthenticated: Code.Unauthenticated,
  resource_exhausted: Code.ResourceExhausted,
};

const codeToServiceError: ReadonlyMap<number, ServiceErrorCode> = new Map(
  (Object.entries(errorCodes) as [ServiceErrorCode, number][]).map(([code, connectCode]) => [connectCode, code]),
);

// ── JSON ↔ google.protobuf.Value ────────────────────────────────────────────────

function jsonToValue(json: Json): Value {
  return fromJson(ValueSchema, json as never);
}

function valueToJson(value: Value | undefined): Json {
  // An absent field, or a Value with no oneof case set (e.g. a bare object literal handed to the
  // generated client's `create()` for a `google.protobuf.Value` field, which does not coerce plain
  // JSON the way it does for `Struct`/`ListValue` fields), is treated as JSON null rather than
  // raising `@bufbuild/protobuf`'s "must have a value" error.
  if (value === undefined || value.kind.case === undefined) return null;
  return toJson(ValueSchema, value) as Json;
}

function semanticRefInit(ref: SemanticRef | undefined) {
  if (!ref) return undefined;
  return { namespace: ref.namespace, id: ref.id, kind: ref.kind ?? "", source: { uri: ref.source.uri, digest: ref.source.digest }, projectionVersion: ref.projectionVersion };
}

function semanticRefFromWire(ref: PbSemanticRef | undefined): SemanticRef | undefined {
  if (!ref) return undefined;
  return { namespace: ref.namespace, id: ref.id, kind: ref.kind || undefined, source: { uri: ref.source?.uri ?? "", digest: ref.source?.digest ?? "" }, projectionVersion: ref.projectionVersion };
}

function jsonDepth(value: unknown): number {
  if (value === null || typeof value !== "object") return 0;
  const values = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  let max = 0;
  for (const v of values) max = Math.max(max, jsonDepth(v));
  return values.length === 0 ? 1 : 1 + max;
}

/** Decode an incoming Value and enforce the configured depth bound (spec §32). */
function decodeValue(value: Value | undefined, maxJsonDepth: number): Json {
  const json = valueToJson(value);
  if (jsonDepth(json) > maxJsonDepth) {
    throw new ConnectError(`value exceeds maximum JSON depth of ${maxJsonDepth}`, Code.InvalidArgument);
  }
  return json;
}

// ── uint64 ↔ number ───────────────────────────────────────────────────────────────

const toNumber = (v: bigint | undefined): number | undefined => (v === undefined ? undefined : Number(v));
const toBigInt = (v: number | null | undefined): bigint | undefined => (v === null || v === undefined ? undefined : BigInt(Math.trunc(v)));

// ── enums ↔ string unions ──────────────────────────────────────────────────────────

const runStatusToProto: Record<RunView["status"], PbRunStatus> = {
  running: PbRunStatus.RUNNING,
  waiting: PbRunStatus.WAITING,
  completed: PbRunStatus.COMPLETED,
  failed: PbRunStatus.FAILED,
  cancelled: PbRunStatus.CANCELLED,
};
const runStatusFromProto: Record<number, RunView["status"]> = {
  [PbRunStatus.RUNNING]: "running",
  [PbRunStatus.WAITING]: "waiting",
  [PbRunStatus.COMPLETED]: "completed",
  [PbRunStatus.FAILED]: "failed",
  [PbRunStatus.CANCELLED]: "cancelled",
};

const continuationStatusToProto: Record<ContinuationView["status"], PbContinuationStatus> = {
  OPEN: PbContinuationStatus.OPEN,
  RESUMED: PbContinuationStatus.RESUMED,
  CANCELLED: PbContinuationStatus.CANCELLED,
  EXPIRED: PbContinuationStatus.EXPIRED,
  FAILED: PbContinuationStatus.FAILED,
  BLOCKED: PbContinuationStatus.BLOCKED,
};
const continuationStatusFromProto: Record<number, ContinuationView["status"]> = {
  [PbContinuationStatus.OPEN]: "OPEN",
  [PbContinuationStatus.RESUMED]: "RESUMED",
  [PbContinuationStatus.CANCELLED]: "CANCELLED",
  [PbContinuationStatus.EXPIRED]: "EXPIRED",
  [PbContinuationStatus.FAILED]: "FAILED",
  [PbContinuationStatus.BLOCKED]: "BLOCKED",
};

const continuationActionToProto: Record<"resume" | "cancel", PbContinuationAction> = {
  resume: PbContinuationAction.RESUME,
  cancel: PbContinuationAction.CANCEL,
};
const continuationActionFromProto: Record<number, "resume" | "cancel"> = {
  [PbContinuationAction.RESUME]: "resume",
  [PbContinuationAction.CANCEL]: "cancel",
};

const resolveOutcomeFromProto: Record<number, "transitioned" | "duplicate" | "already_terminal"> = {
  [PbResolveOutcome.TRANSITIONED]: "transitioned",
  [PbResolveOutcome.DUPLICATE]: "duplicate",
  [PbResolveOutcome.ALREADY_TERMINAL]: "already_terminal",
};
const resolveOutcomeToProto: Record<"transitioned" | "duplicate" | "already_terminal", PbResolveOutcome> = {
  transitioned: PbResolveOutcome.TRANSITIONED,
  duplicate: PbResolveOutcome.DUPLICATE,
  already_terminal: PbResolveOutcome.ALREADY_TERMINAL,
};

// ── message ↔ view conversions ────────────────────────────────────────────────────

function runInit(run: RunView) {
  return {
    runId: run.runId,
    agent: run.agent,
    tenant: run.tenant,
    status: runStatusToProto[run.status],
    input: jsonToValue(run.input),
    output: jsonToValue(run.output),
    error: run.error ?? undefined,
    correlationId: run.correlationId,
    startedBy: run.startedBy,
    waitingOn: [...run.waitingOn],
  };
}

function runFromWire(run: Run): RunView {
  return {
    runId: run.runId,
    agent: run.agent,
    tenant: run.tenant,
    status: runStatusFromProto[run.status] ?? "running",
    input: valueToJson(run.input),
    output: valueToJson(run.output),
    error: run.error ?? null,
    correlationId: run.correlationId,
    startedBy: run.startedBy,
    waitingOn: run.waitingOn,
  };
}

function continuationInit(c: ContinuationView) {
  return {
    id: c.id,
    runId: c.runId,
    type: c.type,
    status: continuationStatusToProto[c.status],
    condition: jsonToValue(c.condition),
    payload: jsonToValue(c.payload),
    version: BigInt(c.version),
    expiresAt: c.expiresAt === null ? undefined : BigInt(c.expiresAt),
  };
}

function continuationFromWire(c: Continuation): ContinuationView {
  return {
    id: c.id,
    runId: c.runId,
    type: c.type,
    status: continuationStatusFromProto[c.status] ?? "OPEN",
    condition: valueToJson(c.condition),
    payload: valueToJson(c.payload),
    version: Number(c.version),
    expiresAt: c.expiresAt === undefined ? null : Number(c.expiresAt),
  };
}

function eventInit(e: StoredEvent) {
  return {
    eventId: e.eventId,
    streamId: e.streamId,
    streamSequence: BigInt(e.streamSequence),
    position: BigInt(e.position),
    eventType: e.eventType,
    schemaVersion: e.schemaVersion,
    occurredAt: e.occurredAt,
    recordedAt: e.recordedAt,
    tenant: e.tenant,
    correlationId: e.correlationId,
    causationId: e.causationId ?? undefined,
    runId: e.runId ?? undefined,
    scopeId: e.scopeId,
    componentId: e.componentId,
    fiberId: e.fiberId,
    semanticRef: semanticRefInit(e.semanticRef),
    payload: jsonToValue(e.payload),
    metadata: e.metadata,
    erasure: e.erasure ? { reason: e.erasure.reason, erasedAt: e.erasure.erasedAt } : undefined,
  };
}

function eventFromWire(e: PbEvent): StoredEvent {
  return {
    eventId: e.eventId,
    streamId: e.streamId,
    streamSequence: Number(e.streamSequence),
    position: Number(e.position),
    eventType: e.eventType,
    schemaVersion: e.schemaVersion,
    occurredAt: e.occurredAt,
    recordedAt: e.recordedAt,
    tenant: e.tenant,
    correlationId: e.correlationId,
    causationId: e.causationId ?? null,
    runId: e.runId ?? null,
    scopeId: e.scopeId,
    componentId: e.componentId,
    fiberId: e.fiberId,
    semanticRef: semanticRefFromWire(e.semanticRef),
    payload: valueToJson(e.payload),
    metadata: e.metadata as { readonly [key: string]: Json } | undefined,
    erasure: e.erasure ? { reason: e.erasure.reason, erasedAt: e.erasure.erasedAt } : undefined,
  };
}

// ── shared state (spec §29.1) ───────────────────────────────────────────────────────

function jsonPatchOpInit(op: JsonPatchOp) {
  return {
    op: op.op,
    path: op.path,
    from: "from" in op ? op.from : undefined,
    value: jsonToValue("value" in op ? op.value : null),
  };
}

function jsonPatchOpFromWire(op: PbJsonPatchOp): JsonPatchOp {
  const value = valueToJson(op.value);
  switch (op.op) {
    case "add":
      return { op: "add", path: op.path, value };
    case "replace":
      return { op: "replace", path: op.path, value };
    case "remove":
      return { op: "remove", path: op.path };
    case "move":
      return { op: "move", from: op.from ?? "", path: op.path };
    case "copy":
      return { op: "copy", from: op.from ?? "", path: op.path };
    case "test":
      return { op: "test", path: op.path, value };
    default:
      throw new ConnectError(`unknown JSON Patch op "${op.op}"`, Code.InvalidArgument);
  }
}

function stateUpdateFieldInit(update: StateUpdate) {
  if ("snapshot" in update) return { kind: { case: "snapshot" as const, value: jsonToValue(update.snapshot) } };
  return { kind: { case: "patch" as const, value: { ops: update.patch.map(jsonPatchOpInit) } } };
}

function stateUpdateFromWire(update: PbStateUpdate | undefined): StateUpdate {
  if (update?.kind.case === "patch") return { patch: update.kind.value.ops.map(jsonPatchOpFromWire) };
  return { snapshot: valueToJson(update?.kind.case === "snapshot" ? update.kind.value : undefined) };
}

function offerInit(offer: RemoteCapabilityOffer) {
  return {
    id: offer.id, leaseId: offer.leaseId, agent: offer.agent, scopeId: offer.scopeId,
    capability: offer.contract.id, contractVersion: offer.contract.version, attributes: jsonToValue(offer.contract.attributes ?? {}),
    description: offer.description, inputSchema: jsonToValue(offer.inputSchema), outputSchema: offer.outputSchema === undefined ? undefined : jsonToValue(offer.outputSchema), expiresAt: BigInt(offer.expiresAt),
  };
}

function offerFromWire(offer: PbRemoteCapabilityOffer): RemoteCapabilityOffer {
  const attributes = valueToJson(offer.attributes);
  return {
    id: offer.id, leaseId: offer.leaseId, agent: offer.agent, scopeId: offer.scopeId,
    contract: { id: offer.capability, version: offer.contractVersion, ...(attributes && typeof attributes === "object" && !Array.isArray(attributes) ? { attributes: attributes as Readonly<Record<string, Json>> } : {}) },
    description: offer.description, inputSchema: valueToJson(offer.inputSchema), ...(offer.outputSchema === undefined ? {} : { outputSchema: valueToJson(offer.outputSchema) }), expiresAt: Number(offer.expiresAt),
  };
}

// ── error mapping ─────────────────────────────────────────────────────────────────

function throwConnectError(e: unknown): never {
  if (e instanceof ServiceError) {
    throw new ConnectError(e.message, errorCodes[e.code]);
  }
  throw e;
}

function throwServiceError(e: unknown): never {
  if (e instanceof ConnectError) {
    const code = codeToServiceError.get(e.code) ?? "unavailable";
    throw new ServiceError(code, e.rawMessage || e.message);
  }
  throw e;
}

/** Race a unary call against the handler's deadline signal (spec §32); the signal is set up by the transport. */
function withDeadline<T>(context: HandlerContext, work: Promise<T>): Promise<T> {
  if (context.signal.aborted) {
    return Promise.reject(new ConnectError("deadline exceeded", Code.DeadlineExceeded));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ConnectError("deadline exceeded", Code.DeadlineExceeded));
    context.signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (v) => {
        context.signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        context.signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

async function requireCaller(options: HandlerOptions, context: HandlerContext): Promise<Caller> {
  const caller = await options.authenticate(context.requestHeader);
  if (!caller) throw new ConnectError("unauthenticated", Code.Unauthenticated);
  return caller;
}

/** Register the RuntimeService routes on a Connect router. ServiceError codes map to Connect codes. */
export function registerRuntimeService(router: ConnectRouter, service: RuntimeService, options: HandlerOptions): void {
  const depth = options.maxJsonDepth;
  router.service(RuntimeServiceDesc, {
    async startRun(req, context) {
      try {
        const caller = await requireCaller(options, context);
        const run = await withDeadline(
          context,
          service.startRun(caller, {
            agent: req.agent,
            input: decodeValue(req.input, depth),
            idempotencyKey: req.idempotencyKey,
            correlationId: req.correlationId,
            state: req.state !== undefined ? decodeValue(req.state, depth) : undefined,
          }),
        );
        return runInit(run);
      } catch (e) {
        throwConnectError(e);
      }
    },
    async getRun(req, context) {
      try {
        const caller = await requireCaller(options, context);
        const run = await withDeadline(context, service.getRun(caller, { runId: req.runId }));
        return runInit(run);
      } catch (e) {
        throwConnectError(e);
      }
    },
    async cancelRun(req, context) {
      try {
        const caller = await requireCaller(options, context);
        const run = await withDeadline(context, service.cancelRun(caller, { runId: req.runId, reason: req.reason, idempotencyKey: req.idempotencyKey }));
        return runInit(run);
      } catch (e) {
        throwConnectError(e);
      }
    },
    async *streamEvents(req, context) {
      const caller = await requireCaller(options, context);
      try {
        const iterable = service.events(caller, {
          afterPosition: toNumber(req.afterPosition),
          runId: req.runId,
          correlationId: req.correlationId,
          follow: req.follow,
          signal: context.signal,
        });
        for await (const event of iterable) {
          if (context.signal.aborted) return;
          yield eventInit(event);
        }
      } catch (e) {
        throwConnectError(e);
      }
    },
    async listContinuations(req, context) {
      try {
        const caller = await requireCaller(options, context);
        const status = req.status === PbContinuationStatus.UNSPECIFIED ? undefined : continuationStatusFromProto[req.status];
        const continuations = await withDeadline(context, service.listContinuations(caller, { runId: req.runId, status }));
        return { continuations: continuations.map(continuationInit) };
      } catch (e) {
        throwConnectError(e);
      }
    },
    async resolveContinuation(req, context) {
      try {
        const caller = await requireCaller(options, context);
        const result = await withDeadline(
          context,
          service.resolveContinuation(caller, {
            continuationId: req.continuationId,
            action: continuationActionFromProto[req.action] ?? "resume",
            input: decodeValue(req.input, depth),
            reason: req.reason,
            idempotencyKey: req.idempotencyKey,
            expectedVersion: toNumber(req.expectedVersion),
          }),
        );
        return { outcome: resolveOutcomeToProto[result.outcome], continuation: continuationInit(result.continuation) };
      } catch (e) {
        throwConnectError(e);
      }
    },
    async invoke(req, context) {
      try {
        const caller = await requireCaller(options, context);
        const output = await withDeadline(
          context,
          service.invoke(caller, { capability: req.capability, input: decodeValue(req.input, depth), correlationId: req.correlationId, idempotencyKey: req.idempotencyKey, deadline: toNumber(req.deadline) }),
        );
        return { output: jsonToValue(output) };
      } catch (e) {
        throwConnectError(e);
      }
    },
    async getArtifact(req, context) {
      try {
        const caller = await requireCaller(options, context);
        const artifact = await withDeadline(context, service.getArtifact(caller, { artifactId: req.artifactId, representation: req.representation }));
        return { id: artifact.id, name: artifact.name, mediaType: artifact.mediaType, contentHash: artifact.contentHash, bytes: artifact.bytes };
      } catch (e) {
        throwConnectError(e);
      }
    },
    async readProjection(req, context) {
      try {
        const caller = await requireCaller(options, context);
        const read = await withDeadline(context, service.readProjection(caller, { name: req.name }));
        return {
          entries: read.rows.map((entry) => ({ key: entry.key, value: jsonToValue(entry.value) })),
          checkpoint: read.checkpoint
            ? {
                name: read.checkpoint.name,
                version: read.checkpoint.version,
                position: BigInt(read.checkpoint.position),
                status: read.checkpoint.status,
                errorPosition: read.checkpoint.error ? BigInt(read.checkpoint.error.position) : undefined,
                errorEventId: read.checkpoint.error?.eventId,
                errorMessage: read.checkpoint.error?.message,
              }
            : undefined,
        };
      } catch (e) {
        throwConnectError(e);
      }
    },
    async listRuns(req, context) {
      try {
        const caller = await requireCaller(options, context);
        const runs = await withDeadline(context, service.listRuns(caller, { correlationId: req.correlationId, agent: req.agent }));
        return { runs: runs.map(runInit) };
      } catch (e) {
        throwConnectError(e);
      }
    },
    async updateState(req, context) {
      try {
        const caller = await requireCaller(options, context);
        const result = await withDeadline(
          context,
          service.updateState(caller, { runId: req.runId, update: stateUpdateFromWire(req.update), idempotencyKey: req.idempotencyKey, expectedVersion: toNumber(req.expectedVersion) }),
        );
        return { state: jsonToValue(result.state), version: BigInt(result.version) };
      } catch (e) {
        throwConnectError(e);
      }
    },
    async readSharedState(req, context) {
      try {
        const caller = await requireCaller(options, context);
        const result = await withDeadline(context, service.readSharedState(caller, { threadId: req.threadId }));
        return { state: jsonToValue(result.state), version: BigInt(result.version) };
      } catch (e) { throwConnectError(e); }
    },
    async updateSharedState(req, context) {
      try {
        const caller = await requireCaller(options, context);
        const result = await withDeadline(context, service.updateSharedState(caller, {
          threadId: req.threadId,
          update: stateUpdateFromWire(req.update),
          idempotencyKey: req.idempotencyKey,
          expectedVersion: toNumber(req.expectedVersion),
        }));
        return { state: jsonToValue(result.state), version: BigInt(result.version) };
      } catch (e) { throwConnectError(e); }
    },
    async publishRemoteOffer(req, context) {
      try {
        const caller = await requireCaller(options, context);
        const attributes = decodeValue(req.attributes, depth);
        if (attributes === null || typeof attributes !== "object" || Array.isArray(attributes)) throw new ConnectError("offer attributes must be an object", Code.InvalidArgument);
        const offer = await withDeadline(context, service.publishRemoteOffer(caller, { leaseId: req.leaseId, agent: req.agent, contract: { id: req.capability, version: req.contractVersion, attributes: attributes as Readonly<Record<string, Json>> }, description: req.description, inputSchema: decodeValue(req.inputSchema, depth), ...(req.outputSchema === undefined ? {} : { outputSchema: decodeValue(req.outputSchema, depth) }), ttlMs: Number(req.ttlMs) }));
        return offerInit(offer);
      } catch (e) { throwConnectError(e); }
    },
    async listRemoteOffers(req, context) {
      try {
        const caller = await requireCaller(options, context);
        const offers = await withDeadline(context, service.listRemoteOffers(caller, { agent: req.agent }));
        return { offers: offers.map(offerInit) };
      } catch (e) { throwConnectError(e); }
    },
    async revokeRemoteOffer(req, context) {
      try {
        const caller = await requireCaller(options, context);
        await withDeadline(context, service.revokeRemoteOffer(caller, { offerId: req.offerId }));
        return {};
      } catch (e) { throwConnectError(e); }
    },
  });
}

/** A RuntimeService backed by a remote Connect endpoint. `tokenFor` supplies the credential that authenticates a caller. */
export function createRemoteRuntimeService(transport: Transport, tokenFor: (caller: Caller) => string): RuntimeService {
  const client = createClient(RuntimeServiceDesc, transport);
  const headersFor = (caller: Caller) => ({ authorization: `Bearer ${tokenFor(caller)}` });

  return {
    async startRun(caller, request) {
      try {
        const run = await client.startRun(
          {
            agent: request.agent,
            input: jsonToValue(request.input),
            idempotencyKey: request.idempotencyKey,
            correlationId: request.correlationId,
            state: request.state !== undefined ? jsonToValue(request.state) : undefined,
          },
          { headers: headersFor(caller) },
        );
        return runFromWire(run);
      } catch (e) {
        throwServiceError(e);
      }
    },
    async getRun(caller, request) {
      try {
        const run = await client.getRun({ runId: request.runId }, { headers: headersFor(caller) });
        return runFromWire(run);
      } catch (e) {
        throwServiceError(e);
      }
    },
    async cancelRun(caller, request) {
      try {
        const run = await client.cancelRun({ runId: request.runId, reason: request.reason, idempotencyKey: request.idempotencyKey }, { headers: headersFor(caller) });
        return runFromWire(run);
      } catch (e) {
        throwServiceError(e);
      }
    },
    events(caller, request) {
      const headers = headersFor(caller);
      const signal = request.signal;
      return (async function* () {
        try {
          const stream = client.streamEvents(
            { afterPosition: toBigInt(request.afterPosition), runId: request.runId, correlationId: request.correlationId, follow: request.follow ?? false },
            { headers, signal },
          );
          for await (const event of stream) {
            yield eventFromWire(event);
          }
        } catch (e) {
          if (signal?.aborted) return;
          throwServiceError(e);
        }
      })();
    },
    async listContinuations(caller, request) {
      try {
        const response = await client.listContinuations(
          { runId: request.runId, status: request.status ? continuationStatusToProto[request.status] : PbContinuationStatus.UNSPECIFIED },
          { headers: headersFor(caller) },
        );
        return response.continuations.map(continuationFromWire);
      } catch (e) {
        throwServiceError(e);
      }
    },
    async resolveContinuation(caller, request) {
      try {
        const response = await client.resolveContinuation(
          {
            continuationId: request.continuationId,
            action: continuationActionToProto[request.action],
            input: jsonToValue(request.input ?? null),
            reason: request.reason,
            idempotencyKey: request.idempotencyKey,
            expectedVersion: toBigInt(request.expectedVersion),
          },
          { headers: headersFor(caller) },
        );
        return { outcome: resolveOutcomeFromProto[response.outcome] ?? "transitioned", continuation: continuationFromWire(response.continuation!) };
      } catch (e) {
        throwServiceError(e);
      }
    },
    async invoke(caller, request) {
      try {
        const response = await client.invoke(
          { capability: request.capability, input: jsonToValue(request.input), correlationId: request.correlationId, idempotencyKey: request.idempotencyKey, deadline: toBigInt(request.deadline) },
          { headers: headersFor(caller) },
        );
        return valueToJson(response.output);
      } catch (e) {
        throwServiceError(e);
      }
    },
    async getArtifact(caller, request) {
      try {
        const artifact = await client.getArtifact({ artifactId: request.artifactId, representation: request.representation }, { headers: headersFor(caller) });
        return { id: artifact.id, name: artifact.name, mediaType: artifact.mediaType, contentHash: artifact.contentHash, bytes: artifact.bytes };
      } catch (e) {
        throwServiceError(e);
      }
    },
    async readProjection(caller, request) {
      try {
        const response = await client.readProjection({ name: request.name }, { headers: headersFor(caller) });
        return {
          rows: response.entries.map((entry) => ({ key: entry.key, value: valueToJson(entry.value) })),
          checkpoint: response.checkpoint
            ? {
                name: response.checkpoint.name,
                version: response.checkpoint.version,
                position: Number(response.checkpoint.position),
                status: response.checkpoint.status === "error" ? "error" : "ok",
                error:
                  response.checkpoint.errorEventId !== ""
                    ? { position: Number(response.checkpoint.errorPosition), eventId: response.checkpoint.errorEventId, message: response.checkpoint.errorMessage }
                    : null,
              }
            : null,
        };
      } catch (e) {
        throwServiceError(e);
      }
    },
    async listRuns(caller, request) {
      try {
        const response = await client.listRuns({ correlationId: request.correlationId, agent: request.agent }, { headers: headersFor(caller) });
        return response.runs.map(runFromWire);
      } catch (e) {
        throwServiceError(e);
      }
    },
    async updateState(caller, request) {
      try {
        const response = await client.updateState(
          { runId: request.runId, update: stateUpdateFieldInit(request.update), idempotencyKey: request.idempotencyKey, expectedVersion: toBigInt(request.expectedVersion) },
          { headers: headersFor(caller) },
        );
        return { state: valueToJson(response.state), version: Number(response.version) };
      } catch (e) {
        throwServiceError(e);
      }
    },
    async readSharedState(caller, request) {
      try {
        const response = await client.readSharedState({ threadId: request.threadId }, { headers: headersFor(caller) });
        return { state: valueToJson(response.state), version: Number(response.version) };
      } catch (e) { throwServiceError(e); }
    },
    async updateSharedState(caller, request) {
      try {
        const response = await client.updateSharedState({
          threadId: request.threadId,
          update: stateUpdateFieldInit(request.update),
          idempotencyKey: request.idempotencyKey,
          expectedVersion: toBigInt(request.expectedVersion),
        }, { headers: headersFor(caller) });
        return { state: valueToJson(response.state), version: Number(response.version) };
      } catch (e) { throwServiceError(e); }
    },
    async observe(_caller, _request) {
      // Observation ingestion is an in-process, mechanism-layer door in v0 — deliberately not exposed over the
      // public Connect surface (it is a provider/observer privilege, not a remote-caller capability).
      throw new ServiceError("failed_precondition", "observation ingestion is an in-process door; not available over the remote Connect surface");
    },
    async publishRemoteOffer(caller, request) {
      try {
        const offer = await client.publishRemoteOffer({ leaseId: request.leaseId, agent: request.agent, capability: request.contract.id, contractVersion: request.contract.version, attributes: jsonToValue(request.contract.attributes ?? {}), description: request.description, inputSchema: jsonToValue(request.inputSchema), outputSchema: request.outputSchema === undefined ? undefined : jsonToValue(request.outputSchema), ttlMs: BigInt(request.ttlMs) }, { headers: headersFor(caller) });
        return offerFromWire(offer);
      } catch (e) { throwServiceError(e); }
    },
    async listRemoteOffers(caller, request) {
      try {
        const response = await client.listRemoteOffers({ agent: request.agent }, { headers: headersFor(caller) });
        return response.offers.map(offerFromWire);
      } catch (e) { throwServiceError(e); }
    },
    async revokeRemoteOffer(caller, request) {
      try {
        await client.revokeRemoteOffer({ offerId: request.offerId }, { headers: headersFor(caller) });
      } catch (e) { throwServiceError(e); }
    },
  };
}
