import "./setup-dom.ts";
import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { createClient, type CognateClient } from "@cognate/client";
import { CognateProvider } from "@cognate/react";
import { alice } from "@cognate/runtime-api/conformance";
import { connectMcpBridge, mcpToolContract, type McpBridge } from "../src/mcp-bridge.ts";
import {
  fixtureViewDocument,
  fixtureViewId,
  MCP_FIXTURE_APP_SOURCE,
  MCP_FIXTURE_RESOURCE_URI,
  MCP_FIXTURE_RESULT_TYPE,
  startMcpFixtureServer,
  type McpFixtureServer,
} from "../src/mcp-fixture-server.ts";
import {
  createRemainingJourneysApp,
  JOURNEY_MCP_AGENT,
  MCP_APP_COMPONENT,
  MCP_APP_OPERATION,
  MCP_TOOL_CONTRACT,
} from "../src/remaining-journeys.ts";
import { McpOpenEndedSurface } from "../src/ui/McpOpenEndedSurface.tsx";

// The view the agent asks the MCP tool to create when no rows are supplied (the surface's path).
const VIEW = { title: "Three-step flowchart", rows: [
  { label: "Step 1", value: "Capture request" },
  { label: "Step 2", value: "Route to capability" },
  { label: "Step 3", value: "Render result" },
] } as const;
// The payload the fixture document's one control posts to its host.
const FRAME_RESULT = { action: "approve-view", title: VIEW.title, rows: VIEW.rows.length } as const;

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  cleanup();
  await close?.();
  close = undefined;
});

function postFrameResult(viewId: string): void {
  window.dispatchEvent(new MessageEvent("message", {
    origin: "null", // an opaque-origin sandboxed frame reports "null"
    data: { source: MCP_FIXTURE_APP_SOURCE, type: MCP_FIXTURE_RESULT_TYPE, viewId, result: FRAME_RESULT },
  }));
}

test("J-H-open-ended-mcp settles an MCP tool call, its sandboxed app interaction and offer revocation durably", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cognate-j-h-mcp-"));
  const journey = await createRemainingJourneysApp(join(directory, "journey.sqlite"));
  const client: CognateClient = createClient({ service: journey.runtime.service, caller: alice });
  let fresh: CognateClient = createClient({ service: journey.runtime.service, caller: alice });
  let fixture: McpFixtureServer | undefined;
  let bridge: McpBridge | undefined;
  close = async () => {
    await bridge?.dispose();
    await fixture?.close();
    await fresh.close();
    await client.close();
    await journey.close();
    rmSync(directory, { recursive: true, force: true });
  };

  // The consume bridge is a protocol adapter over the existing offer/lease mechanism: it lists the
  // fixture server's tools and publishes each as a lease-bound remote offer for the agent.
  fixture = await startMcpFixtureServer();
  bridge = await connectMcpBridge({ serverUrl: fixture.url, client, agent: JOURNEY_MCP_AGENT });
  expect(bridge.tools).toEqual(["create_view"]);
  expect(bridge.contracts).toEqual([mcpToolContract("create_view")]);
  const offers = await journey.runtime.service.listRemoteOffers(alice, { agent: JOURNEY_MCP_AGENT });
  expect(offers.map((offer) => offer.contract.id)).toEqual([MCP_TOOL_CONTRACT]);

  let runId = "";
  const ui = render(
    createElement(CognateProvider, {
      client,
      children: createElement(McpOpenEndedSurface, {
        onRunStarted: (id: string) => {
          runId = id;
        },
      }),
    }),
  );
  fireEvent.click(ui.getByRole("button", { name: "Ask MCP app" }));
  await waitFor(() => expect(runId).not.toBe(""));

  // The tool invocation was committed as a durable remote: continuation and the bridge resolved it
  // over MCP; the run then opened its second durable wait for the sandboxed app's interaction.
  // Wait on the continuation PAIR, not the run status: the run is "waiting" twice in this journey
  // (on the tool, then on the interaction), and a status poll can observe the first wait alone.
  // listContinuations orders OPEN continuations first, so the pair is asserted as a set; the true
  // commit order is asserted on the run.waiting event payloads below.
  await waitFor(
    async () =>
      expect(
        (await journey.runtime.service.listContinuations(alice, { runId })).map((continuation) => continuation.type).sort(),
      ).toEqual([`mcp:${MCP_APP_OPERATION}`, `remote:${MCP_TOOL_CONTRACT}`].sort()),
    { timeout: 10_000 },
  );
  const waitsWhileOpen = await journey.runtime.service.listContinuations(alice, { runId });
  const toolWait = waitsWhileOpen.find((continuation) => continuation.type === `remote:${MCP_TOOL_CONTRACT}`);
  const interactionWait = waitsWhileOpen.find((continuation) => continuation.type === `mcp:${MCP_APP_OPERATION}`);
  expect(waitsWhileOpen).toHaveLength(2);
  expect(toolWait).toMatchObject({ status: "RESUMED", condition: { kind: "frontend_capability", capability: MCP_TOOL_CONTRACT } });
  expect(interactionWait).toMatchObject({ status: "OPEN", condition: { kind: "mcp_app_interaction", component: MCP_APP_COMPONENT, operation: MCP_APP_OPERATION, resourceUri: MCP_FIXTURE_RESOURCE_URI } });

  // The UI resource the MCP tool advertised is durable: recorded as this run's artifact, decoded
  // byte-for-byte equal to the deterministic fixture document for the created view. At this point
  // the run is waiting on the interaction, so the evidence runs from start to the second wait;
  // run.completed is asserted after the frame result settles the run.
  const runEvents = await Array.fromAsync(journey.runtime.service.events(alice, { runId }));
  expect(runEvents.map((event) => event.eventType)).toEqual(
    expect.arrayContaining(["run.started", "run.remote_offers", "run.waiting", "ui.render", "run.artifact", "run.resumed"]),
  );
  const renderEvent = runEvents.find((event) => event.eventType === "ui.render");
  expect((renderEvent!.payload as { component?: unknown }).component).toBe(MCP_APP_COMPONENT);
  const artifactId = (renderEvent!.payload as { artifactId?: unknown }).artifactId as string;
  const artifact = await journey.runtime.service.getArtifact(alice, { artifactId });
  expect(artifact.mediaType).toBe("text/html");
  const document = fixtureViewDocument(VIEW);
  expect(new TextDecoder().decode(artifact.bytes)).toBe(document);
  expect((renderEvent!.payload as { props?: { viewId?: unknown } }).props?.viewId).toBe(fixtureViewId(VIEW));
  // Waits are position-ordered: the tool wait commits before the interaction wait can exist.
  expect(runEvents.filter((event) => event.eventType === "run.waiting").map((event) => (event.payload as { type?: unknown }).type))
    .toEqual([`remote:${MCP_TOOL_CONTRACT}`, `mcp:${MCP_APP_OPERATION}`]);

  // The projection row is the render's durable identity, built from the recorded event.
  const row = (await journey.runtime.service.readProjection(alice, { name: "mcp-open-ended" }))[0]!;
  expect(row).toEqual({
    key: `run/${runId}`,
    value: {
      component: MCP_APP_COMPONENT,
      props: { tool: "create_view", viewId: fixtureViewId(VIEW), resourceUri: MCP_FIXTURE_RESOURCE_URI },
      artifactId,
      operations: [MCP_APP_OPERATION],
      renders: 1,
    },
  });

  // The surface renders the recorded document inside a sandboxed frame and only enables its host
  // side once the interaction continuation is durably open.
  await waitFor(() => expect(ui.getByLabelText("MCP renderer").textContent).toBe("rendered"), { timeout: 10_000 });
  expect(ui.getByLabelText("MCP tool").textContent).toBe("create_view");
  expect(ui.getByLabelText("MCP view id").textContent).toBe(fixtureViewId(VIEW));
  const frame = ui.getByLabelText("MCP app frame") as HTMLIFrameElement;
  expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
  expect(frame.getAttribute("srcdoc")).toBe(document);
  await waitFor(() => expect(ui.getByLabelText("MCP app control state").textContent).toBe("interaction open — approve the view in the app"), { timeout: 10_000 });

  // The frame's one control posts its result to the host; the host resolves the durable
  // continuation with that payload and the run settles citing the interaction.
  postFrameResult(fixtureViewId(VIEW));
  await waitFor(async () => expect((await journey.runtime.service.getRun(alice, { runId })).status).toBe("completed"), { timeout: 10_000 });
  const settledEvents = await Array.fromAsync(journey.runtime.service.events(alice, { runId }));
  expect(settledEvents.at(-1)?.eventType).toBe("run.completed");
  expect((await journey.runtime.service.getRun(alice, { runId })).output).toEqual({
    tool: "create_view",
    viewId: fixtureViewId(VIEW),
    artifactId,
    interaction: { viewId: fixtureViewId(VIEW), result: FRAME_RESULT },
  });
  const settled = await journey.runtime.service.listContinuations(alice, { runId });
  expect(settled.find((continuation) => continuation.type === `remote:${MCP_TOOL_CONTRACT}`)).toMatchObject({ status: "RESUMED" });
  expect(settled.find((continuation) => continuation.type === `mcp:${MCP_APP_OPERATION}`)).toMatchObject({ status: "RESUMED" });

  // A fresh client with no bridge of its own replays the same app from the durable projection and
  // artifact — no live MCP server is consulted on the replay path.
  cleanup();
  const replay = render(
    createElement(CognateProvider, { client: fresh, children: createElement(McpOpenEndedSurface, { runId }) }),
  );
  await waitFor(() => expect(replay.getByLabelText("MCP renderer").textContent).toBe("rendered"), { timeout: 10_000 });
  expect((replay.getByLabelText("MCP app frame") as HTMLIFrameElement).getAttribute("srcdoc")).toBe(document);
  expect(replay.getByLabelText("MCP app control state").textContent).toBe("interaction settled");

  // Disposing the bridge revokes its offers: the tool is no longer eligible for new invocations.
  await bridge.dispose();
  expect(await journey.runtime.service.listRemoteOffers(alice, { agent: JOURNEY_MCP_AGENT })).toEqual([]);
  const second = await fresh.startRun(JOURNEY_MCP_AGENT, {});
  await waitFor(async () => expect((await journey.runtime.service.getRun(alice, { runId: second.runId })).status).toBe("completed"), { timeout: 10_000 });
  expect((await journey.runtime.service.getRun(alice, { runId: second.runId })).output).toEqual({ offers: [], tool: "no MCP tool offered" });

  // The first run's durable evidence is untouched by the second: same projection row, same
  // artifact bytes, same settled continuations — no position regressed.
  expect(await journey.runtime.service.readProjection(alice, { name: "mcp-open-ended" })).toContainEqual(row);
  expect(new TextDecoder().decode((await journey.runtime.service.getArtifact(alice, { artifactId })).bytes)).toBe(document);
  bridge = undefined; // already disposed above; afterEach must not dispose twice
});
