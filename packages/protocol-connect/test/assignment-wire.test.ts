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
