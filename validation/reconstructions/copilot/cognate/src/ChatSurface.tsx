import { useCognate, useProjection, useRun } from "@cognate/react";
import { CognateShell } from "@cognate/ui-astryx";
import { type FormEvent, useState } from "react";
import { DEFAULT_THREAD_ID, JOURNEY_A_AGENT } from "./constants.ts";

/** Inline Astryx projection of J-A. The runtime event fold remains the message authority. */
export function ChatSurface({ threadId = DEFAULT_THREAD_ID, tenant = "tenant-a" }: { readonly threadId?: string; readonly tenant?: string }) {
  const client = useCognate();
  const [draft, setDraft] = useState("");
  const [runId, setRunId] = useState<string>();
  const run = useRun(runId);
  const histories = useProjection("conversation-thread-history");
  // RuntimeService removes the authenticated tenant prefix before exposing a public projection.
  const history = histories?.find((entry) => entry.key === `thread/${threadId}`)?.value as { runs?: readonly { status: string; text: string }[] } | undefined;
  const restored = history?.runs?.at(-1);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft;
    setDraft("");
    const started = await client.startRun(JOURNEY_A_AGENT, { message }, { correlationId: threadId });
    setRunId(started.runId);
  };

  return (
    <CognateShell title="Cognate Chat">
      <form onSubmit={(event) => void submit(event)}>
        <label>
          <span className="sr-only">Message</span>
          <input aria-label="Message" value={draft} placeholder="Message the assistant" onChange={(event) => setDraft(event.target.value)} />
        </label>
        <button type="submit">Send</button>
      </form>
      <p aria-live="polite" aria-label="Assistant response">{run?.text ?? restored?.text ?? ""}</p>
      <p aria-label="Conversation settlement">{run?.status === "completed" || restored?.status === "completed" ? "Conversation complete" : "Conversation ready"}</p>
    </CognateShell>
  );
}
