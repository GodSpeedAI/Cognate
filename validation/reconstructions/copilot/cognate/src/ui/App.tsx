import { useState } from "react";
import { useCognate, useRun } from "@cognate/react";
import { ChatSurface } from "../ChatSurface.tsx";
import { SharedStateSurface } from "../SharedStateSurface.tsx";
import { RemoteCapabilitySurface } from "./RemoteCapabilitySurface.tsx";
import { JOURNEY_B_AGENT } from "../constants.ts";

export type ViewMode = "split" | "chat" | "state" | "tools";

export function App() {
  const client = useCognate();
  const [view, setView] = useState<ViewMode>("split");
  const [offering, setOffering] = useState(true);
  const [lastBRunId, setLastBRunId] = useState<string>();
  const [invokingB, setInvokingB] = useState(false);
  const bRun = useRun(lastBRunId);

  const invokeBrowserTool = async () => {
    setInvokingB(true);
    try {
      const run = await client.startRun(JOURNEY_B_AGENT, {});
      setLastBRunId(run.runId);
    } finally {
      setInvokingB(false);
    }
  };

  return (
    <div className="cognate-app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="brand-group">
          <div className="brand-logo">
            <span className="logo-sparkle">✦</span>
          </div>
          <div>
            <div className="brand-title">Cognate Copilot Reconstruction</div>
            <div className="brand-subtitle">
              Local-First Ports & Adapters Architecture · SQLite Event Log · Astryx UI
            </div>
          </div>
        </div>

        <div className="header-actions">
          <div className="status-indicator">
            <span className="status-dot"></span>
            <span className="status-text">Runtime Connected</span>
            <span className="status-tag">tenant-a</span>
          </div>

          <div className="view-selector">
            <button
              type="button"
              className={`view-btn ${view === "split" ? "active" : ""}`}
              onClick={() => setView("split")}
            >
              Split View
            </button>
            <button
              type="button"
              className={`view-btn ${view === "chat" ? "active" : ""}`}
              onClick={() => setView("chat")}
            >
              Chat (J-A)
            </button>
            <button
              type="button"
              className={`view-btn ${view === "tools" ? "active" : ""}`}
              onClick={() => setView("tools")}
            >
              Frontend Tool (J-B)
            </button>
            <button
              type="button"
              className={`view-btn ${view === "state" ? "active" : ""}`}
              onClick={() => setView("state")}
            >
              Shared State (J-C)
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-main">
        {view === "split" && (
          <div className="split-grid">
            {/* Left Column: Chat Surface */}
            <section className="panel-card chat-panel-section">
              <div className="panel-header">
                <h2>Journey A · Conversational Assistant</h2>
                <span className="badge">copilotkit-reconstruction.chat</span>
              </div>
              <p className="panel-desc">
                Deterministic LLM streaming through local provider, ordered events, and thread-history projection.
              </p>
              <div className="panel-body">
                <ChatSurface threadId="thread:demo" tenant="tenant-a" />
              </div>
            </section>

            {/* Right Column: Shared State & Browser Capability */}
            <div className="split-right-column">
              {/* Shared State Canvas */}
              <section className="panel-card canvas-panel-section">
                <div className="panel-header">
                  <h2>Journey C · Bidirectional Shared State</h2>
                  <span className="badge">useThreadSharedState</span>
                </div>
                <p className="panel-desc">
                  Thread-scoped durable state stream. Agent writes, canvas edits (CAS patch), and agent observations.
                </p>
                <div className="panel-body">
                  <SharedStateSurface />
                </div>
              </section>

              {/* Mounted Browser Tool */}
              <section className="panel-card tools-panel-section">
                <div className="panel-header">
                  <h2>Journey B · Frontend Browser Capability</h2>
                  <span className="badge">useRemoteCapability</span>
                </div>
                <p className="panel-desc">
                  Browser-mounted tool lease. Dynamically advertised when mounted; revoked upon unmount.
                </p>
                <div className="panel-body">
                  <div className="tools-control-row">
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => setOffering((prev) => !prev)}
                    >
                      {offering ? "Unmount Tool Component" : "Mount Tool Component"}
                    </button>
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={invokingB}
                      onClick={() => void invokeBrowserTool()}
                    >
                      {invokingB ? "Agent Invoking..." : "Ask Agent to Invoke Tool"}
                    </button>
                  </div>

                  <RemoteCapabilitySurface offering={offering} runId={lastBRunId} />

                  {bRun && (
                    <div className="run-feedback">
                      <span className="run-tag">Run {bRun.runId.slice(0, 8)}:</span>{" "}
                      <span className="run-status">{bRun.status}</span>
                      {bRun.output ? (
                        <pre className="run-json">{JSON.stringify(bRun.output, null, 2)}</pre>
                      ) : null}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {view === "chat" && (
          <div className="focused-view">
            <section className="panel-card focused-card">
              <div className="panel-header">
                <h2>Journey A · Conversational Assistant & AG-UI Endpoint</h2>
                <span className="badge">copilotkit-reconstruction.chat</span>
              </div>
              <p className="panel-desc">
                Chat turns stream durable events (<code>run.started</code>, <code>run.invocation.progress</code>, <code>run.completed</code>) into the <code>conversation-thread-history</code> projection. Also exposes a live AG-UI compatible SSE endpoint at <code>/agui</code>.
              </p>
              <div className="panel-body">
                <ChatSurface threadId="thread:demo" tenant="tenant-a" />
              </div>
            </section>
          </div>
        )}

        {view === "tools" && (
          <div className="focused-view">
            <section className="panel-card focused-card">
              <div className="panel-header">
                <h2>Journey B · Dynamic Frontend Browser Capability</h2>
                <span className="badge">useRemoteCapability</span>
              </div>
              <p className="panel-desc">
                Demonstrates how Cognate repairs Counterexample C1 (Scoped Client Capability Discovery): remote client tools publish a lease-bound offer to the kernel only while mounted.
              </p>
              <div className="panel-body">
                <div className="tools-control-row">
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setOffering((prev) => !prev)}
                  >
                    {offering ? "Unmount Tool Component" : "Mount Tool Component"}
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={invokingB}
                    onClick={() => void invokeBrowserTool()}
                  >
                    {invokingB ? "Agent Invoking..." : "Ask Agent to Invoke Tool"}
                  </button>
                </div>

                <RemoteCapabilitySurface offering={offering} runId={lastBRunId} />

                {bRun && (
                  <div className="run-feedback">
                    <span className="run-tag">Run {bRun.runId}:</span>{" "}
                    <span className="run-status">{bRun.status}</span>
                    {bRun.output ? (
                      <pre className="run-json">{JSON.stringify(bRun.output, null, 2)}</pre>
                    ) : null}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {view === "state" && (
          <div className="focused-view">
            <section className="panel-card focused-card">
              <div className="panel-header">
                <h2>Journey C · Bidirectional Shared State Canvas</h2>
                <span className="badge">useThreadSharedState</span>
              </div>
              <p className="panel-desc">
                Demonstrates Cognate's thread-scoped durable state stream. The agent can write state, the user can edit and patch state on the canvas, and subsequent agent runs observe the update.
              </p>
              <div className="panel-body">
                <SharedStateSurface />
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Footer Info */}
      <footer className="app-footer">
        <div>
          Cognate Substrate: <code>@cognate/runtime-bun</code> · <code>@cognate/react</code> · <code>@cognate/ag-ui</code> · <code>@cognate/domainforge</code>
        </div>
        <div>
          Single Bun process · Port <code>3190</code> · AG-UI SSE: <code>http://127.0.0.1:3190/agui</code>
        </div>
      </footer>
    </div>
  );
}
