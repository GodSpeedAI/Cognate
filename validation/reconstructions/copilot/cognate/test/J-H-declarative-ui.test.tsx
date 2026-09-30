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
import {
  DECLARATIVE_COMPONENT,
  DECLARATIVE_OPERATION,
  createRemainingJourneysApp,
  JOURNEY_H_AGENT,
  validateDeclarativeInteraction,
  validateDeclarativeRender,
} from "../src/remaining-journeys.ts";
import { DeclarativeUiSurface } from "../src/ui/RemainingSurfaces.tsx";

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  cleanup();
  await close?.();
  close = undefined;
});

test("J-H-declarative-ui lets only catalog-validated renders display and only declared operations act", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cognate-j-h-"));
  const journey = await createRemainingJourneysApp(join(directory, "journey.sqlite"));
  const client: CognateClient = createClient({ service: journey.runtime.service, caller: alice });
  close = async () => {
    await client.close();
    await journey.close();
    rmSync(directory, { recursive: true, force: true });
  };

  // The catalog is the rule: an unknown component and an unknown operation are both refused.
  expect(validateDeclarativeRender({ component: "UnknownPanel", props: {}, operations: [{ id: DECLARATIVE_OPERATION }] })).toEqual({
    ok: false,
    reason: "unknown component: UnknownPanel",
  });
  expect(validateDeclarativeRender({ component: DECLARATIVE_COMPONENT, props: { region: "emea", revenue: 4200 }, operations: [{ id: "unresolvable" }] })).toEqual({
    ok: false,
    reason: "unknown operation: unresolvable",
  });
  expect(validateDeclarativeRender({ component: DECLARATIVE_COMPONENT, props: { revenue: 4200 }, operations: [] })).toMatchObject({
    ok: false,
    reason: `${DECLARATIVE_COMPONENT} is missing its bound prop region`,
  });
  expect(validateDeclarativeInteraction(DECLARATIVE_COMPONENT, DECLARATIVE_OPERATION)).toBe(true);
  expect(validateDeclarativeInteraction("UnknownPanel", DECLARATIVE_OPERATION)).toBe(false);

  let runId = "";
  const ui = render(
    createElement(CognateProvider, {
      client,
      children: createElement(DeclarativeUiSurface, {
        onRunStarted: (id: string) => {
          runId = id;
        },
      }),
    }),
  );
  fireEvent.click(ui.getByRole("button", { name: "Ask for declarative UI" }));
  await waitFor(() => expect(ui.getByLabelText("Declarative renderer").textContent).toBe("rendered"), { timeout: 5_000 });
  expect(ui.getByLabelText("Declarative component").textContent).toBe(DECLARATIVE_COMPONENT);
  expect(ui.getByLabelText("Bound revenue").textContent).toBe("4200");

  // Exactly one actionable control, and it is the catalog-declared operation. It stays inert
  // until the corresponding interaction is durably open.
  const buttons = ui.getAllByRole("button", { name: "Select region" });
  expect(buttons).toHaveLength(1);
  await waitFor(() => expect((buttons[0] as HTMLButtonElement).disabled).toBe(false), { timeout: 5_000 });

  const runs = await journey.runtime.service.listRuns(alice, { agent: JOURNEY_H_AGENT });
  expect(runs).toHaveLength(1);
  runId ||= runs[0]!.runId;

  // Both agent-authored renders are durable; the projection records only the validated one.
  const events = await Array.fromAsync(journey.runtime.service.events(alice, { runId }));
  const renders = events.filter((event) => event.eventType === "ui.render");
  expect(renders.map((event) => (event.payload as { component?: unknown }).component)).toEqual([DECLARATIVE_COMPONENT, "UnknownPanel"]);
  const rows = await journey.runtime.service.readProjection(alice, { name: "declarative-catalog" });
  const row = rows[0]!;
  expect(row).toEqual(
    expect.objectContaining({
      key: `run/${runId}`,
      value: { component: DECLARATIVE_COMPONENT, props: { region: "emea", revenue: 4200 }, operations: [DECLARATIVE_OPERATION], renders: 1 },
    }),
  );

  // The interaction the renderer may act on is the one the catalog declared for that component.
  const [interaction] = await journey.runtime.service.listContinuations(alice, { runId, status: "OPEN" });
  expect(interaction).toMatchObject({
    type: `a2ui:${DECLARATIVE_OPERATION}`,
    status: "OPEN",
    condition: { kind: "declarative_operation", component: DECLARATIVE_COMPONENT, operation: DECLARATIVE_OPERATION },
    payload: { component: DECLARATIVE_COMPONENT, operations: [DECLARATIVE_OPERATION] },
  });

  fireEvent.click(buttons[0]!);
  await waitFor(async () => expect((await journey.runtime.service.getRun(alice, { runId })).status).toBe("completed"), { timeout: 5_000 });
  expect((await journey.runtime.service.getRun(alice, { runId })).output).toEqual({ region: "amer" });
  const [settled] = await journey.runtime.service.listContinuations(alice, { runId });
  expect(settled).toMatchObject({ status: "RESUMED" });

  // The refused render never produced a row, and settlement does not conjure one.
  const after = await journey.runtime.service.readProjection(alice, { name: "declarative-catalog" });
  expect(after).toEqual([row]);
  expect(ui.getAllByRole("button", { name: "Select region" })).toHaveLength(1);
});
