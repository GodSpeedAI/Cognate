import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Json } from "@cognate/events";
import { useCognate, useContinuations, useProjection } from "@cognate/react";
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
  readonly runId?: string | null;
}

interface EditSummary {
  readonly file_path: string;
  readonly additions: number;
  readonly deletions: number;
  readonly diffLines: readonly string[];
}

interface ChatMessage {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly at?: string;
  readonly tookMs?: number;
  readonly failed?: boolean;
  readonly cancelled?: boolean;
  /** T11 (J-H-provider-error): the terminal `turn.failed` payload — renders "This turn failed" /
   *  message / CODE (reference-behavior-matrix.md §8). */
  readonly failureCode?: string;
  readonly failureMessage?: string;
  /** Final retry count out of `MAX_MODEL_RETRIES` (5) once the turn failed — "Retried model request
   *  (k/5) · Ns" settles at this value (reference-behavior-matrix.md §8). */
  readonly retryCount?: number;
  /** The last successful `edit` tool call this turn made, if any (`10-file-change-*`). */
  readonly editSummary?: EditSummary;
  /** True for the live in-progress preview bubble — suppresses the "Worked"/"Took Ns" status row,
   *  which only makes sense once the turn has actually finished (also what `CognateDriver.waitForIdle`
   *  in the parity-capture suite keys off of — a status row on a still-streaming bubble made it
   *  detect "idle" far too early for a multi-step tool turn; see `tests/drivers/cognate.ts`). */
  readonly streaming?: boolean;
}

interface ToolEntry {
  readonly toolCallId: string;
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly status: "running" | "success" | "failed";
  readonly result?: unknown;
  readonly error?: string;
  readonly approval?: { readonly status: "pending" | "approved" | "denied"; readonly permission?: string; readonly justification?: string };
}

interface PlanTodo {
  readonly content: string;
  readonly status: string;
}

interface PlanStateRow {
  readonly sessionId: string;
  readonly on: boolean;
  readonly todos: readonly PlanTodo[];
  readonly review?: { readonly status: "pending" | "approved" | "changes_requested"; readonly toolCallId: string; readonly heading: string; readonly markdown: string };
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

/** Reads the `plans` projection (`src/projections/plans.ts`) for one session — the To-dos widget,
 *  the plan review card, and the sidebar's "Plan awaiting review <title>" prefix all key off this. */
function usePlanState(sessionId: string | undefined): PlanStateRow | undefined {
  const rows = useProjection("plans");
  return useMemo(() => {
    if (!sessionId) return undefined;
    const row = rows?.find((r) => r.key === sessionId);
    return row ? (row.value as unknown as PlanStateRow) : undefined;
  }, [rows, sessionId]);
}

interface SubagentRowView {
  readonly sessionId: string;
  readonly toolCallId: string;
  readonly title: string;
  readonly desc: string;
  readonly prompt: string;
  readonly status: "running" | "completed" | "failed";
  readonly output?: string;
}

/** J-F-delegation: this session's subagent rows (keyed `${parentRunId}/${toolCallId}` in
 *  `src/projections/subagents.ts` — fire-and-forget delegation has no single parent run to key off
 *  of, so rows are matched by their own `sessionId` field instead) — the banner's "N subagent(s)"
 *  disclosure and the "Subagent sessions" tree (reference-behavior-matrix.md §6.4,
 *  `14b-subagent-completed-panel`). */
function useSubagents(sessionId: string | undefined): readonly SubagentRowView[] {
  const rows = useProjection("subagents");
  return useMemo(() => {
    if (!sessionId) return [];
    return (rows ?? [])
      .map((r) => r.value as unknown as SubagentRowView)
      .filter((r) => r.sessionId === sessionId);
  }, [rows, sessionId]);
}

/** Session ids with a currently-pending plan review — for the sidebar's "Plan awaiting review
 *  <title>" prefix (reference-behavior-matrix.md §6.3, `13b-plan-review-prompt`'s treeitem). */
function usePlanReviewPendingSessions(): ReadonlySet<string> {
  const rows = useProjection("plans");
  return useMemo(() => {
    const set = new Set<string>();
    for (const row of rows ?? []) {
      const value = row.value as unknown as PlanStateRow;
      if (value?.review?.status === "pending") set.add(row.key);
    }
    return set;
  }, [rows]);
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

interface RetryInfo {
  readonly attempt: number;
  readonly maxRetries: number;
  readonly code: string;
  readonly message: string;
}

interface TurnFailure {
  readonly code: string;
  readonly message: string;
}

function useStreamingTurn(runId: string | undefined) {
  const client = useCognate();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "completed" | "failed" | "cancelled">("idle");
  // T11 (J-H-provider-error): recorded `model.request.retried` events for the in-flight run — drives
  // "Retried model request (k/5) · Ns" while retrying and its settled value once failed
  // (reference-behavior-matrix.md §8).
  const [retries, setRetries] = useState<readonly RetryInfo[]>([]);
  const [failure, setFailure] = useState<TurnFailure | undefined>(undefined);
  const attemptRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!runId) {
      setText("");
      setStatus("idle");
      setRetries([]);
      setFailure(undefined);
      return;
    }
    setText("");
    setStatus("streaming");
    setRetries([]);
    setFailure(undefined);
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
      } else if (event.eventType === "model.request.retried") {
        const payload = event.payload as { readonly attempt?: number; readonly maxRetries?: number; readonly error?: { readonly code?: string; readonly message?: string } };
        setRetries((prev) => [
          ...prev,
          {
            attempt: payload.attempt ?? prev.length + 1,
            maxRetries: payload.maxRetries ?? 5,
            code: payload.error?.code ?? "",
            message: payload.error?.message ?? "",
          },
        ]);
      } else if (event.eventType === "turn.failed") {
        const payload = event.payload as { readonly code?: string; readonly message?: string };
        setFailure({ code: payload.code ?? "", message: payload.message ?? "" });
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

  return { text, status, retries, failure };
}

/** Ticks once a second while `active`, purely to re-render "Deep diving for Ns" / "Retried model
 *  request (k/5) · Ns" with a live elapsed time — reference-behavior-matrix.md §8. */
function useElapsedSeconds(active: boolean, startedAtMs: number): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return Math.max(0, Math.round((Date.now() - startedAtMs) / 1000));
}

/** Folds this run's `tool.call.*`/`tool.approval.*` events into an ordered `ToolEntry[]`, keyed by
 *  `toolCallId` (a run's tool loop is sequential, so at most one entry is ever `"running"` at a
 *  time — matching the reference's single "current tool" indicator, e.g. `08-tool-running`). */
function useToolTimeline(runId: string | undefined): readonly ToolEntry[] {
  const client = useCognate();
  const [entries, setEntries] = useState<readonly ToolEntry[]>([]);

  useEffect(() => {
    setEntries([]);
    if (!runId) return;
    const byId = new Map<string, ToolEntry>();
    const flush = () => setEntries([...byId.values()]);
    const unsubscribe = client.subscribe({ runId }, (event) => {
      if (event.eventType === "tool.call.started") {
        const p = event.payload as { readonly toolCallId: string; readonly tool: string; readonly args?: Record<string, unknown> };
        byId.set(p.toolCallId, { toolCallId: p.toolCallId, tool: p.tool, args: p.args ?? {}, status: "running" });
        flush();
      } else if (event.eventType === "tool.call.completed") {
        const p = event.payload as { readonly toolCallId: string; readonly result?: unknown };
        const prev = byId.get(p.toolCallId);
        if (prev) {
          byId.set(p.toolCallId, { ...prev, status: "success", result: p.result });
          flush();
        }
      } else if (event.eventType === "tool.call.failed") {
        const p = event.payload as { readonly toolCallId: string; readonly error?: string };
        const prev = byId.get(p.toolCallId);
        if (prev) {
          byId.set(p.toolCallId, { ...prev, status: "failed", error: p.error });
          flush();
        }
      } else if (event.eventType === "tool.approval.requested") {
        const p = event.payload as { readonly toolCallId: string; readonly permission?: string; readonly justification?: string };
        const prev = byId.get(p.toolCallId);
        if (prev) {
          byId.set(p.toolCallId, { ...prev, approval: { status: "pending", permission: p.permission, justification: p.justification } });
          flush();
        }
      } else if (event.eventType === "tool.approval.decided") {
        const p = event.payload as { readonly toolCallId: string; readonly approved?: boolean };
        const prev = byId.get(p.toolCallId);
        if (prev?.approval) {
          byId.set(p.toolCallId, { ...prev, approval: { ...prev.approval, status: p.approved ? "approved" : "denied" } });
          flush();
        }
      }
    });
    return unsubscribe;
  }, [client, runId]);

  return entries;
}

/** The current/latest tool action's accessible label, matching the reference's single running-tool
 *  button (`08-tool-running`: `button "Reading files · src/greet.ts"` / `"Running code · ..."`). */
function toolActionLabel(entry: ToolEntry): string {
  const args = entry.args;
  if (entry.tool === "read") return `Reading files · ${String(args.file_path ?? "")}`;
  if (entry.tool === "edit") return `Editing files · ${String(args.file_path ?? "")}`;
  if (entry.tool === "bash") return `Running commands · ${String(args.description ?? args.command ?? "")}`;
  if (entry.tool === "run_code") return `Running code · ${String(args.description ?? "")}`;
  // reference-behavior-matrix.md §6.3: `13-plan-active` shows "Updating the plan · todo_write",
  // `13b-plan-review-prompt` shows "Calling tools · exit_plan_mode".
  if (entry.tool === "todo_write") return "Updating the plan · todo_write";
  if (entry.tool === "exit_plan_mode") return "Calling tools · exit_plan_mode";
  // reference-behavior-matrix.md §6.4: `14-subagent-active` shows "Coordinating subagents ·
  // <description>".
  if (entry.tool === "subagent") return `Coordinating subagents · ${String(args.description ?? "")}`;
  return `Running ${entry.tool}`;
}

/** During a run: the "Deep diving..." status plus a plain-text current-tool-action line, matching
 *  the reference's `08-tool-running` (`status: Deep diving...`, `button "Reading files · ..."` is
 *  read here as a plain row, not a modal card — the card only appears once approval is pending, see
 *  `ApprovalBar` below, which replaces the composer the way the reference's does). */
function ToolActivity({ entries, elapsedSeconds }: { readonly entries: readonly ToolEntry[]; readonly elapsedSeconds: number }) {
  const current = entries.length > 0 ? entries[entries.length - 1] : undefined;
  if (!current || current.status !== "running") return null;
  return (
    <div className="tool-activity" data-tool-card>
      <span className="status-pill" role="status">
        <span className="sr-only">Deep diving for {elapsedSeconds}s</span>
      </span>
      <button type="button" className="tool-activity-btn" disabled title={`Deep diving for ${elapsedSeconds}s`}>
        {toolActionLabel(current)}
      </button>
    </div>
  );
}

/** T11 (J-H-provider-error): the collapsed-by-default "Retried model request (k/5) · Ns" row
 *  (reference-behavior-matrix.md §8) — shown while retrying (the latest attempt) and, settled at its
 *  final value, on the failed turn itself. */
function RetryDisclosure({ retries, elapsedSeconds }: { readonly retries: readonly RetryInfo[]; readonly elapsedSeconds: number }) {
  const [expanded, setExpanded] = useState(false);
  if (retries.length === 0) return null;
  const latest = retries[retries.length - 1]!;
  return (
    <div className="retry-disclosure" data-retry-card>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="retry-disclosure-btn">
        Retried model request ({latest.attempt}/{latest.maxRetries}) · {elapsedSeconds}s
        <ChevronDownIcon />
      </button>
      {expanded && (
        <ul className="retry-list">
          {retries.map((r, i) => (
            <li key={i}>
              Attempt {r.attempt}/{r.maxRetries}: {r.message} ({r.code})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** T11 (J-H-provider-error): the terminal failure block — exactly "This turn failed" / message /
 *  a `code` badge (reference-behavior-matrix.md §8). No manual "Retry"/"Dismiss" button; the composer
 *  stays available underneath to start a new message. */
function FailureBlock({ code, message }: { readonly code: string; readonly message: string }) {
  return (
    <div className="failure-block" role="alert">
      <p className="failure-title">This turn failed</p>
      <p className="failure-message">{message}</p>
      <span className="failure-code">{code}</span>
    </div>
  );
}

/** Approval bar: docked where the composer normally sits (reference `11-approval-pending`: the
 *  approval card sits at the bottom of the chat pane, composer hidden underneath it) — exact
 *  strings/buttons/keyboard behavior: Enter = allow once, Escape = reject (characterization's
 *  stated keyboard behavior). */
function ApprovalBar({ entry, onDecide }: { readonly entry: ToolEntry; readonly onDecide: (approved: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div
      className="approval-card"
      data-approval-panel
      tabIndex={-1}
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onDecide(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onDecide(false);
        }
      }}
    >
      <div className="approval-header">
        <span className="approval-dot" aria-hidden="true" />
        <span className="approval-waiting">Waiting for approval</span>
      </div>
      <div role="group" aria-label="Approval details" className="approval-details">
        Allow this operation with {entry.approval?.permission} permissions: {entry.approval?.justification}.
      </div>
      <div className="approval-actions">
        <button type="button" className="approval-btn approval-reject" onClick={() => onDecide(false)}>
          Reject
        </button>
        <button type="button" className="approval-btn approval-allow" onClick={() => onDecide(true)}>
          Allow once
        </button>
      </div>
    </div>
  );
}

/** "To-dos" region: a single summary button (`region "To-dos": button "To-dos N in progress · N
 *  pending"`, reference-behavior-matrix.md §6.3) — renders as soon as `todo_write` has run, under
 *  Standard mode too, and persists after plan mode exits (`13c-plan-completed`). Expandable to the
 *  raw todo list; the reference's own expanded-state content was not captured, so this is this
 *  app's own minimal rendering, not a copy — see DEVIATIONS.md. */
function TodoWidget({ todos }: { readonly todos: readonly PlanTodo[] }) {
  const [expanded, setExpanded] = useState(false);
  if (todos.length === 0) return null;
  const inProgress = todos.filter((t) => t.status === "in_progress").length;
  const pending = todos.filter((t) => t.status === "pending").length;
  return (
    <div role="region" aria-label="To-dos" className="todo-widget">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        To-dos {inProgress} in progress · {pending} pending
      </button>
      {expanded && (
        <ul className="todo-list">
          {todos.map((todo, i) => (
            <li key={i} className={`todo-status-${todo.status}`}>
              {todo.content}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Subagent sessions" tree (J-F-delegation): one row per child, reference-behavior-matrix.md §6.4:
 *  `"<title> · <desc> · continuable · completed · 0 tok · 0s"` + `"Open <title> in sidebar"`. "Open
 *  ... in sidebar" opens the child's transcript in the right-hand panel (`RightPanel` below) — the
 *  only source for it is this row itself (prompt + output), since children are not sessions
 *  (`src/projections/sessions.ts`) and so have no `session.history` of their own to fetch. */
function SubagentTree({ rows, onOpen }: { readonly rows: readonly SubagentRowView[]; readonly onOpen: (row: SubagentRowView) => void }) {
  return (
    <div role="tree" aria-label="Subagent sessions" className="subagent-tree" data-subagent-card>
      {rows.map((row) => (
        <div key={row.toolCallId} role="treeitem" className="subagent-row">
          <span className="subagent-row-text">
            {row.title} · {row.desc} · continuable · {row.status} · 0 tok · 0s
          </span>
          <button type="button" aria-label={`Open ${row.title} in sidebar`} onClick={() => onOpen(row)}>
            Open {row.title} in sidebar
          </button>
        </div>
      ))}
    </div>
  );
}

/** Right-hand panel (reused for J-F-delegation's "Open <title> in sidebar"): the reference's own
 *  right sidebar is otherwise entirely inert this tranche (`DEVIATIONS.md` — "Open right sidebar"),
 *  so this is the first thing to actually populate it; a plan's "View full plan" (J-E-plan) still
 *  renders inline rather than here, unchanged. Shows the child's two-message transcript (its
 *  delegated prompt, its final answer) sourced entirely from its `subagents` projection row. */
function RightPanel({ row, onClose }: { readonly row: SubagentRowView; readonly onClose: () => void }) {
  return (
    <aside className="right-panel" role="tabpanel" aria-label={row.title}>
      <div className="right-panel-tabs" role="tablist">
        <span role="tab" aria-selected="true" className="right-panel-tab">
          {row.title}
          <button type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </span>
      </div>
      <div className="right-panel-body">
        <div className="message message-user">
          <div className="message-bubble">
            <div className="message-body">{row.prompt}</div>
          </div>
        </div>
        {row.status === "completed" ? (
          <div className="message message-assistant">
            <div className="message-body">{row.output}</div>
          </div>
        ) : (
          <p className="empty-state small">{row.status === "failed" ? "Subagent failed." : "Running…"}</p>
        )}
      </div>
    </aside>
  );
}

/** Plan review card (J-E-plan): docked where the composer normally sits, same pattern as
 *  `ApprovalBar` — `region "Approve this plan and leave plan mode?"` (reference-behavior-matrix.md
 *  §6.3, `13b-plan-review-prompt`). The reference also auto-opens the plan in a right-sidebar tab;
 *  this tranche has no right sidebar (`DEVIATIONS.md` — "Open right sidebar" is already inert), so
 *  the full plan is shown inline via "View full plan" instead. */
function PlanReviewCard({
  heading,
  markdown,
  onDecide,
}: {
  readonly heading: string;
  readonly markdown: string;
  readonly onDecide: (approved: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const firstLine = markdown
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("#"));
  return (
    <div className="plan-review-card" data-plan-panel role="region" aria-label="Approve this plan and leave plan mode?">
      <div className="plan-review-header">
        <span className="plan-review-dot" aria-hidden="true" />
        <span className="plan-review-label">Plan review</span>
      </div>
      <button type="button" className="plan-review-disclosure" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        View full plan
      </button>
      <h3 className="plan-review-heading">{heading}</h3>
      {expanded ? (
        <div className="plan-review-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }} />
      ) : (
        firstLine && <p className="plan-review-preview">{firstLine}</p>
      )}
      <div className="plan-review-actions">
        <button type="button" className="plan-review-btn plan-review-changes" onClick={() => onDecide(false)}>
          Request changes
        </button>
        <button type="button" className="plan-review-btn plan-review-approve" onClick={() => onDecide(true)}>
          Approve
        </button>
      </div>
    </div>
  );
}

/** The folded diff view for an `edit` tool call — folds to the first 9 rows, expandable
 *  (`10-file-change-collapsed`/`-expanded`). */
function EditDiff({ summary }: { readonly summary: EditSummary }) {
  const [expanded, setExpanded] = useState(false);
  const rows = summary.diffLines.length > 9 ? summary.diffLines.slice(0, 9) : summary.diffLines;
  return (
    <div className="edit-diff">
      <button type="button" className="edit-diff-toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        View changes to {summary.file_path}: Edited {summary.file_path.split("/").pop()} +{summary.additions} -{summary.deletions}
      </button>
      {expanded && (
        <pre className="edit-diff-body">
          {rows.map((line, i) => (
            <div key={i} className={line.startsWith("+") ? "diff-add" : line.startsWith("-") ? "diff-del" : "diff-ctx"}>
              {line}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
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
  planMode,
  onSend,
  onStop,
  onTogglePlanMode,
}: {
  readonly disabled: boolean;
  readonly sending: boolean;
  readonly modelLabel: string | undefined;
  /** J-E-plan: whether the active session is currently in plan mode — swaps the composer
   *  placeholder and shows the "Plan mode on, press to turn off" toggle (reference-behavior-matrix.md
   *  §6.3, `13-plan-active`). */
  readonly planMode: boolean;
  readonly onSend: (message: string) => void;
  readonly onStop: () => void;
  readonly onTogglePlanMode: () => void;
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
        aria-label={planMode ? "describe your task to generate plan" : "Message or run a task, / commands, @ files or sessions"}
        disabled={disabled}
        placeholder={
          disabled
            ? "Select a workspace and configure a model to start"
            : planMode
              ? "describe your task to generate plan"
              : "Message or run a task, / commands, @ files or sessions"
        }
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
        {planMode && (
          <button type="button" className="plan-mode-toggle" aria-label="Plan mode on, press to turn off" onClick={onTogglePlanMode}>
            Plan
          </button>
        )}
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
          <button type="button" className="send-btn stop" aria-label="Stop generating" onClick={onStop}>
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

function MessageBubble({ message, elapsedSeconds }: { readonly message: ChatMessage; readonly elapsedSeconds?: number }) {
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
      {message.streaming ? (
        <div className="message-status-row">
          <span className="status-pill status-streaming" role="status">
            <span className="sr-only">Deep diving for {elapsedSeconds ?? 0}s</span>
          </span>
        </div>
      ) : (
        <div className="message-status-row">
          <span className={`status-pill${message.failed ? " status-failed" : ""}${message.failed ? " disabled" : ""}`} role="status">
            <span className="sr-only">{message.failed ? "Failed" : message.cancelled ? "Stopped" : "Worked"}</span>
          </span>
          {/* T11 (J-H-cancellation): no duration badge on a stopped turn (reference-behavior-
           *  matrix.md §7 — "no duration badge is shown"). */}
          {!message.cancelled && (
            <button type="button" className="took-btn" disabled>
              Took {Math.max(0, Math.round((message.tookMs ?? 0) / 1000))}s
            </button>
          )}
        </div>
      )}
      {message.failed && message.retryCount !== undefined && (
        <RetryDisclosure
          retries={[{ attempt: message.retryCount, maxRetries: 5, code: message.failureCode ?? "", message: message.failureMessage ?? "" }]}
          elapsedSeconds={Math.max(0, Math.round((message.tookMs ?? 0) / 1000))}
        />
      )}
      <div className="message-divider" />
      <div className="message-body" ref={bodyRef} dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
      <CodeBlocks containerRef={bodyRef} />
      {message.editSummary && <EditDiff summary={message.editSummary} />}
      {message.failed && message.failureMessage && <FailureBlock code={message.failureCode ?? ""} message={message.failureMessage} />}
      {!message.failed && !message.streaming && (
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
  const elapsedSeconds = useElapsedSeconds(streaming.status === "streaming", runStartedAtRef.current);
  const toolEntries = useToolTimeline(activeRunId);
  const { open: openContinuations, resolve: resolveContinuation } = useContinuations(activeRunId);

  // The tool loop is sequential (one call in flight at a time), so at most one `tool-approval`
  // continuation is ever open for a run — match it to the tool entry currently waiting.
  const decideApproval = useCallback(
    async (_toolCallId: string, approved: boolean) => {
      const continuation = openContinuations.find((c) => c.type === "tool-approval");
      if (!continuation) return;
      await resolveContinuation(continuation.id, "resume", { approved });
    },
    [openContinuations, resolveContinuation],
  );
  const pendingApproval = toolEntries.find((e) => e.approval?.status === "pending");

  // J-E-plan: the active session's plan state (`plans` projection) — used for the To-dos widget,
  // the composer's plan-mode placeholder/toggle, and the review card below. A run's tool loop is
  // sequential (same invariant as approvals above), so at most one `plan-review` continuation is
  // ever open at a time.
  const planState = usePlanState(activeSessionId);
  const planReviewPendingSessions = usePlanReviewPendingSessions();

  // J-F-delegation: subagent rows for the active session, plus a local toggle for the banner's "N
  // subagent(s)" disclosure (reference-behavior-matrix.md §6.4).
  const subagentRows = useSubagents(activeSessionId);
  const [subagentsExpanded, setSubagentsExpanded] = useState(false);
  const [openChildToolCallId, setOpenChildToolCallId] = useState<string | undefined>(undefined);
  const openChildRow = subagentRows.find((r) => r.toolCallId === openChildToolCallId);
  const planReviewContinuation = openContinuations.find((c) => c.type === "plan-review");
  const decidePlanReview = useCallback(
    async (approved: boolean) => {
      if (!planReviewContinuation) return;
      await resolveContinuation(planReviewContinuation.id, "resume", { approved });
    },
    [planReviewContinuation, resolveContinuation],
  );

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

  // Remembers the last-open session per workspace (`localStorage`, per-browser only — see Artifact
  // tool's browser-storage guidance; this is a UI convenience, not durable state) so a reload lands
  // back on the same session instead of the empty "no session selected" shell
  // (`17-restored-after-reload`, `11b-approval-pending-after-reload`). The actual run/approval state
  // shown once reopened comes entirely from durable events/projections, not from this key.
  const rememberSession = useCallback((workspaceId: string, sessionId: string) => {
    try {
      localStorage.setItem(`cognate.lastSession.${workspaceId}`, sessionId);
    } catch {
      // best-effort; ignore storage failures (private mode, quota, etc.)
    }
  }, []);

  const openSession = useCallback(
    async (sessionId: string) => {
      setActiveSessionId(sessionId);
      // Reattach to a still-in-flight run (running, or waiting on an approval continuation) so its
      // live tool/approval state survives a reload (`11b-approval-pending-after-reload`) — the
      // `sessions` projection's `runId`/`lastStatus` are durable, so this works after a full
      // restart too, not just a soft reload.
      const row = sessions.find((s) => s.id === sessionId);
      const stillInFlight = row && (row.lastStatus === "running" || row.lastStatus === "waiting") && row.runId;
      setActiveRunId(stillInFlight ? (row.runId as string) : undefined);
      // Reattaching after a reload loses the in-memory "when did this run start" clock — reset it to
      // now rather than leaving it at its initial 0, which would render a nonsensical "Took Ns"
      // duration (`Date.now() - 0`) once the reattached run completes.
      if (stillInFlight) runStartedAtRef.current = Date.now();
      if (row) rememberSession(row.workspaceId, sessionId);
      const history = (await client.invoke("session.history", { sessionId })) as { role: string; content: string }[];
      setTranscript(
        history.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        })),
      );
    },
    [client, sessions, rememberSession],
  );

  // Auto-restore the last-open session for the current workspace on mount/reload (see
  // `rememberSession` above) — `openSession` itself reattaches to any still-in-flight run from
  // durable state, so this is what makes `17-restored-after-reload`/`11b-approval-pending-after-
  // reload` show the same session instead of the empty shell.
  useEffect(() => {
    if (!currentWorkspaceId || activeSessionId) return;
    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem(`cognate.lastSession.${currentWorkspaceId}`);
    } catch {
      remembered = null;
    }
    if (remembered && sessions.some((s) => s.id === remembered)) void openSession(remembered);
  }, [currentWorkspaceId, sessions, activeSessionId, openSession]);

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
      rememberSession(currentWorkspaceId, sessionId);
      const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      // J-E-plan: a leading "/plan " prefix (composer literal-insertion, reference-behavior-
      // matrix.md §6.3) enters plan mode server-side (`agent.coding`'s `plan.mode.changed` event) —
      // mirror the reference's inline notice optimistically here so it appears with this turn
      // rather than waiting a round trip for the `plans` projection to catch up.
      const enteringPlan = /^\/plan\s+\S/i.test(message) && !planState?.on;
      setTranscript((prev) => [
        ...prev,
        ...(enteringPlan ? [{ role: "system" as const, content: "plan · Plan mode on. Use /plan off to leave." }] : []),
        { role: "user", content: message, at },
      ]);
      runStartedAtRef.current = Date.now();
      const view = await client.startRun(
        "agent.coding",
        { sessionId, workspaceId: currentWorkspaceId, message } as unknown as Json,
        { idempotencyKey: crypto.randomUUID(), correlationId: `session:${sessionId}` },
      );
      setActiveRunId(view.runId);
    },
    [client, currentWorkspaceId, activeSessionId, rememberSession, planState?.on],
  );

  const stop = useCallback(async () => {
    if (!activeRunId) return;
    await client.cancelRun(activeRunId, "user-cancelled");
  }, [client, activeRunId]);

  // "Plan mode on, press to turn off" (composer toggle) — equivalent to typing "/plan off" and
  // sending it: a new turn that `agent.coding` handles as a pure control command (no model call).
  const togglePlanMode = useCallback(() => {
    void send("/plan off");
  }, [send]);

  useEffect(() => {
    if (streaming.status === "completed" && streaming.text) {
      const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const tookMs = Date.now() - runStartedAtRef.current;
      // The last successful `edit` this turn made, if any (`10-file-change-collapsed`/`-expanded`).
      const lastEdit = [...toolEntries].reverse().find((e) => e.tool === "edit" && e.status === "success");
      const editSummary = lastEdit ? (lastEdit.result as EditSummary | undefined) : undefined;
      setTranscript((prev) => [...prev, { role: "assistant", content: streaming.text, at, tookMs, editSummary }]);
      setActiveRunId(undefined);
    } else if (streaming.status === "cancelled") {
      // T11 (J-H-cancellation): the partial streamed text is kept, not discarded, with a "Stopped"
      // status pill and no duration badge (reference-behavior-matrix.md §7).
      const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setTranscript((prev) => [...prev, { role: "assistant", content: streaming.text, at, cancelled: true }]);
      setActiveRunId(undefined);
    } else if (streaming.status === "failed") {
      // T11 (J-H-provider-error): "This turn failed" / message / CODE, plus the settled retry
      // disclosure (reference-behavior-matrix.md §8).
      const tookMs = Date.now() - runStartedAtRef.current;
      const retryCount = streaming.retries.length > 0 ? streaming.retries[streaming.retries.length - 1]!.attempt : undefined;
      setTranscript((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "",
          failed: true,
          tookMs,
          retryCount,
          failureCode: streaming.failure?.code,
          failureMessage: streaming.failure?.message,
        },
      ]);
      setActiveRunId(undefined);
    }
  }, [streaming.status, streaming.text, streaming.retries, streaming.failure, toolEntries]);

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
                          <span className="session-row-title">
                            {planReviewPendingSessions.has(session.id) ? "Plan awaiting review " : ""}
                            {session.title || "New Session"}
                          </span>
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
              {subagentRows.length > 0 && (
                <button
                  type="button"
                  className="subagent-count-btn"
                  aria-expanded={subagentsExpanded}
                  onClick={() => setSubagentsExpanded((v) => !v)}
                >
                  {subagentRows.length} subagent{subagentRows.length === 1 ? "" : "s"}
                </button>
              )}
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
                <>
                  <MessageBubble message={{ role: "assistant", content: streaming.text, streaming: true }} elapsedSeconds={elapsedSeconds} />
                  {streaming.retries.length > 0 && <RetryDisclosure retries={streaming.retries} elapsedSeconds={elapsedSeconds} />}
                  <ToolActivity entries={toolEntries} elapsedSeconds={elapsedSeconds} />
                </>
              )}
            </div>
            {planState && planState.todos.length > 0 && <TodoWidget todos={planState.todos} />}
            {pendingApproval ? (
              <ApprovalBar entry={pendingApproval} onDecide={(approved) => decideApproval(pendingApproval.toolCallId, approved)} />
            ) : planReviewContinuation ? (
              <PlanReviewCard
                heading={String((planReviewContinuation.payload as { readonly heading?: string }).heading ?? "")}
                markdown={String((planReviewContinuation.payload as { readonly markdown?: string }).markdown ?? "")}
                onDecide={decidePlanReview}
              />
            ) : (
              <Composer
                disabled={composerDisabled}
                sending={streaming.status === "streaming"}
                modelLabel={modelLabel}
                planMode={Boolean(planState?.on)}
                onSend={send}
                onStop={stop}
                onTogglePlanMode={togglePlanMode}
              />
            )}
            {subagentsExpanded && subagentRows.length > 0 && (
              <SubagentTree rows={subagentRows} onOpen={(row) => setOpenChildToolCallId(row.toolCallId)} />
            )}
          </>
        )}
      </main>
      {openChildRow && <RightPanel row={openChildRow} onClose={() => setOpenChildToolCallId(undefined)} />}
      {showSettings && <SettingsModels onClose={() => setShowSettings(false)} />}
    </div>
  );
}
