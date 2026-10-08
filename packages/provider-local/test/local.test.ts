import { expect, test } from "bun:test";
import { modelContract } from "@godspeedai/capabilities";
import { localProvider } from "../src/index.ts";

test("local provider publishes an honest capability contract", () => {
  expect(modelContract(localProvider({ id: "offline" }))).toMatchObject({ id: "model.generate", attributes: { provider: "local:offline", tool_use: true, structured_output: true, stream: true } });
});
