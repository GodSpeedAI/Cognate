import { test, expect } from "bun:test";
import { apiKeySource, assertSubscriptionUse } from "../src/index.ts";

test("ephemeral credential and independent automation policy", async () => {
  expect((await apiKeySource(async () => "test-secret").acquire()).headers.authorization).toBe("Bearer test-secret");
  const grant = { identityRef: "account-a", scopes: ["chatgpt.tokens.use.direct"], automationApproved: false };
  expect(() => assertSubscriptionUse(grant, "interactive")).not.toThrow();
  expect(() => assertSubscriptionUse(grant, "authorized_automation")).toThrow("explicit authorization");
  expect(() => assertSubscriptionUse({ ...grant, scopes: [] }, "interactive")).toThrow("not been authorized");
});
