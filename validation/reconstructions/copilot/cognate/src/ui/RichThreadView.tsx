import { type ReactNode, useState } from "react";
import { useCognate, useProjection } from "@godspeedai/react";
import { ChatSurface } from "../ChatSurface.tsx";
import { SharedStateSurface } from "../SharedStateSurface.tsx";
import { JOURNEY_J_AGENT } from "../constants.ts";
import { ControlledRenderingSurface, RichThreadSurface } from "./RemainingSurfaces.tsx";
import { Disclosure } from "./primitives.tsx";

const FIRST_THREAD = "thread:j-j";

type ThreadRow = { readonly key: string; readonly value: unknown };

interface ThreadSummary {
  readonly id: string;
  readonly status: string;
  readonly turns: number;
}

function lastStatus(entry: unknown): { readonly status: string; readonly turns: number } {
  if (typeof entry !== "object" || entry === null) return { status: "idle", turns: 0 };
  const record = entry as { readonly runs?: unknown; readonly status?: unknown };
  if (Array.isArray(record.runs)) return { status: String(record.runs.at(-1) ? (record.runs.at(-1) as { status?: unknown }).status ?? "unknown" : "idle"), turns: record.runs.length };
  if (typeof record.status === "string") return { status: record.status, turns: 1 };
  return { status: "idle", turns: 0 };
}

/** Threads known to the durable projections — the same rows a reloaded client reads back. */
function knownThreads(history: readonly ThreadRow[] | undefined, rich: readonly ThreadRow[] | undefined): ThreadSummary[] {
  const byId = new Map<string, ThreadSummary>();
  for (const row of [...(history ?? []), ...(rich ?? [])]) {
    if (!row.key.startsWith("thread/")) continue;
    const id = row.key.slice("thread/".length);
    const { status, turns } = lastStatus(row.value);
    const existing = byId.get(id);
    byId.set(id, existing === undefined ? { id, status, turns } : { id, status: existing.status === "completed" ? existing.status : status, turns: Math.max(existing.turns, turns) });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function Panel({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="panel">
      <h3 className="panel__title">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Journey J-J presentation: one thread carrying mixed turns, plus the thread lifecycle controls —
 * list, new thread, switch back. Every row and every restored message is read from the durable
 * projections, so the lifecycle states here are settlement evidence, not local state.
 */
export function RichThreadView() {
  const client = useCognate();
  const history = useProjection("conversation-thread-history");
  const rich = useProjection("rich-thread");
  const [current, setCurrent] = useState(FIRST_THREAD);
  const [minted, setMinted] = useState(0);
  const [turnError, setTurnError] = useState<string>();

  const threads = knownThreads(history, rich);

  const newThread = () => {
    setTurnError(undefined);
    setMinted((count) => count + 1);
    setCurrent(`${FIRST_THREAD}-${minted + 1}`);
  };

  const richTurn = async () => {
    setTurnError(undefined);
    try {
      await client.startRun(JOURNEY_J_AGENT, { message: "Rich thread turn" }, { correlationId: current });
    } catch (error) {
      setTurnError(`The rich thread turn could not start. ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <>
      <div className="threadbench__column">
        <Panel title={`Thread ${current}`}>
          <div className="actions">
            <span className="actions__label">Threads</span>
            <button type="button" className="btn btn--secondary" onClick={newThread}>
              New thread
            </button>
          </div>
          <Disclosure label="Threads">
            <div className="thread-list">
              {threads.length === 0 ? <p className="hint">No durable threads yet.</p> : null}
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className="thread-row"
                  data-thread-id={thread.id}
                  aria-current={thread.id === current}
                  onClick={() => setCurrent(thread.id)}
                >
                  <span className="thread-row__id">{thread.id}</span>
                  <span className="hint">
                    {thread.status} · {thread.turns} {thread.turns === 1 ? "turn" : "turns"}
                  </span>
                </button>
              ))}
            </div>
          </Disclosure>
        </Panel>

        <Panel title="Conversation">
          <ChatSurface key={current} threadId={current} tenant="tenant-a" />
        </Panel>

        <Panel title="Turns">
          <div className="actions">
            <span className="actions__label">Add turn</span>
            <button type="button" className="btn btn--secondary" onClick={() => void richTurn()}>
              Add rich thread turn
            </button>
          </div>
          <p className="hint">
            The composer above adds a conversation turn; the panels beside it add a controlled
            render and a shared-state write to the same thread. All are durable before they render.
          </p>
          {turnError ? <p className="note">{turnError}</p> : null}
        </Panel>
      </div>

      <div className="threadbench__column">
        <Panel title="Controlled render turn">
          <ControlledRenderingSurface threadId={current} />
        </Panel>
        <Panel title="Shared state turn">
          <SharedStateSurface threadId={current} />
        </Panel>
        <Panel title="Thread replay">
          <RichThreadSurface threadId={current} />
        </Panel>
      </div>
    </>
  );
}
