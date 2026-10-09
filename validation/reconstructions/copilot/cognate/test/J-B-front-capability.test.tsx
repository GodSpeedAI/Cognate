import "./setup-dom.ts";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { createClient, type CognateClient } from "@godspeedai/cognate-client";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";
import { createJourneyBApp, JOURNEY_B_AGENT, RemoteCapabilitySurface } from "../src/remote-capability.tsx";

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  cleanup();
  await close?.();
  close = undefined;
});

async function terminal(service: Awaited<ReturnType<typeof createJourneyBApp>>["runtime"]["service"], runId: string) {
  await waitFor(async () => expect((await service.getRun(alice, { runId })).status).toBe("completed"), { timeout: 5_000 });
  return service.getRun(alice, { runId });
}

describe("J-B-front-capability", () => {
  test("mount discovers a live offer, applies it in the browser, revokes on unmount, and publishes a new lease on remount", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cognate-j-b-"));
    const journey = await createJourneyBApp(join(directory, "journey.sqlite"));
    const client: CognateClient = createClient({ service: journey.runtime.service, caller: alice });
    close = async () => {
      await client.close();
      await journey.close();
      rmSync(directory, { recursive: true, force: true });
    };

    const mounted = render(createElement(RemoteCapabilitySurface, { client }));
    await waitFor(() => expect(mounted.getByLabelText("Browser capability status").textContent).toBe("available"));
    await waitFor(async () => expect(await journey.runtime.service.listRemoteOffers(alice, { agent: JOURNEY_B_AGENT })).toHaveLength(1));
    const [firstOffer] = await journey.runtime.service.listRemoteOffers(alice, { agent: JOURNEY_B_AGENT });

    const firstRun = await client.startRun(JOURNEY_B_AGENT, {});
    await waitFor(() => expect(mounted.getByLabelText("Browser-applied value").textContent).toBe("chosen by the agent"));
    expect(await terminal(journey.runtime.service, firstRun.runId)).toMatchObject({
      output: {
        discovered: [{ id: firstOffer!.id, capability: "browser.selection.apply" }],
        acknowledgment: { applied: "chosen by the agent" },
      },
    });

    const events = await Array.fromAsync(journey.runtime.service.events(alice, { runId: firstRun.runId }));
    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining(["run.remote_offers", "run.waiting", "run.completed"]));
    // The wait records the selected remote capability durably; its input lives on the
    // continuation record while it is open, and the terminal acknowledgment is in run output.
    expect(events.find((event) => event.eventType === "run.waiting")?.payload).toMatchObject({ type: "remote:browser.selection.apply" });

    // The outer history surface remains mounted while the offering component is removed. Its
    // renderer is keyed by the selected continuation rather than the currently live offer.
    mounted.rerender(createElement(RemoteCapabilitySurface, { client, runId: firstRun.runId, offering: false }));
    await waitFor(async () => expect(await journey.runtime.service.listRemoteOffers(alice, { agent: JOURNEY_B_AGENT })).toEqual([]));
    await waitFor(() => expect(mounted.getByLabelText("Historical browser invocations").textContent).toContain("chosen by the agent"));
    const unavailableRun = await client.startRun(JOURNEY_B_AGENT, {});
    expect(await terminal(journey.runtime.service, unavailableRun.runId)).toMatchObject({ output: { discovered: [], acknowledgment: "no mounted browser capability" } });

    mounted.rerender(createElement(RemoteCapabilitySurface, { client, runId: firstRun.runId, offering: true }));
    await waitFor(() => expect(mounted.getByLabelText("Browser capability status").textContent).toBe("available"));
    await waitFor(async () => expect(await journey.runtime.service.listRemoteOffers(alice, { agent: JOURNEY_B_AGENT })).toHaveLength(1));
    const [secondOffer] = await journey.runtime.service.listRemoteOffers(alice, { agent: JOURNEY_B_AGENT });
    expect(secondOffer!.id).not.toBe(firstOffer!.id);
    const remountedRun = await client.startRun(JOURNEY_B_AGENT, {});
    await waitFor(() => expect(mounted.getByLabelText("Browser-applied value").textContent).toBe("chosen by the agent"));
    expect(await terminal(journey.runtime.service, remountedRun.runId)).toMatchObject({ output: { acknowledgment: { applied: "chosen by the agent" } } });
  });
});
