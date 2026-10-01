import { useCognate, useProjection, useRun } from "@cognate/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { DEFAULT_THREAD_ID, JOURNEY_A_AGENT } from "./constants.ts";
import { Disclosure, Note } from "./ui/primitives.tsx";

type HistoryRun = { readonly runId: string; readonly status: string; readonly text: string };
type Turn = { readonly key: string; readonly role: "you" | "assistant"; readonly text: string };

/**
 * Inline transcript of J-A. The durable `conversation-thread-history` projection
 * remains the message authority: a reloaded client renders from it alone. Local
 * turns exist only to pair each request with its reply while this client lives,
 * and every one is reconciled against the projection rather than replacing it.
 */
export function ChatSurface({ threadId = DEFAULT_THREAD_ID, tenant = "tenant-a" }: { readonly threadId?: string; readonly tenant?: string }) {
  const client = useCognate();
  const [draft, setDraft] = useState("");
  const [runId, setRunId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [asked, setAsked] = useState<readonly { readonly runId: string; readonly text: string }[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const run = useRun(runId);
  const histories = useProjection("conversation-thread-history");

  // RuntimeService removes the authenticated tenant prefix before exposing a public projection.
  const history = histories?.find((entry) => entry.key === `thread/${threadId}`)?.value as { readonly runs?: readonly HistoryRun[] } | undefined;
  const restored = history?.runs;
  // Settlement is read from the live run when this client started it, and otherwise from the
  // durable projection, so a reloaded client reports the same terminal state.
  const liveStatus = run?.status;
  const projectedStatus = runId === undefined ? restored?.at(-1)?.status : restored?.find((entry) => entry.runId === runId)?.status;
  const effectiveStatus = liveStatus ?? projectedStatus;
  const settled = effectiveStatus === "completed" || effectiveStatus === "failed";
  const liveText = run?.text ?? "";

  const turns: Turn[] = [];
  for (const entry of asked) {
    turns.push({ key: `you-${entry.runId}`, role: "you", text: entry.text });
    const match = (restored ?? []).find((candidate) => candidate.runId === entry.runId);
    const reply = match?.text || (entry.runId === runId ? liveText : "");
    if (reply) turns.push({ key: `ai-${entry.runId}`, role: "assistant", text: reply });
  }
  // The projection records each run's reply but not the prompt that caused it, so a run from an
  // earlier session cannot be paired with a user turn. Rendering those as bare assistant messages
  // would read as a stutter bug, so they are surfaced as history instead of as phantom turns.
  const earlier = (restored ?? []).filter((candidate) => !asked.some((local) => local.runId === candidate.runId));

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns.length, liveText]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft;
    if (pending) return;
    setDraft("");
    setFailure(undefined);
    setPending(true);
    try {
      const started = await client.startRun(JOURNEY_A_AGENT, { message }, { correlationId: threadId });
      setAsked((previous) => [...previous, { runId: started.runId, text: message }]);
      setRunId(started.runId);
    } catch (error) {
      setDraft(message);
      setFailure(`The runtime did not accept that message. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPending(false);
    }
  };

  const settlement =
    effectiveStatus === "failed"
      ? "Conversation failed"
      : turns.length === 0 && earlier.length === 0
        ? "No conversation yet"
        : settled
          ? "Conversation complete"
          : "Conversation in progress";
  const responseText = run?.text ?? restored?.at(-1)?.text ?? "";

  return (
    <div className="transcript">
      <div className="transcript__log" ref={logRef} role="log" aria-label="Conversation turns">
        {earlier.length > 0 ? (
          <div className="transcript__earlier">
            <p className="hint">
              {earlier.length} earlier {earlier.length === 1 ? "reply" : "replies"} in this thread
              {turns.length > 0 ? ", from before this session." : "."}
            </p>
            <Disclosure label="Show earlier replies">
              {earlier.map((entry) => (
                <p className="turn__text" key={`ai-${entry.runId}`}>
                  {entry.text}
                </p>
              ))}
            </Disclosure>
          </div>
        ) : null}
        {turns.length === 0 && earlier.length === 0 ? (
          <p className="empty">
            No messages yet. Send one and the reply arrives as durable events, not as a
            terminal-only result.
          </p>
        ) : (
          turns.map((turn) => (
            <article key={turn.key} className={turn.role === "you" ? "turn turn--user" : "turn"}>
              <span className="turn__role">{turn.role === "you" ? "You" : "Assistant"}</span>
              <p className="turn__text">{turn.text}</p>
            </article>
          ))
        )}
        {pending && liveText === "" && turns.length > 0 ? <p className="hint">Waiting for the first token…</p> : null}

      </div>

      {failure ? <Note>{failure}</Note> : null}

      <form className="composer" onSubmit={(event) => void submit(event)}>
        <div className="composer__field">
          <label className="sr-only" htmlFor="chat-message">
            Message
          </label>
          <input
            id="chat-message"
            className="composer__input"
            value={draft}
            placeholder="Message the assistant"
            autoComplete="off"
            disabled={pending}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <button type="submit" className="btn btn--primary" disabled={pending} aria-busy={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
      </form>

      <div className="transcript__status">
        <span className="sr-only" id="chat-settlement-label">
          Conversation settlement
        </span>
        <output aria-labelledby="chat-settlement-label" aria-live="polite">
          {settlement}
        </output>
        <span aria-hidden="true">·</span>
        <span className="hint">thread {threadId}</span>
      </div>

      {/* Journey evidence mirror. The visible transcript above is the reading surface; this
          single named output keeps the durable response assertable without an aria-label
          replacing the readable text of a visible element. */}
      <output aria-label="Assistant response" hidden>
        {responseText}
      </output>

      <Disclosure label="Under the hood">
        <p className="hint">
          Agent <code>{JOURNEY_A_AGENT}</code> for tenant <code>{tenant}</code>, projected into <code>conversation-thread-history</code>.
        </p>
      </Disclosure>
    </div>
  );
}
