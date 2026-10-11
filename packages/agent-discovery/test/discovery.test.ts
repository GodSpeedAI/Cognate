import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverAgents, discoverMcpServers, probeVersion, probeAllowed, type AgentDefinition } from "../src/index.ts";

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
    expect(result.hooks.discovery).toBe("partial"); // runtime activation still unresolved
    expect(result.unverified[0]).toContain("authentication");
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("unknown plugin-only CLI remains unknown, not no-hooks", async () => {
  const [agent] = await discoverAgents({ home: "/nonexistent-cognate-test", path: "" }, [{ id: "pi", commands: ["pi"], configRoots: [".pi/agent"], skillRoots: [], extensionRoots: [] }]);
  expect(agent?.hooks.hooks).toHaveLength(0);
  expect(agent?.hooks.discovery).toBe("partial");
  expect(agent?.hooks.unresolved.join(" ")).toContain("dynamically");
});

test("Claude MCP definitions are collected from user, project, and plugin caches; Codex from config.toml", async () => {
  const root = await mkdtemp(join(tmpdir(), "cognate-mcp-"));
  const home = join(root, "home"), projectRoot = join(root, "project");
  try {
    await mkdir(join(home, ".claude/plugins/team-tools/.claude-plugin"), { recursive: true });
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(projectRoot, { recursive: true });
    await writeFile(join(home, ".claude.json"), JSON.stringify({ mcpServers: { fs: { command: "npx", args: ["-y", "@modelcontextprotocol/server-fs", "/tmp"] } } }));
    await writeFile(join(projectRoot, ".mcp.json"), JSON.stringify({ mcpServers: { docs: { type: "http", url: "https://docs.internal/mcp" } } }));
    await writeFile(join(home, ".claude/plugins/team-tools/.mcp.json"), JSON.stringify({ mcpServers: { lint: { command: "./lint-bridge" } } }));
    await writeFile(join(home, ".codex/config.toml"), ['# workspace tooling', '[mcp_servers.search]', 'command = "searchd"', 'args = ["--stdio", "-v"]', '', '[other_table]', 'ignored = true'].join("\n"));

    const claude = await discoverMcpServers("claude", home, projectRoot);
    expect(claude.servers.map((s) => s.name).sort()).toEqual(["docs", "fs", "team-tools:lint"]);
    const fs = claude.servers.find((s) => s.name === "fs")!;
    expect(fs).toMatchObject({ transport: "stdio", scope: "user", origin: "configuration" });
    expect(fs.command).toEqual(["npx", "-y", "@modelcontextprotocol/server-fs", "/tmp"]);
    expect(claude.servers.find((s) => s.name === "docs")).toMatchObject({ transport: "http", url: "https://docs.internal/mcp", scope: "project" });
    expect(claude.servers.find((s) => s.name === "team-tools:lint")).toMatchObject({ origin: "plugin", scope: "plugin" });

    const codex = await discoverMcpServers("codex", home);
    expect(codex.servers).toEqual([{
      name: "search", transport: "stdio", command: ["searchd", "--stdio", "-v"],
      scope: "user", sourcePath: join(home, ".codex/config.toml"), origin: "configuration",
    }]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Claude plugin hook definitions carry pluginId, plugin scope, and are never marked trusted", async () => {
  const root = await mkdtemp(join(tmpdir(), "cognate-plugin-hooks-"));
  const home = join(root, "home");
  try {
    await mkdir(join(home, ".claude/plugins/quality-pack/hooks"), { recursive: true });
    await writeFile(join(home, ".claude/plugins/quality-pack/hooks/hooks.json"), JSON.stringify({
      hooks: { PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "./audit.sh" }] }] },
    }));
    const [agent] = await discoverAgents({ home, path: "" }, [{ id: "claude", commands: ["claude"], configRoots: [".claude"], skillRoots: [], extensionRoots: [".claude/plugins"] }]);
    const pluginHook = agent!.hooks.hooks.find((h) => h.origin.pluginId === "quality-pack");
    expect(pluginHook).toBeDefined();
    expect(pluginHook).toMatchObject({ phase: "tool.after", origin: { scope: "plugin", pluginId: "quality-pack" }, discoveredFrom: "extension", trust: "unknown" });
    expect(pluginHook?.native).toMatchObject({ command: "./audit.sh" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

describe("allowlisted version probes", () => {
  test("only known harnesses and exactly the allowlisted arguments are permitted", () => {
    expect(probeAllowed(["/usr/local/bin/claude", "--version"])).toBe(true);
    expect(probeAllowed(["/usr/local/bin/claude", "--mcp", "serve"])).toBe(false);
    expect(probeAllowed(["sh", "-c", "rm -rf /"])).toBe(false);
    expect(probeAllowed(["/bin/claude"])).toBe(false);
  });

  test("probing a real fixture script reports its version line; failures stay evidence, not errors", async () => {
    const root = await mkdtemp(join(tmpdir(), "cognate-probe-"));
    try {
      const fixture = join(root, "fake-claude");
      await writeFile(fixture, "#!/bin/sh\necho '2.1.0 (Claude Code)'\n");
      await chmod(fixture, 0o755);
      const probe = await probeVersion("claude", fixture, 5000);
      expect(probe.version).toBe("2.1.0 (Claude Code)");
      expect(probe.command).toEqual([fixture, "--version"]);

      const failing = join(root, "broken-claude");
      await writeFile(failing, "#!/bin/sh\necho 'boom' >&2\nexit 3\n");
      await chmod(failing, 0o755);
      const refused = await probeVersion("claude", failing, 5000);
      expect(refused.version).toBeUndefined();
      expect(refused.evidence).toContain("failed");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
