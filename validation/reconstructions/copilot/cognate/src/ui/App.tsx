import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useCognate, useConnectionStatus, useRun } from "@cognate/react";
import { ChatSurface } from "../ChatSurface.tsx";
import { SharedStateSurface } from "../SharedStateSurface.tsx";
import { RemoteCapabilitySurface } from "./RemoteCapabilitySurface.tsx";
import {
  AgentContextSurface,
  ControlledRenderingSurface,
  DeclarativeUiSurface,
  RuntimeInterruptSurface,
  ToolDecisionSurface,
} from "./RemainingSurfaces.tsx";
import { RichThreadView } from "./RichThreadView.tsx";
import { McpOpenEndedSurface } from "./McpOpenEndedSurface.tsx";
import { Disclosure, JourneyHead, Note } from "./primitives.tsx";
import { JOURNEY_B_AGENT } from "../constants.ts";

export type ViewMode = "overview" | "chat" | "capability" | "state" | "agent-context" | "controlled-rendering" | "tool-decision" | "runtime-interrupt" | "declarative-ui" | "rich-thread" | "open-ended-mcp";

const THREAD = "thread:demo";

const NAV: readonly { readonly id: ViewMode; readonly step: string; readonly label: string }[] = [
  { id: "overview", step: "", label: "Overview" },
  { id: "chat", step: "01", label: "Conversation" },
  { id: "capability", step: "02", label: "Frontend capability" },
  { id: "state", step: "03", label: "Shared state" },
  { id: "agent-context", step: "04", label: "Agent context" },
  { id: "controlled-rendering", step: "05", label: "Controlled rendering" },
  { id: "tool-decision", step: "06", label: "Tool decision" },
  { id: "runtime-interrupt", step: "07", label: "Runtime interrupt" },
  { id: "declarative-ui", step: "08", label: "Declarative UI" },
  { id: "rich-thread", step: "09", label: "Rich thread" },
  { id: "open-ended-mcp", step: "10", label: "Open-ended MCP" },
];

const STATUS_WORD: Record<string, string> = {
  connecting: "Runtime connecting",
  live: "Runtime connected",
  reconnecting: "Runtime reconnecting",
  closed: "Runtime disconnected",
};

export function App() {
  const client = useCognate();
  const connection = useConnectionStatus();
  const [view, setView] = useState<ViewMode>("overview");
  // Honour the OS preference on first load, then remember the operator's choice.
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = globalThis.localStorage?.getItem("cognate-theme");
    if (stored === "light" || stored === "dark") return stored;
    return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [offering, setOffering] = useState(true);
  const [lastBRunId, setLastBRunId] = useState<string>();
  const [invokingB, setInvokingB] = useState(false);
  const [failureB, setFailureB] = useState<string>();
  const bRun = useRun(lastBRunId);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      globalThis.localStorage?.setItem("cognate-theme", theme);
    } catch {
      // A blocked storage quota must not break the toggle.
    }
  }, [theme]);

  const invokeBrowserTool = useCallback(async () => {
    setInvokingB(true);
    setFailureB(undefined);
    try {
      const run = await client.startRun(JOURNEY_B_AGENT, {});
      setLastBRunId(run.runId);
    } catch (error) {
      setFailureB(`The agent run could not start. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setInvokingB(false);
    }
  }, [client]);

  const statusWord = STATUS_WORD[connection] ?? "Runtime status unknown";
  const online = connection === "live";

  const capability = (
    <CapabilityPanel
      offering={offering}
      setOffering={setOffering}
      runId={lastBRunId}
      invoking={invokingB}
      invoke={invokeBrowserTool}
      failure={failureB}
      runOutput={bRun?.output}
      runStatus={bRun?.status}
    />
  );

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="masthead">
        <div className="masthead__identity">
          <h1 className="masthead__mark">Cognate</h1>
          <span className="masthead__sub">Three agent journeys, one local runtime</span>
        </div>
        <div className="masthead__tools">
          <span className="runtime-status" data-state={online ? "online" : "offline"}>
            <span className="runtime-status__dot" aria-hidden="true" />
            {statusWord}
            <span className="runtime-status__meta">tenant-a</span>
          </span>
          <button
            type="button"
            className="btn btn--quiet"
            aria-pressed={theme === "dark"}
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? "Dark theme" : "Light theme"}
          </button>
        </div>
      </header>

      <nav className="journey-nav" aria-label="Journeys">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className="journey-nav__tab"
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => setView(item.id)}
          >
            {item.step ? (
              <span className="journey-nav__step" aria-hidden="true">
                {item.step}
              </span>
            ) : null}
            {item.label}
          </button>
        ))}
      </nav>

      <main className={view === "overview" ? "bench" : view === "rich-thread" ? "threadbench" : "focus"} id="main">
        {view === "overview" ? (
          <>
            <div className="bench__column">
              <JourneyFrame step="01" title="Conversation" claim="Send a message and watch the reply arrive as durable events, not a terminal-only result." grow>
                <ChatSurface threadId={THREAD} tenant="tenant-a" />
              </JourneyFrame>
            </div>
            <div className="bench__column">
              <JourneyFrame step="02" title="Frontend capability" claim="A browser tool the agent can only reach while this surface is mounted.">
                {capability}
              </JourneyFrame>
              <JourneyFrame step="03" title="Shared state" claim="The agent writes, you edit, and the next agent turn observes your edit.">
                <SharedStateSurface />
              </JourneyFrame>
            </div>
          </>
        ) : null}

        {view === "chat" ? (
          <JourneyFrame step="01" title="Conversation" claim="Send a message and watch the reply arrive as durable events, not a terminal-only result.">
            <ChatSurface threadId={THREAD} tenant="tenant-a" />
          </JourneyFrame>
        ) : null}

        {view === "state" ? (
          <JourneyFrame step="03" title="Shared state" claim="The agent writes, you edit, and the next agent turn observes your edit.">
            <SharedStateSurface />
          </JourneyFrame>
        ) : null}

        {view === "capability" ? (
          <JourneyFrame step="02" title="Frontend capability" claim="A browser tool the agent can only reach while this surface is mounted.">
            {capability}
          </JourneyFrame>
        ) : null}

        {view === "agent-context" ? (
          <JourneyFrame step="04" title="Agent context" claim="The mounted surface supplies application state as invocation input; unmounting stops supplying it.">
            <AgentContextSurface threadId="thread:j-d" />
          </JourneyFrame>
        ) : null}

        {view === "controlled-rendering" ? (
          <JourneyFrame step="05" title="Controlled rendering" claim="A renderer that is a pure function of durable invocation evidence: pending and terminal both derive from recorded events.">
            <ControlledRenderingSurface />
          </JourneyFrame>
        ) : null}

        {view === "tool-decision" ? (
          <JourneyFrame step="06" title="Tool decision" claim="The inline meeting UI holds the answer until a human accepts a slot; resolving it continues the run.">
            <ToolDecisionSurface />
          </JourneyFrame>
        ) : null}

        {view === "runtime-interrupt" ? (
          <JourneyFrame step="07" title="Runtime interrupt" claim="A run-level condition discovered without a tool result: resume continues the suspended run, cancel closes it.">
            <RuntimeInterruptSurface startLabel="Start interrupt" reason="operator requested a pause" />
          </JourneyFrame>
        ) : null}

        {view === "declarative-ui" ? (
          <JourneyFrame step="08" title="Declarative UI" claim="The catalog decides what may render, and the only actionable control is an operation it declared.">
            <DeclarativeUiSurface />
          </JourneyFrame>
        ) : null}

        {view === "open-ended-mcp" ? (
          <JourneyFrame
            step="10"
            title="Open-ended MCP"
            claim="The agent bridges a live MCP server's tool; the tool's UI resource is recorded durably, rendered in a sandboxed frame, and the frame's interaction settles the run."
          >
            <McpOpenEndedSurface />
          </JourneyFrame>
        ) : null}

        {view === "rich-thread" ? (
          <>
            <div className="journey__head">
              <span className="journey__step">Journey 09</span>
              <h2 className="journey__title">Rich thread</h2>
              <p className="journey__claim">
                One thread carrying conversation, a controlled render and shared state — each turn
                durable, and the whole thread replayed from projections after a reload.
              </p>
            </div>
            <RichThreadView />
          </>
        ) : null}
      </main>

      <footer className="app-footer">
        <span>
          Local runtime on port <code>3190</code>
        </span>
        <Disclosure label="Runtime endpoints">
          <p className="hint">
            Connect <code>/cognate.v1.RuntimeService/</code> · AG-UI SSE <code>/agui</code>
          </p>
        </Disclosure>
      </footer>
    </div>
  );
}

function JourneyFrame({
  step,
  title,
  claim,
  grow,
  children,
}: {
  readonly step: string;
  readonly title: string;
  readonly claim: string;
  readonly grow?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const regionClass = grow ? "bench__region bench__region--grow" : "bench__region";
  return (
    <section className={regionClass}>
      <JourneyHead step={`Journey ${step}`} title={title} claim={claim} />
      {children}
    </section>
  );
}

function CapabilityPanel({
  offering,
  setOffering,
  runId,
  invoking,
  invoke,
  failure,
  runOutput,
  runStatus,
}: {
  readonly offering: boolean;
  readonly setOffering: (value: boolean) => void;
  readonly runId: string | undefined;
  readonly invoking: boolean;
  readonly invoke: () => Promise<void>;
  readonly failure: string | undefined;
  readonly runOutput: unknown;
  readonly runStatus: string | undefined;
}): ReactNode {
  const applied = typeof runOutput === "object" && runOutput !== null ? ((runOutput as { acknowledgment?: unknown }).acknowledgment as { applied?: unknown } | undefined) : undefined;
  const appliedValue = typeof applied?.applied === "string" ? applied.applied : undefined;
  const discovered = typeof runOutput === "object" && runOutput !== null && Array.isArray((runOutput as { discovered?: unknown }).discovered)
    ? ((runOutput as { discovered: readonly unknown[] }).discovered).length
    : undefined;

  return (
    <>
      <div className="actions">
        <span className="actions__label">Mount</span>
        <button type="button" className="btn btn--secondary" aria-pressed={offering} onClick={() => setOffering(!offering)}>
          {offering ? "Unmount tool" : "Mount tool"}
        </button>
        <button type="button" className="btn btn--primary" disabled={invoking} aria-busy={invoking} onClick={() => void invoke()}>
          {invoking ? "Agent invoking…" : "Ask agent to invoke"}
        </button>
      </div>
      <p className="hint">
        {offering ? "The tool is mounted, so the agent can discover it." : "Unmount to withdraw the offer from new agent calls."}
      </p>

      <RemoteCapabilitySurface offering={offering} runId={runId} />

      {runStatus ? (
        <p className="hint">
          Agent run {runStatus}
          {discovered !== undefined ? ` · discovered ${discovered} tool${discovered === 1 ? "" : "s"}` : ""}
          {appliedValue ? ` · applied “${appliedValue}”` : runStatus === "completed" ? " · no tool was available" : ""}
        </p>
      ) : null}

      {failure ? <Note>{failure}</Note> : null}
    </>
  );
}
