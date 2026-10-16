// The starter test: confirms the domain model parses. Extend or replace this as the app grows.
import { describe, expect, test } from "bun:test";
import { loadSemanticProjection } from "@godspeedai/cognate-domainforge";

describe("starter domain model", () => {
  test("domain/example.sea parses into semantic objects", async () => {
    const source = await Bun.file(new URL("../domain/example.sea", import.meta.url)).text();
    const result = loadSemanticProjection(source, { uri: "domain/example.sea" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.projection.objects.length).toBeGreaterThan(0);
  });
});
