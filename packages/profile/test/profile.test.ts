// CG-PRF-001 (spec §29, §40.J/K): profiles compose registered components and never enlarge the kernel.
import { describe, expect, test } from "bun:test";
import * as kernelApi from "@cognate/kernel-api";
import { defineProfile, ProfileError, resolveProfile, type ComponentEntry } from "../src/index.ts";

const registry: ComponentEntry<string[]>[] = [
  { name: "sessions", package: "@cognate/runtime-bun", supported: true, contribute: () => ["sessions"] },
  { name: "agents", package: "@cognate/runtime-bun", supported: true, contribute: (o) => [`agents:${JSON.stringify(o ?? null)}`] },
  { name: "cognition", package: "@cognate/cognitive-ruvector", supported: true, contribute: () => ["ruvector"] },
  { name: "rvf", package: "@cognate/cognitive-rvf", supported: false, reason: "DEBT-006: RVF import integrity unproven", contribute: () => { throw new Error("must not be called"); } },
];

describe("profiles (§29)", () => {
  test("defineProfile validates and freezes", () => {
    const profile = defineProfile({ name: "research-workbench", components: ["sessions", "agents"], options: { agents: { max: 2 } } });
    expect(profile).toEqual({ name: "research-workbench", description: "", components: ["sessions", "agents"], options: { agents: { max: 2 } } });
    expect(Object.isFrozen(profile)).toBe(true);
    expect(() => defineProfile({ name: "", components: [] })).toThrow(ProfileError);
    expect(() => defineProfile({ name: "dup", components: ["a", "a"] })).toThrow(ProfileError);
  });

  test("resolution preserves order, passes options, and reports every unresolved component", () => {
    const resolved = resolveProfile(defineProfile({ name: "p", components: ["agents", "rvf", "browser", "sessions"], options: { agents: { max: 2 } } }), registry);
    expect(resolved.contributions.map((c) => [c.name, c.contribution])).toEqual([["agents", ['agents:{"max":2}']], ["sessions", ["sessions"]]]);
    expect(resolved.unresolved).toEqual([
      { name: "rvf", reason: "DEBT-006: RVF import integrity unproven" },
      { name: "browser", reason: "unknown component" },
    ]);
  });

  test("profiles add no kernel concepts: the kernel-api runtime surface is fixed", () => {
    expect(Object.keys(kernelApi).sort()).toEqual(["ActivationTimeoutError", "CleanupError", "PermanentActivationError", "ScopeClosedError", "UndeclaredCapabilityError", "allowCapabilities", "denyAll", "isCompatible", "isUnavailable", "rulePolicy"]);
  });
});
