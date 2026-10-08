// Browser entry for the §36 e2e journey app (bundled by app.ts with Bun.build). Renders the Astryx
// UI over the real Connect transport, authenticated as tenant-a:alice (spec §36).
import { useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@godspeedai/client";
import { CognateProvider, useArtifact, useRun } from "@godspeedai/react";
import { Approvals, ArtifactViewer, ChatPanel, CognateShell, RunInspector } from "@godspeedai/ui-astryx";
import { connectTransport, devToken } from "@godspeedai/protocol-connect-bun";
import { createRemoteRuntimeService } from "@godspeedai/protocol-connect";

const caller = { tenant: "tenant-a", actor: { id: "alice", kind: "user" as const } };
const transport = connectTransport(window.location.origin);
const service = createRemoteRuntimeService(transport, () => devToken(caller));
const client = createClient({ service, caller });

function ArtifactLink({ artifactId, onSelect }: { readonly artifactId: string; readonly onSelect: (id: string) => void }): ReactNode {
  const info = useArtifact(artifactId);
  if (info.status !== "ready") return null;
  return (
    <a
      href="#"
      onClick={(event) => {
        event.preventDefault();
        onSelect(artifactId);
      }}
    >
      {info.name ?? artifactId}
    </a>
  );
}

function RunArtifacts({ runId, onSelect }: { readonly runId: string | undefined; readonly onSelect: (id: string) => void }): ReactNode {
  const state = useRun(runId);
  return (
    <>
      {(state?.artifacts ?? []).map((artifactId) => (
        <ArtifactLink key={artifactId} artifactId={artifactId} onSelect={onSelect} />
      ))}
    </>
  );
}

function App(): ReactNode {
  const [runId, setRunId] = useState<string | undefined>(undefined);
  const [openArtifact, setOpenArtifact] = useState<string | undefined>(undefined);

  return (
    <CognateShell title="Refund copilot">
      <ChatPanel
        agent="agent.refund"
        placeholder="Describe the refund..."
        onRunStarted={(id) => {
          setRunId(id);
          setOpenArtifact(undefined);
        }}
      />
      <div data-testid="run-id">{runId ?? ""}</div>
      <Approvals runId={runId} />
      <RunInspector runId={runId} />
      <RunArtifacts runId={runId} onSelect={setOpenArtifact} />
      {openArtifact ? <ArtifactViewer artifactId={openArtifact} /> : null}
    </CognateShell>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<CognateProvider client={client}><App /></CognateProvider>);
}
