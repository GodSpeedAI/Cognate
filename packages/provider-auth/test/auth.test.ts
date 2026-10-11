import { test, expect } from "bun:test";
import { apiKeySource, bearerSource, credentialHeaders, assertSubscriptionUse } from "../src/index.ts";

test("ephemeral credential and independent automation policy", async () => {
  expect((await apiKeySource(async () => "test-secret").acquire()).headers.authorization).toBe("Bearer test-secret");
  const grant = { identityRef: "account-a", scopes: ["chatgpt.tokens.use.direct"], automationApproved: false };
  expect(() => assertSubscriptionUse(grant, "interactive")).not.toThrow();
  expect(() => assertSubscriptionUse(grant, "authorized_automation")).toThrow("explicit authorization");
  expect(() => assertSubscriptionUse({ ...grant, scopes: [] }, "interactive")).toThrow("not been authorized");
});

test("apiKeySource supports header variants and refuses empty keys", async () => {
  const bearer = await apiKeySource(() => "k1").acquire();
  expect(bearer.headers).toEqual({ authorization: "Bearer k1" });
  const raw = await apiKeySource(() => "k2", "x-api-key").acquire();
  expect(raw.headers).toEqual({ "x-api-key": "k2" });
  await expect(apiKeySource(() => "").acquire()).rejects.toThrow("Credential unavailable");
});

test("bearerSource leases the token as a Bearer header; leases are not cached", async () => {
  let value = "first";
  const source = bearerSource(() => value);
  expect((await source.acquire()).headers.authorization).toBe("Bearer first");
  value = "second";
  // Credentials resolve per request: a rotated secret is picked up on the next lease.
  expect((await source.acquire()).headers.authorization).toBe("Bearer second");
});

test("credentialHeaders resolves a source per call and is empty without one", async () => {
  expect(await credentialHeaders(undefined)).toEqual({});
  let calls = 0;
  const headers = await credentialHeaders({ async acquire() { calls++; return { headers: { authorization: "Bearer t" }, expiresAt: 123 }; } });
  expect(headers).toEqual({ authorization: "Bearer t" });
  expect(calls).toBe(1);
  // The lease metadata (expiry, identity) must not leak into request headers.
  expect(Object.keys(headers)).not.toContain("expiresAt");
});
