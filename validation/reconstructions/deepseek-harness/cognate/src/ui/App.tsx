import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Json } from "@cognate/events";
import { useCognate, useProjection } from "@cognate/react";
import { renderMarkdown } from "./markdown.ts";
import {
  BranchIcon,
  ChevronDownIcon,
  CollapseIcon,
  CopyIcon,
  GearIcon,
  LogoIcon,
  MoonIcon,
  PanelRightIcon,
  PluginIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  SlidersIcon,
  StopIcon,
  SunIcon,
  ThumbDownIcon,
  ThumbUpIcon,
} from "./icons.tsx";

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
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly at?: string;
  readonly tookMs?: number;
  readonly failed?: boolean;
  readonly cancelled?: boolean;
}

interface ModelConfigRow {
  readonly providerId: string;
  readonly baseURL: string;
  readonly protocol: string;
  readonly model: string;
  readonly configuredAt: string;
}

const NOT_IMPLEMENTED = "Not implemented in this tranche — see APP/DEVIATIONS.md";

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

/** "just now" / "2m" / "3h" / "5d" — same rough granularity as the reference's session-tree
 * relative-time suffix (see reference/observations/aria/15-completed-session.desktop.txt: a
 * session row name ends in a relative-time word like "now"). */
function relativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((nowMs - then) / 1000));
  if (diffSec < 45) return "now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}d`;
}

function useTheme(): readonly [string, () => void] {
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem("cognate.theme") ?? "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("cognate.theme", theme);
    } catch {
      // best-effort only — a private/blocked storage context just loses the preference
    }
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return [theme, toggle] as const;
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
      <div className="workspace-chooser-card">
        <p role="alert" className="empty-state">
          Unable to create default workspace. Use Choose workspace to select a folder.
        </p>
        <input
          aria-label="Workspace directory path"
          placeholder="/path/to/project"
          value={path}
          onChange={(e) => setPath(e.currentTarget.value)}
        />
        <button type="button" disabled={busy || path.trim().length === 0} onClick={submit}>
          Choose workspace
        </button>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
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
      <div className="modal settings-panel">
        <div className="settings-titlebar">
          <h2>Settings</h2>
        </div>
        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            <button type="button" className="settings-nav-item" disabled title={NOT_IMPLEMENTED}>
              General
            </button>
            <button type="button" className="settings-nav-item active" aria-current="page">
              Models
            </button>
            <button type="button" className="settings-nav-item" disabled title={NOT_IMPLEMENTED}>
              Built-in plugins
            </button>
            <button type="button" className="settings-nav-item" disabled title={NOT_IMPLEMENTED}>
              Agent presets
            </button>
          </nav>
          <div className="settings-content">
            <h3>Models</h3>
            <p className="settings-subtitle">Enter your API key to use models from the following provider.</p>
            <div className="provider-card">
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
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.currentTarget.value)}
                  placeholder={config ? "Configured — enter a new value to replace" : ""}
                />
              </label>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              {saved && <p className="form-success">Saved. Model changes take effect on the next request.</p>}
            </div>
            <button type="button" className="add-provider-btn" disabled title={NOT_IMPLEMENTED}>
              <PlusIcon /> Add model provider
            </button>
          </div>
        </div>
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
  const [status, setStatus] = useState<"idle" | "streaming" | "completed" | "failed" | "cancelled">("idle");
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
      } else if (event.eventType === "run.cancelled") {
        setStatus("cancelled");
      } else if (event.eventType === "run.failed") {
        setStatus("failed");
      }
    });
    return unsubscribe;
  }, [client, runId]);

  return { text, status };
}

function CodeBlocks({ containerRef }: { readonly containerRef: React.RefObject<HTMLDivElement | null> }) {
  // Fenced code blocks come back from renderMarkdown() as plain
  // `<pre class="code-block" data-lang="...">` nodes (see ./markdown.ts) — they need a language
  // label + "Wrap lines" / "Copy" controls added after the fact, since dangerouslySetInnerHTML
  // can't carry React event handlers. Runs after every render; idempotent via a data attribute.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const blocks = root.querySelectorAll<HTMLPreElement>("pre.code-block:not([data-enhanced])");
    blocks.forEach((pre) => {
      pre.setAttribute("data-enhanced", "1");
      const lang = pre.getAttribute("data-lang") || "text";
      const header = document.createElement("div");
      header.className = "code-block-header";
      const label = document.createElement("span");
      label.className = "code-block-lang";
      label.textContent = lang;
      const wrapBtn = document.createElement("button");
      wrapBtn.type = "button";
      wrapBtn.className = "code-block-action";
      wrapBtn.setAttribute("aria-label", "Wrap lines");
      wrapBtn.setAttribute("aria-pressed", "true");
      wrapBtn.textContent = "Wrap lines";
      pre.classList.add("wrap-lines");
      wrapBtn.addEventListener("click", () => {
        const wrapped = pre.classList.toggle("wrap-lines");
        wrapBtn.setAttribute("aria-pressed", String(wrapped));
      });
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "code-block-action";
      copyBtn.setAttribute("aria-label", "Copy");
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", () => {
        const code = pre.querySelector("code")?.textContent ?? "";
        navigator.clipboard?.writeText(code).catch(() => {});
      });
      header.append(label, wrapBtn, copyBtn);
      pre.parentElement?.insertBefore(header, pre);
    });
  });
  return null;
}

function Composer({
  disabled,
  sending,
  modelLabel,
  onSend,
  onStop,
}: {
  readonly disabled: boolean;
  readonly sending: boolean;
  readonly modelLabel: string | undefined;
  readonly onSend: (message: string) => void;
  readonly onStop: () => void;
}) {
  const [message, setMessage] = useState("");
  const submit = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setMessage("");
  }, [message, onSend]);
  return (
    <div className="composer-card">
      <textarea
        aria-label="Message or run a task, / commands, @ files or sessions"
        disabled={disabled}
        placeholder={disabled ? "Select a workspace and configure a model to start" : "Message or run a task, / commands, @ files or sessions"}
        value={message}
        onChange={(e) => setMessage(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="composer-toolbar">
        <button type="button" className="icon-btn" aria-label="Add files or run commands" disabled title={NOT_IMPLEMENTED}>
          <PlusIcon />
        </button>
        <button type="button" className="dropdown-btn" aria-label="Access mode, current: Workspace Write" disabled title={NOT_IMPLEMENTED}>
          Workspace Write
          <ChevronDownIcon />
        </button>
        <button
          type="button"
          className="dropdown-btn"
          aria-label={`Select model, current ${modelLabel ?? "none"}`}
          disabled
          title={NOT_IMPLEMENTED}
        >
          {modelLabel ?? "No model"}
          <ChevronDownIcon />
        </button>
        <div className="composer-spacer" />
        {sending ? (
          <button type="button" className="send-btn stop" aria-label="Stop" onClick={onStop}>
            <StopIcon />
          </button>
        ) : (
          <button
            type="button"
            className="send-btn"
            aria-label="Send message"
            disabled={disabled || message.trim().length === 0}
            onClick={submit}
          >
            <SendIcon />
          </button>
        )}
      </div>
      <div className="composer-stats">
        <span className="stat-chip" title={NOT_IMPLEMENTED}>
          0 turns 0 steps · 0 tok/s
        </span>
        <span className="stat-chip" title={NOT_IMPLEMENTED}>
          0% of context used
        </span>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { readonly message: ChatMessage }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  if (message.role === "system") {
    return (
      <div className="message message-system" role="status">
        {message.content}
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="message message-user">
        <div className="message-bubble">
          <div className="message-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
        </div>
        <div className="message-meta">
          <button type="button" className="meta-action" aria-label="Copy" title="Copy">
            <CopyIcon />
          </button>
          {message.at && <span className="meta-time">{message.at}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={`message message-assistant${message.failed ? " message-failed" : ""}`}>
      <div className="message-status-row">
        <span className={`status-pill${message.failed ? " status-failed" : ""}`} role="status">
          <span className="sr-only">{message.failed ? "Failed" : message.cancelled ? "Stopped" : "Worked"}</span>
        </span>
        <button type="button" className="took-btn" disabled>
          Took {Math.max(0, Math.round((message.tookMs ?? 0) / 1000))}s
        </button>
      </div>
      <div className="message-divider" />
      <div className="message-body" ref={bodyRef} dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
      <CodeBlocks containerRef={bodyRef} />
      {!message.failed && (
        <div className="message-actions">
          <button type="button" className="meta-action" aria-label="Copy" title="Copy">
            <CopyIcon />
          </button>
          <button type="button" className="meta-action" aria-label="Good response" title={NOT_IMPLEMENTED} disabled>
            <ThumbUpIcon />
          </button>
          <button type="button" className="meta-action" aria-label="Bad response" title={NOT_IMPLEMENTED} disabled>
            <ThumbDownIcon />
          </button>
          <button type="button" className="meta-action" aria-label="Branch into a new conversation" title={NOT_IMPLEMENTED} disabled>
            <BranchIcon />
          </button>
          <span className="usage-chip" title={NOT_IMPLEMENTED}>
            Usage 0 tok
          </span>
          {message.at && <span className="meta-time">{message.at}</span>}
        </div>
      )}
    </div>
  );
}

export function App() {
  const client = useCognate();
  const workspaces = useWorkspaces();
  const sessions = useSessions();
  const modelConfig = useModelConfig();
  const currentWorkspaceId = useCurrentWorkspaceId();
  const [theme, toggleTheme] = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);
  const [transcript, setTranscript] = useState<readonly ChatMessage[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);
  const runStartedAtRef = useRef<number>(0);
  const streaming = useStreamingTurn(activeRunId);

  // Sidebar auto-collapses below 1024px viewport width, matching the reference's
  // SIDEBAR_AUTO_COLLAPSE breakpoint (product-characterization.md §2); a manual toggle can still
  // re-expand it over a squeezed center column.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const apply = () => setCollapsed(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const composerDisabled = !currentWorkspaceId || !modelConfig;
  const currentSession = sessions.find((s) => s.id === activeSessionId);
  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId);

  const openSession = useCallback(
    async (sessionId: string) => {
      setActiveSessionId(sessionId);
      setActiveRunId(undefined);
      const history = (await client.invoke("session.history", { sessionId })) as { role: string; content: string }[];
      setTranscript(
        history.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        })),
      );
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
      const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setTranscript((prev) => [...prev, { role: "user", content: message, at }]);
      runStartedAtRef.current = Date.now();
      const view = await client.startRun(
        "agent.coding",
        { sessionId, workspaceId: currentWorkspaceId, message } as unknown as Json,
        { idempotencyKey: crypto.randomUUID(), correlationId: `session:${sessionId}` },
      );
      setActiveRunId(view.runId);
    },
    [client, currentWorkspaceId, activeSessionId],
  );

  const stop = useCallback(async () => {
    if (!activeRunId) return;
    await client.cancelRun(activeRunId, "user-cancelled");
  }, [client, activeRunId]);

  useEffect(() => {
    if (streaming.status === "completed" && streaming.text) {
      const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const tookMs = Date.now() - runStartedAtRef.current;
      setTranscript((prev) => [...prev, { role: "assistant", content: streaming.text, at, tookMs }]);
      setActiveRunId(undefined);
    } else if (streaming.status === "cancelled") {
      setTranscript((prev) => [...prev, { role: "system", content: "Stopped" }]);
      setActiveRunId(undefined);
    } else if (streaming.status === "failed") {
      setTranscript((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong while generating this response.", failed: true },
      ]);
      setActiveRunId(undefined);
    }
  }, [streaming.status, streaming.text]);

  const modelLabel = modelConfig ? `${modelConfig.model}` : undefined;
  const sessionTitle = currentSession?.title || "New Session";
  const breadcrumbTitle = sessionTitle.length > 64 ? `${sessionTitle.slice(0, 63)}…` : sessionTitle;

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
        <div className="sidebar-top">
          <div className="brand">
            <LogoIcon />
            {!collapsed && (
              <span className="brand-text">
                Cognate
                <span className="brand-chip">Local Build</span>
              </span>
            )}
          </div>
          <button type="button" className="icon-btn" aria-label="Collapse sidebar" onClick={() => setCollapsed((c) => !c)}>
            <CollapseIcon />
          </button>
        </div>

        <button type="button" className="new-session-btn" aria-label="New session" onClick={newSession} disabled={!currentWorkspaceId}>
          <PlusIcon />
          {!collapsed && "New Session"}
        </button>

        <nav aria-label="Global panels" className="global-panels">
          <button type="button" className="icon-btn" aria-label="Plugins" disabled title={NOT_IMPLEMENTED}>
            <PluginIcon />
            {!collapsed && <span>Plugins</span>}
          </button>
        </nav>

        {!collapsed && (
          <div className="workspaces-section">
            <div className="workspaces-header">
              <span>Workspaces</span>
              <div className="workspaces-actions">
                <button type="button" className="icon-btn" aria-label="Search sessions" disabled title={NOT_IMPLEMENTED}>
                  <SearchIcon />
                </button>
                <button type="button" className="icon-btn" aria-label="View options" disabled title={NOT_IMPLEMENTED}>
                  <SlidersIcon />
                </button>
                <button type="button" className="icon-btn" aria-label="Add workspace" disabled title={NOT_IMPLEMENTED}>
                  <PlusIcon />
                </button>
              </div>
            </div>
            <div role="tree" aria-label="Sessions" className="session-tree">
              {currentWorkspace ? (
                <div role="treeitem" aria-expanded="true" className="workspace-row">
                  <span className="workspace-row-label" title={currentWorkspace.path}>
                    {currentWorkspace.title || currentWorkspace.id}
                  </span>
                  <div className="session-rows">
                    {sessions
                      .filter((s) => s.workspaceId === currentWorkspaceId)
                      .map((session) => (
                        <button
                          key={session.id}
                          type="button"
                          role="treeitem"
                          aria-selected={session.id === activeSessionId}
                          className={session.id === activeSessionId ? "session-row active" : "session-row"}
                          onClick={() => openSession(session.id)}
                          title={session.title}
                        >
                          <span className="session-row-title">{session.title || "New Session"}</span>
                          <span className="session-row-time">{relativeTime(session.updatedAt)}</span>
                        </button>
                      ))}
                  </div>
                </div>
              ) : (
                <p className="empty-state small">No workspace selected</p>
              )}
            </div>
          </div>
        )}

        <div className="sidebar-bottom">
          <button type="button" className="icon-btn" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={toggleTheme}>
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            {!collapsed && <span>{theme === "dark" ? "Light theme" : "Dark theme"}</span>}
          </button>
          <button type="button" className="icon-btn" aria-label="Settings" onClick={() => setShowSettings(true)}>
            <GearIcon />
            {!collapsed && <span>Settings</span>}
          </button>
        </div>
      </aside>

      <main className="center-column">
        {!currentWorkspaceId ? (
          <WorkspaceChooser />
        ) : (
          <>
            <header className="session-header">
              <nav aria-label="Session hierarchy" className="breadcrumb">
                {breadcrumbTitle}
              </nav>
              <span className="mode-badge">Standard mode</span>
              <div className="header-actions">
                <button type="button" disabled title={NOT_IMPLEMENTED}>
                  Open in Files
                </button>
                <button type="button" disabled title={NOT_IMPLEMENTED}>
                  More ways to open
                </button>
                <button type="button" className="icon-btn" disabled title={NOT_IMPLEMENTED} aria-label="More actions">
                  &hellip;
                </button>
                <button type="button" className="icon-btn" disabled title={NOT_IMPLEMENTED} aria-label="Open right sidebar">
                  <PanelRightIcon />
                </button>
              </div>
              <div role="tablist" className="tabs">
                <button type="button" role="tab" aria-selected="true" className="tab active">
                  Chat
                </button>
                <button type="button" role="tab" aria-selected="false" className="tab" disabled title={NOT_IMPLEMENTED}>
                  Trajectory
                </button>
              </div>
            </header>
            <div className="messages">
              {transcript.length === 0 && streaming.status === "idle" && <p className="empty-state">Start the conversation below.</p>}
              {transcript.map((message, index) => (
                <MessageBubble key={index} message={message} />
              ))}
              {streaming.status === "streaming" && (
                <MessageBubble message={{ role: "assistant", content: streaming.text }} />
              )}
            </div>
            <Composer disabled={composerDisabled} sending={streaming.status === "streaming"} modelLabel={modelLabel} onSend={send} onStop={stop} />
          </>
        )}
      </main>
      {showSettings && <SettingsModels onClose={() => setShowSettings(false)} />}
    </div>
  );
}
