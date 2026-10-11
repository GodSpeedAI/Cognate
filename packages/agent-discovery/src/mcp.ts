/**
 * Passive MCP-server definition inspection per harness. Only exact, well-known configuration
 * files are read; definitions are recorded as evidence and never connected to, spawned, or
 * validated for reachability. Unknown layouts produce an unresolved note, not a guess.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { isRecord, type HookScope } from "@godspeedai/cognate-hook-interoperability";
import type { HarnessId } from "@godspeedai/cognate-hook-interoperability";

export interface McpServerDefinition {
  readonly name: string;
  readonly transport: "stdio" | "http" | "sse" | "unknown";
  /** argv for stdio servers; recorded as evidence only — discovery never executes it. */
  readonly command?: readonly string[];
  readonly url?: string;
  readonly scope: HookScope;
  readonly sourcePath: string;
  readonly origin: "configuration" | "extension" | "plugin";
}

export interface McpInspection {
  readonly servers: readonly McpServerDefinition[];
  readonly unresolved: readonly string[];
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    const { stat } = await import("node:fs/promises");
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

function transportOf(value: Record<string, unknown>): McpServerDefinition["transport"] {
  if (typeof value.type === "string" && (value.type === "http" || value.type === "sse")) return value.type;
  if (typeof value.command === "string" || Array.isArray(value.command)) return "stdio";
  if (typeof value.url === "string") return "unknown";
  return "unknown";
}

function argvOf(value: Record<string, unknown>): readonly string[] | undefined {
  if (typeof value.command === "string") return [value.command, ...(Array.isArray(value.args) ? value.args.filter((a): a is string => typeof a === "string") : [])];
  if (Array.isArray(value.command)) return value.command.filter((c): c is string => typeof c === "string");
  return undefined;
}

function parseClaudeStyle(document: unknown, scope: HookScope, sourcePath: string, origin: McpServerDefinition["origin"], key = "mcpServers"): McpInspection {
  if (!isRecord(document) || !isRecord(document[key])) return { servers: [], unresolved: [`${sourcePath}: no ${key} object`] };
  const servers: McpServerDefinition[] = [];
  for (const [name, value] of Object.entries(document[key])) {
    if (!isRecord(value)) continue;
    servers.push({
      name,
      transport: transportOf(value),
      ...(argvOf(value) ? { command: argvOf(value)! } : {}),
      ...(typeof value.url === "string" ? { url: value.url } : {}),
      scope, sourcePath, origin,
    });
  }
  return { servers, unresolved: [] };
}

/** Minimal TOML reader for Codex `config.toml` MCP tables: [mcp_servers.name] + command/args/env. */
export function parseCodexMcpTables(toml: string, sourcePath: string): McpInspection {
  const servers: McpServerDefinition[] = [];
  let current: { name: string; values: Record<string, unknown> } | undefined;
  const flush = (): void => {
    if (current) {
      servers.push({
        name: current.name,
        transport: "stdio",
        ...(argvOf(current.values) ? { command: argvOf(current.values)! } : {}),
        scope: "user",
        sourcePath,
        origin: "configuration",
      });
    }
  };
  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const table = /^\[mcp_servers\.([A-Za-z0-9_-]+)\]$/.exec(line);
    if (table) {
      flush();
      current = { name: table[1]!, values: {} };
      continue;
    }
    if (/^\[/.test(line)) {
      flush();
      current = undefined;
      continue;
    }
    if (!current) continue;
    const pair = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!pair) continue;
    const [, key, rawValue] = pair;
    const trimmed = rawValue!.trim();
    if (trimmed.startsWith("[")) {
      const inner = trimmed.replace(/^\[|\]$/g, "");
      current.values[key!] = inner.split(",").map((item) => item.trim().replace(/^"|"$/g, "")).filter(Boolean);
    } else if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      current.values[key!] = trimmed.slice(1, -1);
    } else {
      current.values[key!] = trimmed;
    }
  }
  flush();
  return { servers, unresolved: toml.includes("[mcp_servers.") ? [] : [`${sourcePath}: no mcp_servers tables`] };
}

async function readJson(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

/** Claude plugin caches keep plugin-provided hooks/mcp under .claude/plugins; depth-limited scan. */
async function claudePluginMcp(home: string): Promise<McpInspection> {
  const root = join(home, ".claude", "plugins");
  const servers: McpServerDefinition[] = [];
  const unresolved: string[] = [];
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(root, entry.name, ".claude-plugin", "plugin.json");
      const mcpPath = join(root, entry.name, ".mcp.json");
      if (await fileExists(mcpPath)) {
        const parsed = parseClaudeStyle(await readJson(mcpPath), "plugin", mcpPath, "plugin");
        servers.push(...parsed.servers.map((server) => ({ ...server, name: `${entry.name}:${server.name}` })));
      } else if (await fileExists(manifestPath)) {
        unresolved.push(`${mcpPath}: plugin ${entry.name} declares no inspectable MCP definitions`);
      }
    }
  } catch {
    // No plugin cache: nothing to inspect.
  }
  return { servers, unresolved };
}

export async function discoverMcpServers(id: HarnessId, home: string, project?: string): Promise<McpInspection> {
  const servers: McpServerDefinition[] = [];
  const unresolved: string[] = [];
  const homeConfig = (path: string): string => join(home, path);

  if (id === "claude") {
    const userFile = homeConfig(".claude.json");
    if (await fileExists(userFile)) {
      const parsed = parseClaudeStyle(await readJson(userFile), "user", userFile, "configuration");
      servers.push(...parsed.servers);
    }
    if (project) {
      const projectFile = join(project, ".mcp.json");
      if (await fileExists(projectFile)) {
        const parsed = parseClaudeStyle(await readJson(projectFile), "project", projectFile, "configuration");
        servers.push(...parsed.servers);
      }
    }
    const plugins = await claudePluginMcp(home);
    servers.push(...plugins.servers);
    unresolved.push(...plugins.unresolved, "Claude enterprise managed MCP configuration is not statically discoverable from the user home");
  } else if (id === "codex") {
    const configFile = join(home, ".codex", "config.toml");
    if (await fileExists(configFile)) {
      const parsed = parseCodexMcpTables(await readFile(configFile, "utf8"), configFile);
      servers.push(...parsed.servers);
    }
    unresolved.push("Codex MCP servers defined at the organization level are not statically discoverable");
  } else if (id === "gemini") {
    const userFile = homeConfig(".gemini/settings.json");
    if (await fileExists(userFile)) {
      const parsed = parseClaudeStyle(await readJson(userFile), "user", userFile, "configuration");
      servers.push(...parsed.servers);
    }
    if (project) {
      const projectFile = join(project, ".gemini/settings.json");
      if (await fileExists(projectFile)) {
        const parsed = parseClaudeStyle(await readJson(projectFile), "project", projectFile, "configuration");
        servers.push(...parsed.servers);
      }
    }
    unresolved.push("Gemini extension-provided MCP servers require inspecting each extension's manifest");
  } else if (id === "opencode") {
    for (const [path, scope] of [[".config/opencode/opencode.json", "user"], [".opencode/opencode.json", "project"]] as const) {
      const file = scope === "user" ? homeConfig(path) : project ? join(project, path) : undefined;
      if (!file || !(await fileExists(file))) continue;
      const parsed = parseClaudeStyle(await readJson(file), scope as HookScope, file, "configuration", "mcp");
      servers.push(...parsed.servers);
    }
  } else if (id === "cline") {
    for (const candidate of [
      join(home, ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      join(home, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
    ]) {
      if (!(await fileExists(candidate))) continue;
      const parsed = parseClaudeStyle(await readJson(candidate), "user", candidate, "configuration");
      servers.push(...parsed.servers);
      break;
    }
    unresolved.push("Cline workspace-scoped MCP settings live inside VS Code profile storage and are not enumerated here");
  } else {
    unresolved.push(`No validated MCP inspection for ${id}; absence of definitions here is not proof of absence`);
  }
  return { servers, unresolved };
}
