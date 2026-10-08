// Reference Astryx surfaces over @godspeedai/react (spec §25.3). A renderer, not the ontology (§3.8):
// no @godspeedai/client internals are imported here beyond types, and Astryx types never leak past this file.
import { Button, Card, CodeBlock, Heading, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, TextInput, Theme } from "@astryxdesign/core";
import { neutralTheme } from "@astryxdesign/theme-neutral";
import { useAgent, useArtifact, useCognate, useContinuations, useRun } from "@godspeedai/react";
import type { ContinuationView } from "@godspeedai/runtime-api";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

/** Application shell: Astryx Theme (neutral), header with title and theme toggle, main content region. */
export function CognateShell({ title, mode, onModeChange, children }: { readonly title: string; readonly mode?: ThemeMode; readonly onModeChange?: (mode: ThemeMode) => void; readonly children: ReactNode }): ReactNode {
  const [internalMode, setInternalMode] = useState<ThemeMode>(mode ?? "light");
  const effectiveMode = mode ?? internalMode;
  const toggle = (): void => {
    const next: ThemeMode = effectiveMode === "light" ? "dark" : "light";
    setInternalMode(next);
    onModeChange?.(next);
  };
  return (
    <div data-cognate-theme={effectiveMode}>
      <Theme theme={neutralTheme} mode={effectiveMode}>
        <header>
          <Heading level={1}>{title}</Heading>
          <Button label={effectiveMode === "light" ? "Switch to dark theme" : "Switch to light theme"} variant="ghost" onClick={toggle} />
        </header>
        <main>{children}</main>
      </Theme>
    </div>
  );
}

/** Chat surface for one agent: message input that starts runs; streamed assistant text of the latest run. */
export function ChatPanel({ agent, placeholder, onRunStarted }: { readonly agent: string; readonly placeholder?: string; readonly onRunStarted?: (runId: string) => void }): ReactNode {
  const { start, state } = useAgent(agent);
  const [value, setValue] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const message = value;
    setValue("");
    const view = await start({ message });
    onRunStarted?.(view.runId);
  };

  return (
    <Card>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <TextInput label="Message" isLabelHidden value={value} placeholder={placeholder} onChange={(next) => setValue(next)} />
        <Button type="submit" label="Send" />
      </form>
      <Text>{state?.text ?? ""}</Text>
    </Card>
  );
}

/** Approval surface for one continuation: shows type and payload; approve/reject resolve it. */
export function ApprovalCard({ continuation, onResolve }: { readonly continuation: ContinuationView; readonly onResolve: (approved: boolean) => void | Promise<void> }): ReactNode {
  return (
    <Card>
      <Text weight="semibold">{continuation.type}</Text>
      <CodeBlock code={JSON.stringify(continuation.payload, null, 2)} language="json" />
      <Button label="Approve" aria-label="Approve" variant="primary" onClick={() => void onResolve(true)} />
      <Button label="Reject" aria-label="Reject" variant="destructive" onClick={() => void onResolve(false)} />
    </Card>
  );
}

function isApprovalContinuation(continuation: ContinuationView): boolean {
  const condition = continuation.condition as { readonly kind?: unknown } | null;
  return condition?.kind === "human_approval" || continuation.type.includes("approval");
}

/** All open approval-style continuations of a run, each as an ApprovalCard resolving through the client. */
export function Approvals({ runId }: { readonly runId: string | undefined }): ReactNode {
  const { open, resolve } = useContinuations(runId);
  const approvals = open.filter(isApprovalContinuation);
  return (
    <>
      {approvals.map((continuation) => (
        <ApprovalCard key={continuation.id} continuation={continuation} onResolve={(approved) => resolve(continuation.id, "resume", { approved })} />
      ))}
    </>
  );
}

/** Artifact viewer: text/* as text, application/json as a key/value table, other media as a download link. */
export function ArtifactViewer({ artifactId }: { readonly artifactId: string | undefined }): ReactNode {
  const client = useCognate();
  const artifact = useArtifact(artifactId);
  const [json, setJson] = useState<Record<string, unknown> | undefined>(undefined);
  const [downloadUrl, setDownloadUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    setJson(undefined);
    setDownloadUrl(undefined);
    if (artifactId === undefined || artifact.status !== "ready" || artifact.mediaType === undefined) return;
    if (artifact.mediaType.startsWith("text/")) return;
    let cancelled = false;
    client.artifact(artifactId).then((record) => {
      if (cancelled) return;
      if (record.mediaType === "application/json") {
        try {
          const parsed: unknown = JSON.parse(new TextDecoder().decode(record.bytes));
          if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
            setJson(parsed as Record<string, unknown>);
            return;
          }
        } catch {
          // fall through to a download link below
        }
      }
      setDownloadUrl(URL.createObjectURL(new Blob([record.bytes.slice()], { type: record.mediaType })));
    });
    return () => {
      cancelled = true;
    };
  }, [client, artifactId, artifact.status, artifact.mediaType]);

  if (artifactId === undefined || artifact.status === "idle") return null;
  if (artifact.status === "loading") return <Text>Loading artifact…</Text>;
  if (artifact.status === "error") return <Text color="accent">{artifact.error}</Text>;

  if (artifact.mediaType?.startsWith("text/")) return <Text>{artifact.text}</Text>;

  if (artifact.mediaType === "application/json") {
    if (!json) return <Text>Loading artifact…</Text>;
    return (
      <Table aria-label={artifact.name ?? "artifact"}>
        <TableHeader>
          <TableRow isHeaderRow>
            <TableHeaderCell scope="col">Key</TableHeaderCell>
            <TableHeaderCell scope="col">Value</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(json).map(([key, value]) => (
            <TableRow key={key}>
              <TableCell>{key}</TableCell>
              <TableCell>{JSON.stringify(value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <a href={downloadUrl ?? "#"} download={artifact.name}>
      {artifact.name ?? artifactId}
    </a>
  );
}

/** Run inspection: status, error, and the run's open continuations and artifacts. */
export function RunInspector({ runId }: { readonly runId: string | undefined }): ReactNode {
  const state = useRun(runId);
  return (
    <Card>
      <Text weight="semibold">{state?.status ?? "none"}</Text>
      {state?.error ? <Text color="accent">{state.error}</Text> : null}
      <Text>{`${state?.openContinuations.length ?? 0} open continuation(s)`}</Text>
      <Text>{`${state?.artifacts.length ?? 0} artifact(s)`}</Text>
    </Card>
  );
}

/** Shared state inspection: the run's derived state as formatted JSON. */
export function StateInspector({ runId }: { readonly runId: string | undefined }): ReactNode {
  const state = useRun(runId);
  return <CodeBlock code={JSON.stringify(state?.state ?? null, null, 2)} language="json" />;
}
