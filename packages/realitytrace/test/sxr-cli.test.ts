// CG-RT-002 (spec §20, Phase 5): the SXR CLI adapter against the real, pinned binary (RealityTrace v0.4.0).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

type SnapshotBehavior = "created" | "no-rulebook" | "error";

/**
 * A stand-in sxr that records each call's arguments and answers with the JSON fields prepare() reads.
 * `snapshot create` behaves as requested: a snapshot, the no-rulebook refusal (exit 3), or a generic failure (exit 1).
 */
function stubSxr(fakeDir: string, snapshot: SnapshotBehavior): { bin: string; log: string } {
  const log = join(fakeDir, "calls.log");
  const bin = join(fakeDir, "sxr");
  const snapshotAnswer = {
    created: `echo '{"snapshot_id":"sha256:fake-snapshot"}'`,
    "no-rulebook": `echo "realitytrace: repo repo-fake has no semantic configuration; run sxr semantic configure" >&2; exit 3`,
    error: `echo "realitytrace: internal failure" >&2; exit 1`,
  }[snapshot];
  writeFileSync(bin, `#!/bin/sh
echo "$*" >> "${log}"
case "$*" in
  "repo enroll "*) echo '{"repo_id":"repo-fake"}' ;;
  "semantic configure "*) echo '{"state":"semantic"}' ;;
  "snapshot create "*) ${snapshotAnswer} ;;
  "question declare "*) echo '{"question_id":"question-fake"}' ;;
  "threshold declare "*) echo '{"threshold_id":"threshold-fake"}' ;;
  "run begin "*) echo '{"run_id":"run-fake"}' ;;
  *) echo '{}' ;;
esac
`);
  chmodSync(bin, 0o755);
  return { bin, log };
}

describe("SXR CLI prepare ordering", () => {
  test("prepare creates a snapshot and begins the run on it", async () => {
    const fakeDir = mkdtempSync(join(tmpdir(), "cognate-sxr-fake-"));
    try {
      const stub = stubSxr(fakeDir, "created");
      const fakePort = createSxrCliPort({ bin: stub.bin, repoDir: join(fakeDir, "repo"), semanticEntry: "models/core.sea" });
      const prepared = await fakePort.prepare({ title: "Does the refund flow execute as declared?" });

      const calls = readFileSync(stub.log, "utf8").trim().split("\n");
      const configureAt = calls.findIndex((call) => call.startsWith("semantic configure "));
      const snapshotAt = calls.findIndex((call) => call.startsWith("snapshot create "));
      const beginAt = calls.findIndex((call) => call.startsWith("run begin "));
      expect(configureAt).toBeGreaterThanOrEqual(0);
      expect(calls[configureAt]).toContain("--entry models/core.sea");
      expect(snapshotAt).toBeGreaterThan(configureAt);
      expect(beginAt).toBeGreaterThan(snapshotAt);
      expect(calls[beginAt]).toContain("--snapshot sha256:fake-snapshot");
      expect(calls[beginAt]).not.toContain("snapshot:genesis");
      expect(prepared.runId).toBe("run-fake");
      expect(prepared.snapshot).toEqual({ id: "sha256:fake-snapshot", source: "rulebook" });
    } finally {
      rmSync(fakeDir, { recursive: true, force: true });
    }
  });

  test("without a rulebook prepare falls back to genesis and says so", async () => {
    const fakeDir = mkdtempSync(join(tmpdir(), "cognate-sxr-fake-"));
    try {
      const stub = stubSxr(fakeDir, "no-rulebook");
      const fakePort = createSxrCliPort({ bin: stub.bin, repoDir: join(fakeDir, "repo") });
      const prepared = await fakePort.prepare({ title: "Does the refund flow execute as declared?" });

      const calls = readFileSync(stub.log, "utf8").trim().split("\n");
      expect(calls.some((call) => call.startsWith("semantic configure "))).toBe(false);
      const beginAt = calls.findIndex((call) => call.startsWith("run begin "));
      expect(calls[beginAt]).toContain("--snapshot snapshot:genesis");
      expect(prepared.runId).toBe("run-fake");
      expect(prepared.snapshot).toEqual({ id: "snapshot:genesis", source: "none" });
    } finally {
      rmSync(fakeDir, { recursive: true, force: true });
    }
  });

  test("other snapshot errors still fail", async () => {
    const fakeDir = mkdtempSync(join(tmpdir(), "cognate-sxr-fake-"));
    try {
      const stub = stubSxr(fakeDir, "error");
      const fakePort = createSxrCliPort({ bin: stub.bin, repoDir: join(fakeDir, "repo") });
      await expect(fakePort.prepare({ title: "Does the refund flow execute as declared?" })).rejects.toThrow(/snapshot create failed \(exit 1\)/);

      const calls = readFileSync(stub.log, "utf8").trim().split("\n");
      expect(calls.some((call) => call.startsWith("run begin "))).toBe(false);
    } finally {
      rmSync(fakeDir, { recursive: true, force: true });
    }
  });
});
