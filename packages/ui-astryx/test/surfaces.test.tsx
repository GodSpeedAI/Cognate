// CG-UI-002 (spec §25.3, §3.8): Astryx reference surfaces render under Bun SSR, hydrate against a real runtime, theme, and bundle.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { createClient } from "@cognate/client";
import { CognateProvider } from "@cognate/react";
import type { AgentDefinition } from "@cognate/runtime-api";
import { alice } from "@cognate/runtime-api/conformance";
import { createRuntime, type Runtime } from "@cognate/runtime-bun";
import { ApprovalCard, ArtifactViewer, Approvals, ChatPanel, CognateShell, RunInspector, StateInspector } from "../src/index.tsx";
import { stylesheetPaths } from "../src/styles.ts";

const agent: AgentDefinition = {
  id: "agent.support",
  version: "1.0.0",
  async run(input, ctx) {
    for (const w of ["We ", "can ", "refund ", "that."]) await ctx.emit("message.delta", { text: w });
    await ctx.emit("state.changed", { snapshot: { refund: { amount: 12 } } });
    const decision = (await ctx.waitFor("approve", { type: "refund-approval", condition: { kind: "human_approval" }, payload: { amount: 12, reason: (input as { message: string }).message } })) as { approved: boolean };
    const artifactId = await ctx.artifact({ name: "refund.json", mediaType: "application/json", bytes: new TextEncoder().encode(JSON.stringify({ amount: 12, approved: decision.approved })) });
    return { approved: decision.approved, artifactId };
  },
};

let runtime: Runtime | undefined;
afterEach(async () => {
  await runtime?.close();
  runtime = undefined;
});
const open = async () => {
  runtime = await createRuntime({ store: ":memory:", policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) }, agents: [agent] });
  return createClient({ service: runtime.service, caller: alice });
};

describe("Astryx reference surfaces (§25.3)", () => {
  test("SSR under Bun: shell, chat, approval, and inspectors render accessible markup in light and dark", async () => {
    const client = await open();
    const continuation = { id: "c1", runId: "r1", type: "refund-approval", status: "OPEN" as const, condition: { kind: "human_approval" }, payload: { amount: 12 }, version: 1, expiresAt: null };
    for (const mode of ["light", "dark"] as const) {
      const html = renderToString(
        <CognateProvider client={client}>
          <CognateShell title="Support copilot" mode={mode}>
            <ChatPanel agent="agent.support" placeholder="Ask about a refund" />
            <ApprovalCard continuation={continuation} onResolve={() => {}} />
            <RunInspector runId={undefined} />
            <StateInspector runId={undefined} />
            <ArtifactViewer artifactId={undefined} />
          </CognateShell>
        </CognateProvider>,
      );
      expect(html).toContain("Support copilot");
      expect(html).toContain("Ask about a refund");
      expect(html).toMatch(/refund-approval/);
      expect(html).toMatch(/<main[\s>]/);
      expect(html).toContain(`data-cognate-theme="${mode}"`);
      expect(html).toMatch(/aria-label="(Approve|Reject)"/);
    }
    await client.close();
  });

  test("hydrated surfaces drive a real run: chat → streamed text → approval → JSON artifact table", async () => {
    GlobalRegistrator.register();
    try {
      const { act, cleanup, render, screen, waitFor, fireEvent } = await import("@testing-library/react");
      const client = await open();
      const { useState } = await import("react");
      let startedRun: string | undefined;
      function App() {
        const [runId, setRunId] = useState<string>();
        return (
          <CognateShell title="Support copilot">
            <ChatPanel agent="agent.support" onRunStarted={(id) => ((startedRun = id), setRunId(id))} />
            <Approvals runId={runId} />
            <RunInspector runId={runId} />
          </CognateShell>
        );
      }
      const view = render(<CognateProvider client={client}><App /></CognateProvider>);
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "double charge" } });
      await act(async () => fireEvent.submit(input.closest("form")!));
      await waitFor(() => expect(document.body.textContent).toContain("We can refund that."), { timeout: 5000 });
      expect(startedRun).toBeString();
      await act(async () => (await screen.findByLabelText("Approve", {}, { timeout: 5000 })).click());
      await waitFor(() => expect(document.body.textContent).toContain("completed"), { timeout: 5000 });
      const output = (await runtime!.service.getRun(alice, { runId: startedRun! })).output as { artifactId: string };
      view.rerender(<CognateProvider client={client}><ArtifactViewer artifactId={output.artifactId} /></CognateProvider>);
      await waitFor(() => expect(screen.getByRole("table").textContent).toContain("amount"), { timeout: 5000 });
      cleanup();
      await client.close();
    } finally {
      await GlobalRegistrator.unregister();
    }
  });

  test("the surfaces bundle for the browser with Bun.build and ship Astryx stylesheets", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cognate-ui-build-"));
    try {
      const entry = join(dir, "entry.tsx");
      await Bun.write(entry, `import { hydrateRoot } from "react-dom/client";\nimport { CognateShell } from ${JSON.stringify(new URL("../src/index.tsx", import.meta.url).pathname)};\nhydrateRoot(document.getElementById("root")!, <CognateShell title="x"><p>hi</p></CognateShell>);\n`);
      const result = await Bun.build({ entrypoints: [entry], outdir: join(dir, "out"), target: "browser", minify: true });
      expect(result.success).toBe(true);
      const size = statSync(result.outputs[0]!.path).size;
      expect(size).toBeGreaterThan(10_000);
      expect(size).toBeLessThan(2_000_000);
      const css = stylesheetPaths();
      expect(css.length).toBeGreaterThan(0);
      for (const path of css) expect(existsSync(path)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
