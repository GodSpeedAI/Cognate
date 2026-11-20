// WP-23: the Connect wire request does not carry an assignment yet; the remote client must refuse it, never drop it.
import { expect, test } from "bun:test";
import { createRemoteRuntimeService } from "../src/index.ts";

test("a remote startRun with an assignment is refused before anything is sent", async () => {
  let sent = false;
  const transport = { unary: () => ((sent = true), Promise.reject(new Error("must not be called"))), stream: () => Promise.reject(new Error("unused")) };
  const service = createRemoteRuntimeService(transport as never, () => "token");
  const request = { agent: "a", input: null, idempotencyKey: "k", assignment: {} as never };
  await expect(service.startRun({ actor: { id: "u", kind: "user" }, tenant: "t" }, request)).rejects.toMatchObject({ code: "failed_precondition" });
  expect(sent).toBe(false);
});

test("a remote startRun with caseContext or linkExpiresAt is refused too (the wire would drop them)", async () => {
  let sent = false;
  const transport = { unary: () => ((sent = true), Promise.reject(new Error("must not be called"))), stream: () => Promise.reject(new Error("unused")) };
  const service = createRemoteRuntimeService(transport as never, () => "token");
  const caller = { actor: { id: "u", kind: "user" as const }, tenant: "t" };
  await expect(service.startRun(caller, { agent: "a", input: null, idempotencyKey: "k", caseContext: {} as never })).rejects.toMatchObject({ code: "failed_precondition" });
  await expect(service.startRun(caller, { agent: "a", input: null, idempotencyKey: "k", linkExpiresAt: "2026-11-15T00:00:00Z" })).rejects.toMatchObject({ code: "failed_precondition" });
  expect(sent).toBe(false);
});

test("a remote caller cannot supply trusted assignment link metadata", async () => {
  let sent = false;
  const transport = { unary: () => ((sent = true), Promise.reject(new Error("must not be called"))), stream: () => Promise.reject(new Error("unused")) };
  const service = createRemoteRuntimeService(transport as never, () => "token");
  const caller = { actor: { id: "u", kind: "user" as const }, tenant: "t" };
  await expect(service.startRun(caller, { agent: "a", input: null, idempotencyKey: "k", assignmentLinkId: "forged" })).rejects.toMatchObject({ code: "failed_precondition" });
  expect(sent).toBe(false);
});
