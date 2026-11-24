// Joined WP-23 journey, Cognate half (handoff §2.6): a REAL Cognate Connect server (serveRuntime on Bun.serve)
// whose assigned starts resolve through the production provider from a LIVE sea-forge-server cell.
//
// The SEA cell is neither faked nor seeded from here. SEA's own harness seeds a Field Case with a frozen episode,
// starts the real `sea-forge-server` binary, admits the delegate over its socket (so the binding row is the server's
// own write) and then runs this suite: sea-rs crates/sea-forge-server/tests/conformance_fde_scenarios.rs,
// `wp23_joined_cognate_journey_against_the_real_server`. It passes WP23_JOINED_LIVE:
//   { socket, root, ref: { caseId, assignmentId, episodeRef, linkId }, delegate, principal: { actorId, role } }
// Without it the suite is reported as skipped, which is NOT a pass: the SEA driver fails on any skip.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRemoteRuntimeService } from "@godspeedai/cognate-protocol-connect";
import type { Json } from "@godspeedai/cognate-events";
import type { AgentDefinition, Caller } from "@godspeedai/cognate-runtime-api";
import { createRuntime, type Runtime } from "@godspeedai/cognate-runtime-bun";
import { connectTransport, seaAssignmentAdmission, serveRuntime, type RuntimeServer } from "../src/index.ts";

interface LiveRef {
  readonly caseId: string;
  readonly assignmentId: string;
  readonly episodeRef: string;
  readonly linkId: string;
}

interface LiveCell {
  /** The running cell's SFWP socket. */
  readonly socket: string;
  /** The cell's state root (the legacy-row rewrite below touches one store file under it, as SEA's wire test does). */
  readonly root: string;
  readonly ref: LiveRef;
  /** The link's delegate: the agent principal the assigned run is started by, and the agent it runs on. */
  readonly delegate: string;
  /** The principal this server authenticates as for its SFWP reads: the link's delegator, an entitled reader. */
  readonly principal: { readonly actorId: string; readonly role: string };
}

type Frame = Record<string, any>;

const LIVE = process.env.WP23_JOINED_LIVE ? (JSON.parse(process.env.WP23_JOINED_LIVE) as LiveCell) : undefined;

/** One NDJSON request over the live cell's socket, the way the provider speaks to it. */
function sfwp(socket: string, frame: unknown): Promise<Frame> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    Bun.connect({
      unix: socket,
      socket: {
        open(socket) {
          socket.write(`${JSON.stringify(frame)}\n`);
        },
        data(socket, chunk) {
          buffer += chunk;
          const end = buffer.indexOf("\n");
          if (end < 0) return;
          socket.end();
          resolve(JSON.parse(buffer.slice(0, end)));
        },
        error(_socket, error) {
          reject(error);
        },
      },
    }).catch(reject);
  });
}

async function waitUntil<T>(read: () => Promise<T>, ok: (value: T) => boolean, what: string, ms = 8_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (ok(value)) return value;
    if (Date.now() > end) throw new Error(`timed out: ${what}; last value: ${JSON.stringify(value)}`);
    await Bun.sleep(10);
  }
}

describe.skipIf(!LIVE)("joined WP-23 journey: assigned starts admitted from a live sea-forge-server cell", () => {
  const semanticRef = "fde-sop.work::Task";

  // Bun collects a skipped suite's tests too, so nothing here reads the cell before `beforeAll` assigns it.
  let cell: LiveCell;
  let ref: LiveRef;
  let delegate: Caller;
  let agent: AgentDefinition;
  const inputs: Json[] = [];

  // Test-only principal map. The bundled dev authenticator yields only `user` callers and the delegate is an
  // `agent`; a deployment supplies its own authenticator, so none of this is production identity.
  const principals = new Map<string, Caller>();
  const bearer = (caller: Caller): string => {
    const token = `joined-${crypto.randomUUID()}`;
    principals.set(token, caller);
    return token;
  };
  const authenticate = (headers: Headers): Caller | undefined =>
    principals.get(/^Bearer (.+)$/.exec(headers.get("authorization") ?? "")?.[1] ?? "");

  let runtime: Runtime;
  let server: RuntimeServer;
  let remote: ReturnType<typeof createRemoteRuntimeService>;
  // What the live cell serves an entitled reader, read directly over its socket.
  let served: Frame;

  beforeAll(async () => {
    cell = LIVE!;
    ref = cell.ref;
    // The run target is the link's delegate principal: the agent is registered under that id.
    delegate = { tenant: ref.caseId, actor: { id: cell.delegate, kind: "agent" } };
    agent = {
      id: cell.delegate,
      version: "1.0.0",
      async run(input) {
        inputs.push(input);
        return { recorded: true };
      },
    };
    runtime = await createRuntime({
      store: ":memory:",
      policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
      actions: { authorize: () => ({ allow: true, reason: "ok" }) },
      agents: [agent],
    });
    server = serveRuntime({
      service: runtime.service,
      authenticate,
      assignmentAdmission: seaAssignmentAdmission({ endpoint: cell.socket, principal: cell.principal, semanticRef }),
    });
    remote = createRemoteRuntimeService(connectTransport(server.url), bearer);
  });

  afterAll(async () => {
    await server.stop();
    await runtime.close();
  });

  /** The provider's own frame, sent directly: the read the server makes for every assigned start. */
  const readBinding = (assignmentId = ref.assignmentId): Promise<Frame> =>
    sfwp(cell.socket, {
      verb: "assignment_binding_get",
      case_id: ref.caseId,
      assignment_id: assignmentId,
      actor: { actor_id: cell.principal.actorId, role: cell.principal.role },
    });
  const assignedStart = (caller: Caller, idempotencyKey: string, assignmentRef: LiveRef = ref) =>
    remote.startRun(caller, { agent: cell.delegate, input: null, idempotencyKey, assignmentRef });
  const runsOf = async (caller: Caller): Promise<number> => (await runtime.service.listRuns(caller, {})).length;
  /** The case context the run was opened with, as committed on `run.started`. */
  const caseContextOf = async (runId: string): Promise<Json | undefined> => {
    for await (const event of runtime.service.events(delegate, { runId })) {
      if (event.eventType === "run.started") return (event.metadata as { caseContext?: Json } | null)?.caseContext;
    }
    return undefined;
  };

  test("the live cell serves this exact link to an entitled reader", async () => {
    const got = await readBinding();
    expect(got.error).toBeUndefined();
    served = got.binding;
    expect(served.link.link_id).toBe(ref.linkId);
    expect(served.link.delegate).toBe(cell.delegate);
    expect(served.assignment.assignment_id).toBe(ref.assignmentId);
    expect(served.assignment.episode_ref).toBe(ref.episodeRef);
    expect(served.assignment.budget).toHaveLength(5);
    // The contract's binding carries the frozen world and kind: the consumer composes its case context from this read alone.
    expect(served.world_ref).toMatch(/^world:[^@]+@sha256:[0-9a-f]{64}$/);
    expect(["evaluated", "exploratory"]).toContain(served.episode_kind);
  });

  test("the exact delegate's assigned start resolves from the live binding and completes one run", async () => {
    const started = await assignedStart(delegate, "joined-admitted");
    const done = await waitUntil(() => remote.getRun(delegate, { runId: started.runId }), (r) => r.status !== "running", "the assigned run completes");
    expect(done.status).toBe("completed");
    expect(done.tenant).toBe(ref.caseId);
    // The run target is the link's delegate principal; the caller supplied no agent and no input.
    expect(done.agent).toBe(cell.delegate);
    expect(done.startedBy).toBe(cell.delegate);
    expect(done.output).toEqual({ recorded: true });
    expect(inputs).toEqual([{ brief: served.assignment.brief }]);

    // The run is bound to the served assignment (Brief and Budget) and to the served link.
    const view = await runtime.assignments.getAssignment(delegate, { runId: started.runId });
    expect(view.status).toBe("completed");
    expect(view.assignment).toEqual(served.assignment);
    expect(view.linkExpiresAt).toBe(served.link.expires_at);
    expect(view.events.map((e) => e.event)).toEqual(["issued", "started", "completed"]);

    // The case context is composed from the served binding, not from the caller.
    expect(await caseContextOf(started.runId)).toEqual({
      worldRef: served.world_ref,
      semanticRef,
      caseId: ref.caseId,
      planItemId: served.assignment.step_id,
      role: "executor",
      kind: served.episode_kind,
      episodeRef: ref.episodeRef,
      assignmentId: ref.assignmentId,
      principal: cell.delegate,
    });
    expect(await runsOf(delegate)).toBe(1);
  });

  test("a wrong link is denied by the live cell and starts nothing", async () => {
    await expect(assignedStart(delegate, "joined-wrong-link", { ...ref, linkId: `${ref.linkId}-reissued` }))
      .rejects.toMatchObject({ code: "permission_denied", message: "assignment admission denied" });
    expect(await runsOf(delegate)).toBe(1);
  });

  test("anyone but the exact delegate is denied and starts nothing", async () => {
    const agentOf = (id: string): Caller => ({ tenant: ref.caseId, actor: { id, kind: "agent" } });
    const outsider = agentOf("agent:outsider");
    const operator: Caller = { tenant: ref.caseId, actor: { id: cell.principal.actorId, kind: "user" } };
    const abroad: Caller = { tenant: "another-tenant", actor: delegate.actor };
    // Another agent; the delegator itself (Hand off is the operator's, the run is the delegate's); the same
    // delegate principal under another tenant.
    for (const who of [outsider, operator, abroad]) {
      await expect(assignedStart(who, `joined-denied-${who.tenant}:${who.actor.id}`)).rejects.toMatchObject({ code: "permission_denied", message: "assignment admission denied" });
    }
    // A run belongs to its tenant (`listRuns` is tenant-scoped): the case's tenant still holds exactly the one
    // admitted run, and the other tenant none.
    expect(await runsOf(delegate)).toBe(1);
    expect(await runsOf(abroad)).toBe(0);
  });

  test("a legacy row without the recorded binding fails closed against the live cell", async () => {
    const path = join(cell.root, "cases", ref.caseId, "field-assignments.jsonl");
    const original = readFileSync(path, "utf8");
    try {
      // The same rewrite as SEA's own wire test: the row loses its `binding`, as a pre-binding row never had one.
      const rows = original.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as Frame);
      const mine = rows.find((row) => row.assignment_id === ref.assignmentId);
      if (!mine?.binding) throw new Error("the live cell carries no binding row for the assignment");
      delete mine.binding;
      writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);

      // SEA answers even its entitled reader the constant unknown-assignment shape...
      const unknown = `assign:${ref.caseId}:${served.assignment.step_id}:9:9`;
      expect(await readBinding()).toEqual(await readBinding(unknown));
      // ...so the admission fails closed, and the delegate still owns exactly the one admitted run.
      await expect(assignedStart(delegate, "joined-legacy")).rejects.toMatchObject({ code: "permission_denied", message: "assignment admission denied" });
      expect(await runsOf(delegate)).toBe(1);
    } finally {
      writeFileSync(path, original);
    }
    // Restored, the live read serves the binding again: the denial tracked the cell's state, not a cached answer.
    expect((await readBinding()).binding?.link_id).toBe(ref.linkId);
  });
});
