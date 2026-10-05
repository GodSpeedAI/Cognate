// Phase 13 check 4: no CopilotKit-specific Cognate KERNEL primitive. Scans packages/**/src for
// reference-named primitives (CopilotAction, CopilotThread, CopilotChatPrimitive,
// CopilotGenerativeUI, CopilotHITL) and any /copilotkit/i identifier.
//
// Allowed by design (spec §29.1 profile compositions):
//   - profiles/copilot/** — the legitimate profile composition package;
//   - packages/profile/src — profile composition machinery.
// The ban targets kernel primitives: packages/kernel-cordis, packages/runtime-* and
// packages/kernel-api, which are additionally held to a stricter "no /copilot/i at all" rule.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { ROOT, rel, walk } from "./helpers.ts";

const PACKAGES_SRC = join(ROOT, "packages");

// Reference-named primitive identifiers, and the reference's own package namespace.
const FORBIDDEN_IDENTIFIER = /\bCopilot(?:Action|Thread|ChatPrimitive|GenerativeUI|HITL)\b|copilotkit/i;

const KERNEL_PACKAGES = ["kernel-api", "kernel-cordis", "runtime-api", "runtime-bun"];

describe("Phase 13 §4: no CopilotKit-specific kernel primitive", () => {
  const allSrcDirs = walk(PACKAGES_SRC, [".ts", ".tsx"])
    .map((file) => file.split("/src/")[0] + "/src")
    .filter((value, index, self) => self.indexOf(value) === index);
  const scanned = allSrcDirs.filter((dir) => dir !== join(PACKAGES_SRC, "profile", "src"));

  test("scan set is non-empty and covers the kernel packages", () => {
    expect(scanned.length).toBeGreaterThan(10);
    for (const name of KERNEL_PACKAGES) expect(scanned).toContain(join(PACKAGES_SRC, name, "src"));
  });

  test("packages/**/src (except packages/profile composition) defines no reference-named primitive", () => {
    const offenders: string[] = [];
    for (const dir of scanned) {
      for (const file of walk(dir, [".ts", ".tsx"])) {
        const text = readFileSync(file, "utf8");
        const m = FORBIDDEN_IDENTIFIER.exec(text);
        if (m) offenders.push(`${rel(file)}: ${JSON.stringify(m[0])}`);
      }
    }
    expect(offenders).toEqual([]);
  }, 30_000);

  test("kernel packages (kernel-api, kernel-cordis, runtime-api, runtime-bun) contain no /copilot/i at all", () => {
    const offenders: string[] = [];
    for (const name of KERNEL_PACKAGES) {
      for (const file of walk(join(PACKAGES_SRC, name, "src"), [".ts", ".tsx"])) {
        const text = readFileSync(file, "utf8");
        const m = /copilot/i.exec(text);
        if (m) offenders.push(`${rel(file)}: ${JSON.stringify(m[0])}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
