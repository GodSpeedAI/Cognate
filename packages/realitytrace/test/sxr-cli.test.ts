// CG-RT-002 (spec §20, Phase 5): the SXR CLI adapter against the real, pinned binary (RealityTrace v0.3.0).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createSxrCliPort, type Observation, type SxrWorkflow } from "../src/index.ts";

const bin = process.env.SXR_BIN ?? resolve(import.meta.dir, "../../../.tmp/realitytrace/bin/realitytrace");
const dir = mkdtempSync(join(tmpdir(), "cognate-sxr-"));
let port: ReturnType<typeof createSxrCliPort>;
let workflow: SxrWorkflow;

beforeAll(async () => {
  if (!existsSync(bin)) throw new Error(`SXR binary not found at ${bin}; run "just setup-realitytrace" (this gate fails, it does not skip)`);
  const repoDir = join(dir, "repo");
  port = createSxrCliPort({ bin, repoDir, env: { HOME: dir, SXR_HOME: join(dir, "sxr-home") } });
  workflow = await port.prepare({ title: "Does the refund flow execute as declared?" });
}, 120_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const observation = (id: string): Observation => ({ observationId: id, eventId: `evt-${id}`, tenant: "tenant-a", correlationId: "corr-sxr", causationId: null, runId: "run-9", scopeId: "root", capabilityId: "refund.approve", classification: "durable_fact", timestamp: "2026-09-24T12:00:00.000Z" });

describe("SXR CLI observation port", () => {
  test("prerequisites produce enrolled repo, question, threshold, and run ids", () => {
    for (const field of ["repoId", "questionId", "thresholdId", "runId", "target"] as const) expect(workflow[field]).toBeString();
  });

  test("an observation is accepted with a ledger position", async () => {
    const receipt = await port.record(observation("obs-1"));
    expect(receipt).toMatchObject({ status: "accepted", observationId: "obs-1" });
    expect(receipt.targetRef).toMatch(/\S+/);
  });

  test("redelivering the same observation reconciles as duplicate at the same ledger position", async () => {
    const first = await port.record(observation("obs-2"));
    const again = await port.record(observation("obs-2"));
    expect(again.status).toBe("duplicate");
    expect(again.targetRef).toBe(first.targetRef);
  });

  test("distinct observations get distinct ledger positions", async () => {
    const a = await port.record(observation("obs-3"));
    const b = await port.record(observation("obs-4"));
    expect(a.targetRef).not.toBe(b.targetRef);
  });

  test("the committed record carries Cognate's correlation ids as structured extensions, read back by ledger position", async () => {
    const sent = observation("obs-6");
    const receipt = await port.record(sent);
    const expected = { observationId: "obs-6", eventId: "evt-obs-6", tenant: "tenant-a", correlationId: "corr-sxr", causationId: null, runId: "run-9", scopeId: "root", capabilityId: "refund.approve" };
    expect(await port.readCorrelation(receipt.targetRef)).toEqual(expected);
    // A duplicate delivery resolves to the same committed record and the same correlation.
    const again = await port.record(sent);
    expect(again.status).toBe("duplicate");
    expect(await port.readCorrelation(again.targetRef)).toEqual(expected);
    expect(await port.readCorrelation(receipt.targetRef.replace(/:\d+$/, ":999999"))).toBeNull();
  });

  test("receipts carry no evidence or settlement claims", async () => {
    const receipt = await port.record(observation("obs-5"));
    expect(JSON.stringify(receipt)).not.toMatch(/evidence_id|settlement|direction/);
  });
});
