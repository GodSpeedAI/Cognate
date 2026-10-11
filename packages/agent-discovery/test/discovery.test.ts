import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverAgents, type AgentDefinition } from "../src/index.ts";

test("read-only discovery reports installed evidence and untrusted project hooks, not activation", async () => {
  const root = await mkdtemp(join(tmpdir(), "cognate-discovery-"));
  const home = join(root, "home"), projectRoot = join(root, "project"), bin = join(root, "bin");
  try {
    await mkdir(join(projectRoot, ".claude"), { recursive: true });
    await mkdir(join(home, ".claude/skills/example-skill"), { recursive: true });
    await mkdir(bin);
    await writeFile(join(projectRoot, ".claude/settings.json"), JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo never-execute" }] }] } }));
    await writeFile(join(bin, "claude"), "#!/bin/sh\nexit 1\n");
    await chmod(join(bin, "claude"), 0o755);
    const registry: AgentDefinition[] = [{ id: "claude", commands: ["claude"], configRoots: [".claude"], skillRoots: [".claude/skills"], extensionRoots: [] }];
    const result = (await discoverAgents({ home, projectRoot, path: bin, platform: "linux" }, registry))[0]!;
    expect(result.status).toBe("executable_and_configured");
    expect(result.skills).toEqual([join(home, ".claude/skills/example-skill")]);
    expect(result.hooks.hooks).toHaveLength(1);
    expect(result.hooks.hooks[0]).toMatchObject({ phase: "tool.before", trust: "unknown", discoveredFrom: "configuration" });
    expect(result.hooks.discovery).toBe("partial"); // plugin hooks still unresolved
    expect(result.unverified[0]).toContain("authentication");
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("unknown plugin-only CLI remains unknown, not no-hooks", async () => {
  const [agent] = await discoverAgents({ home: "/nonexistent-cognate-test", path: "" }, [{ id: "pi", commands: ["pi"], configRoots: [".pi/agent"], skillRoots: [], extensionRoots: [] }]);
  expect(agent?.hooks.hooks).toHaveLength(0);
  expect(agent?.hooks.discovery).toBe("partial");
  expect(agent?.hooks.unresolved.join(" ")).toContain("dynamically");
});
