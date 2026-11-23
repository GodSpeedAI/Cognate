// Production AssignmentAdmission over SEA's SFWP private channel (WP-23, handoff §2.3).
//
// The Connect layer's assigned-start handler is delegate-only and re-checks everything this
// provider returns (assignmentBindingMatches, verifiedAssignmentMatches); this module resolves
// the current link and the approved inputs on the SEA server, never from the caller. Every
// deviation — wrong tenant, hidden or malformed answer, mismatched ref, a non-agent caller,
// an unreadable socket, a blown deadline — resolves to `undefined`/throws nothing: fail closed.
import {
  validateAssignment,
  type AssignmentAdmission,
  type Assignment,
  type Caller,
  type SeaAssignmentRef,
} from "@godspeedai/cognate-runtime-api";

/** `assignment_binding_get`'s answered binding, as SEA serves it (assignment-binding.v1). */
interface ServedBinding {
  readonly assignment: unknown;
  readonly link: { readonly link_id: string; readonly delegate: string; readonly delegator: string; readonly expires_at: string };
  readonly world_ref: string;
  readonly episode_kind: "evaluated" | "exploratory";
}

export interface SeaAdmissionOptions {
  /** Unix-socket path of the SEA cell's SFWP channel. */
  readonly endpoint: string;
  /** Principal this server authenticates as for the read (the delegate agent or the delegator). */
  readonly principal: { readonly actorId: string; readonly role: string };
  /** Cognate tenant entitled to a case (default: the case id). */
  readonly tenantOf?: (caseId: string) => string;
  /** Declared element the run addresses (`namespace::name`); CaseContext requires it. */
  readonly semanticRef: string;
  /** SOP role recorded on the run's case context (default `executor`). */
  readonly role?: string;
  /** Agent id the resolved assignment runs on (default: the link's delegate principal id). */
  readonly agentOf?: (binding: ServedBinding, assignment: Assignment) => string;
  /** Per-read deadline in ms (default 10 000). */
  readonly deadlineMs?: number;
  /** Transport override (tests); default: one NDJSON request per unix-socket connection. */
  readonly send?: (request: unknown) => Promise<unknown>;
}

/** One newline-delimited JSON request/response over a fresh unix socket. */
function ndjsonRequest(endpoint: string, request: unknown, deadlineMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;
    const finish = (settle: () => void) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        settle();
      }
    };
    const timer = setTimeout(() => finish(() => reject(new Error("SFWP read deadline exceeded"))), deadlineMs);
    Bun.connect({
      unix: endpoint,
      socket: {
        open(socket) {
          socket.write(`${JSON.stringify(request)}\n`);
        },
        data(socket, chunk) {
          buffer += chunk;
          const end = buffer.indexOf("\n");
          if (end < 0) return;
          const line = buffer.slice(0, end);
          finish(() => {
            try {
              socket.end();
              resolve(JSON.parse(line));
            } catch (error) {
              reject(new Error(`SFWP answer is not JSON: ${String(error)}`));
            }
          });
        },
        error(_socket, error) {
          finish(() => reject(error));
        },
      },
    }).catch((error) => finish(() => reject(error)));
  });
}

/**
 * The production provider: `assignment_binding_get` resolves both ports from the same
 * authoritative read. `verify` maps the served link; `lookup` composes the assignment and its
 * case context from the binding (world and kind travel on it).
 */
export function seaAssignmentAdmission(options: SeaAdmissionOptions): AssignmentAdmission {
  const tenantOf = options.tenantOf ?? ((caseId: string) => caseId);
  const deadlineMs = options.deadlineMs ?? 10_000;
  const send = options.send ?? ((request: unknown) => ndjsonRequest(options.endpoint, request, deadlineMs));

  async function readBinding(caller: Caller, ref: SeaAssignmentRef): Promise<ServedBinding | undefined> {
    // Wrong tenant never reaches SEA: the binding would be hidden anyway.
    if (caller.tenant !== tenantOf(ref.caseId)) return undefined;
    // Assigned starts are delegate-only: the caller must be an agent principal.
    if (caller.actor.kind !== "agent") return undefined;
    let answer: unknown;
    try {
      answer = await send({
        verb: "assignment_binding_get",
        case_id: ref.caseId,
        assignment_id: ref.assignmentId,
        actor: { actor_id: options.principal.actorId, role: options.principal.role },
      });
    } catch {
      return undefined; // unreadable socket, malformed answer, blown deadline: fail closed
    }
    if (typeof answer !== "object" || answer === null) return undefined;
    const binding = (answer as { binding?: unknown }).binding;
    if (typeof binding !== "object" || binding === null) return undefined; // SEA's hidden answer carries no binding
    const served = binding as Partial<ServedBinding> & { assignment?: unknown };
    if (
      typeof served.link !== "object" || served.link === null ||
      typeof served.link.delegate !== "string" || typeof served.link.expires_at !== "string" ||
      typeof served.world_ref !== "string" ||
      (served.episode_kind !== "evaluated" && served.episode_kind !== "exploratory")
    ) {
      return undefined;
    }
    // The exact link, on the exact assignment, for this exact delegate.
    if (served.link.link_id !== ref.linkId) return undefined;
    if (caller.actor.id !== served.link.delegate) return undefined;
    const parsed = validateAssignment(served.assignment);
    if (!parsed.ok) return undefined;
    const assignment = parsed.value;
    if (
      assignment.assignment_id !== ref.assignmentId || assignment.case_id !== ref.caseId ||
      assignment.episode_ref !== ref.episodeRef
    ) {
      return undefined;
    }
    return { ...served, assignment } as unknown as ServedBinding & { assignment: Assignment };
  }

  return {
    async verify(caller, ref) {
      const served = await readBinding(caller, ref);
      if (!served) return undefined;
      return {
        ...ref,
        tenant: caller.tenant,
        delegate: { id: served.link.delegate, kind: "agent" as const },
        expiresAt: served.link.expires_at,
      };
    },
    async lookup(caller, ref) {
      const served = await readBinding(caller, ref);
      if (!served) return undefined;
      const assignment = served.assignment as Assignment;
      return {
        assignment,
        caseContext: {
          worldRef: served.world_ref,
          semanticRef: options.semanticRef,
          caseId: ref.caseId,
          planItemId: assignment.step_id,
          role: options.role ?? "executor",
          kind: served.episode_kind,
          episodeRef: ref.episodeRef,
          assignmentId: ref.assignmentId,
        },
        agent: options.agentOf ? options.agentOf(served, assignment) : served.link.delegate,
        // A plain JSON clone: the validated brief is data, not a live view of SEA's answer.
        input: { brief: JSON.parse(JSON.stringify(assignment.brief)) },
      };
    },
  };
}
