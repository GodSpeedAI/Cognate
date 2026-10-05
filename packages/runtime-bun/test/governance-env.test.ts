import { describe, expect, test } from "bun:test";
import { governanceFromEnv, SeaForgeAuthority } from "../src/index.ts";

const WORLD = `world:demo@sha256:${"a".repeat(64)}`;

describe("governanceFromEnv", () => {
  test("nothing set is off", () => {
    expect(governanceFromEnv({})).toEqual({ mode: "off" });
    expect(governanceFromEnv({ COGNATE_GOVERNANCE: "off" })).toEqual({ mode: "off" });
    expect(governanceFromEnv({ COGNATE_GOVERNANCE: "" })).toEqual({ mode: "off" });
  });

  test("sea-forge builds an authority, the pinned world, and the timeout enforcer", () => {
    const options = governanceFromEnv({ COGNATE_GOVERNANCE: "sea-forge", COGNATE_SEA_FORGE_SOCKET: "/tmp/x.sock", COGNATE_WORLD_REF: WORLD });
    expect(options.mode).toBe("sea-forge");
    expect(options.worldRef).toBe(WORLD);
    expect(options.authority).toBeInstanceOf(SeaForgeAuthority);
    expect(Object.keys(options.enforcers ?? {})).toEqual(["timeout_secs"]);
  });

  test("a wrong or incomplete environment throws instead of weakening", () => {
    const bad: Record<string, string>[] = [
      { COGNATE_GOVERNANCE: "shadow" },
      { COGNATE_GOVERNANCE: "sea-forge" },
      { COGNATE_GOVERNANCE: "sea-forge", COGNATE_SEA_FORGE_SOCKET: "/tmp/x.sock" },
      { COGNATE_GOVERNANCE: "sea-forge", COGNATE_SEA_FORGE_SOCKET: "/tmp/x.sock", COGNATE_WORLD_REF: "world:demo" },
      { COGNATE_GOVERNANCE: "sea-forge", COGNATE_WORLD_REF: WORLD },
      // settings that imply governance while the mode says otherwise are a misconfiguration, not "off"
      { COGNATE_SEA_FORGE_SOCKET: "/tmp/x.sock" },
      { COGNATE_GOVERNANCE: "off", COGNATE_WORLD_REF: WORLD },
    ];
    for (const env of bad) expect(() => governanceFromEnv(env), JSON.stringify(env)).toThrow();
  });
});
