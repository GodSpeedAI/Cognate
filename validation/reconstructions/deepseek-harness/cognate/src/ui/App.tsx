import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Json } from "@cognate/events";
import { useCognate, useProjection } from "@cognate/react";
import { renderMarkdown } from "./markdown.ts";

interface WorkspaceRow {
  readonly id: string;
  readonly path: string;
  readonly title: string;
}

interface SessionRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly lastStatus: string;
  readonly updatedAt: string;
}

interface ChatMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

interface ModelConfigRow {
  readonly providerId: string;
  readonly baseURL: string;
  readonly protocol: string;
  readonly model: string;
  readonly configuredAt: string;
}

function useCurrentWorkspaceId(): string | undefined {
  const rows = useProjection("workspaces");
  const current = rows?.find((r) => r.key === "current");
  return typeof current?.value === "string" ? current.value : undefined;
}

function useWorkspaces(): readonly WorkspaceRow[] {
  const rows = useProjection("workspaces");
  return useMemo(
    () => (rows ?? []).filter((r) => r.key.startsWith("record/")).map((r) => r.value as unknown as WorkspaceRow),
    [rows],
  );
}

function useSessions(): readonly SessionRow[] {
  const rows = useProjection("sessions");
  return useMemo(
    () =>
      (rows ?? [])
        .map((r) => r.value as unknown as SessionRow)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [rows],
  );
}

function useModelConfig(): ModelConfigRow | undefined {
  const rows = useProjection("model-config");
  const current = rows?.find((r) => r.key === "current");
  return current ? (current.value as unknown as ModelConfigRow) : undefined;
}

function WorkspaceChooser() {
  const client = useCognate();
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      // The `workspaces` projection (subscribed via useProjection) picks up `workspace.selected`
      // as soon as it commits — no local state needed here.
      await client.invoke("workspace.select", { path });
      setPath("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [client, path]);

  return (
    <div className="workspace-chooser">
      <p className="empty-state">Unable to create default workspace. Use Choose workspace to select a folder.</p>
      <input
        aria-label="Workspace directory path"
        placeholder="/path/to/project"
        value={path}
        onChange={(e) => setPath(e.currentTarget.value)}
      />
      <button type="button" disabled={busy || path.trim().length === 0} onClick={submit}>
        Choose workspace
      </button>
      {error && <p role="alert" className="form-error">{error}</p>}
    </div>
  );
}

function SettingsModels({ onClose }: { readonly onClose: () => void }) {
  const client = useCognate();
  const config = useModelConfig();
  const [providerId, setProviderId] = useState(config?.providerId ?? "custom");
  const [baseURL, setBaseURL] = useState(config?.baseURL ?? "");
  const [model, setModel] = useState(config?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      if (!providerId || !baseURL || !model) throw new Error("Provider id, base URL, and model are required.");
      await client.invoke("model.configure", { providerId, baseURL, protocol: "openai-compatible", model, apiKey });
      setSaved(true);
      setApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [client, providerId, baseURL, model, apiKey]);

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Settings">
      <div className="modal settings-models">
        <h2>Settings &rsaquo; Models</h2>
        <p className="settings-subtitle">Custom Model API</p>
        <label>
          Provider id
          <input value={providerId} onChange={(e) => setProviderId(e.currentTarget.value)} />
        </label>
        <label>
          Base URL
          <input value={baseURL} onChange={(e) => setBaseURL(e.currentTarget.value)} placeholder="http://127.0.0.1:4010/v1" />
        </label>
        <label>
          Protocol
          <input value="openai-compatible" disabled />
        </label>
        <label>
          Model
          <input value={model} onChange={(e) => setModel(e.currentTarget.value)} placeholder="mock-model-1" />
        </label>
        <label>
          API key
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.currentTarget.value)} placeholder={config ? "•••••••• (redacted after save)" : ""} />
        </label>
        {error && <p role="alert" className="form-error">{error}</p>}
        {saved && <p className="form-success">Saved. Model changes take effect on the next request.</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
          <button type="button" disabled={busy} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function useStreamingTurn(runId: string | undefined) {
  const client = useCognate();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "completed" | "failed">("idle");
  const attemptRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!runId) {
      setText("");
      setStatus("idle");
      return;
    }
    setText("");
    setStatus("streaming");
    attemptRef.current = undefined;
    const unsubscribe = client.subscribe({ runId }, (event) => {
      if (event.eventType === "run.invocation.progress") {
        const attempt = (event.metadata as { readonly attempt?: number } | undefined)?.attempt ?? 0;
        const payload = event.payload as { readonly kind?: string; readonly text?: string };
        if (payload.kind !== "text" || typeof payload.text !== "string") return;
        if (attemptRef.current === undefined || attempt > attemptRef.current) {
          attemptRef.current = attempt;
          setText(payload.text);
        } else if (attempt === attemptRef.current) {
          setText((prev) => prev + payload.text!);
        }
        // deltas from a superseded (lower) attempt are discarded
      } else if (event.eventType === "message.completed") {
        const payload = event.payload as { readonly text?: string };
        if (typeof payload.text === "string") setText(payload.text);
        setStatus("completed");
      } else if (event.eventType === "run.failed" || event.eventType === "run.cancelled") {
        setStatus("failed");
      }
    });
    return unsubscribe;
  }, [client, runId]);

  return { text, status };
}

function Composer({
  disabled,
  onSend,
}: {
  readonly disabled: boolean;
  readonly onSend: (message: string) => void;
}) {
  const [message, setMessage] = useState("");
  const submit = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setMessage("");
  }, [message, onSend]);
  return (
    <div className="composer">
      <textarea
        aria-label="Message"
        disabled={disabled}
        placeholder={disabled ? "Select a workspace and configure a model to start" : "Send a message"}
        value={message}
        onChange={(e) => setMessage(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button type="button" disabled={disabled || message.trim().length === 0} onClick={submit}>
        Send
      </button>
    </div>
  );
}

export function App() {
  const client = useCognate();
  const workspaces = useWorkspaces();
  const sessions = useSessions();
  const modelConfig = useModelConfig();
  const currentWorkspaceId = useCurrentWorkspaceId();

  const [showSettings, setShowSettings] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);
  const [transcript, setTranscript] = useState<readonly ChatMessage[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);
  const streaming = useStreamingTurn(activeRunId);

  const composerDisabled = !currentWorkspaceId || !modelConfig;

  const openSession = useCallback(
    async (sessionId: string) => {
      setActiveSessionId(sessionId);
      setActiveRunId(undefined);
      const history = (await client.invoke("session.history", { sessionId })) as { role: string; content: string }[];
      setTranscript(history.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })));
    },
    [client],
  );

  const newSession = useCallback(() => {
    setActiveSessionId(crypto.randomUUID());
    setActiveRunId(undefined);
    setTranscript([]);
  }, []);

  const send = useCallback(
    async (message: string) => {
      if (!currentWorkspaceId) return;
      const sessionId = activeSessionId ?? crypto.randomUUID();
      if (!activeSessionId) setActiveSessionId(sessionId);
      setTranscript((prev) => [...prev, { role: "user", content: message }]);
      const view = await client.startRun(
        "agent.coding",
        { sessionId, workspaceId: currentWorkspaceId, message } as unknown as Json,
        { idempotencyKey: crypto.randomUUID(), correlationId: `session:${sessionId}` },
      );
      setActiveRunId(view.runId);
    },
    [client, currentWorkspaceId, activeSessionId],
  );

  useEffect(() => {
    if (streaming.status === "completed" && streaming.text) {
      setTranscript((prev) => [...prev, { role: "assistant", content: streaming.text }]);
      setActiveRunId(undefined);
    }
  }, [streaming.status, streaming.text]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="app-title">DeepSeek Harness</span>
          <button type="button" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </div>
        <button type="button" className="new-session" onClick={newSession} disabled={!currentWorkspaceId}>
          New Session
        </button>
        <div className="workspace-summary">
          {currentWorkspaceId ? (
            <span title={workspaces.find((w) => w.id === currentWorkspaceId)?.path}>
              {workspaces.find((w) => w.id === currentWorkspaceId)?.title ?? currentWorkspaceId}
            </span>
          ) : (
            <span className="muted">No workspace selected</span>
          )}
        </div>
        <nav className="session-list" aria-label="Sessions">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={session.id === activeSessionId ? "session-row active" : "session-row"}
              onClick={() => openSession(session.id)}
              title={session.title}
            >
              {session.title || "New Session"}
            </button>
          ))}
        </nav>
      </aside>
      <main className="center-column">
        {!currentWorkspaceId ? (
          <WorkspaceChooser />
        ) : (
          <>
            <div className="messages">
              {transcript.map((message, index) => (
                <div key={index} className={`message message-${message.role}`}>
                  <div className="message-role">{message.role === "user" ? "You" : "Assistant"}</div>
                  <div className="message-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
                </div>
              ))}
              {streaming.status === "streaming" && (
                <div className="message message-assistant streaming">
                  <div className="message-role">Assistant</div>
                  <div className="message-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(streaming.text) }} />
                </div>
              )}
            </div>
            <Composer disabled={composerDisabled} onSend={send} />
          </>
        )}
      </main>
      {showSettings && <SettingsModels onClose={() => setShowSettings(false)} />}
    </div>
  );
}
