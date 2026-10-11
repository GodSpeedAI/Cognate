/**
 * Passive agent environment inspection. No subprocesses, shell evaluation, imports from
 * observed plugins, network requests, credential reads, or hook execution occur.
 * This registry is an independent implementation informed by the MIT skills.sh agent inventory.
 */
import { access, readFile, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { delimiter, join, resolve } from "node:path";
import {
  mapNativeEvent, parseDeclarativeHooks, type HarnessId,
  type HookDefinition, type HookInventory, type HookScope,
} from "@godspeedai/cognate-hook-interoperability";

export interface AgentDefinition {
  readonly id: HarnessId;
  readonly commands: readonly string[];
  readonly configRoots: readonly string[];
  readonly skillRoots: readonly string[];
  readonly extensionRoots: readonly string[];
}
export interface AgentEnvironment {
  readonly id: HarnessId;
  readonly status: "not_detected" | "configured" | "executable_present" | "executable_and_configured";
  readonly executablePaths: readonly string[];
  readonly configPaths: readonly string[];
  readonly skills: readonly string[];
  readonly extensions: readonly string[];
  readonly hooks: HookInventory;
  /** Inert paths and observations only; presence does not imply authentication or capability. */
  readonly evidence: readonly string[];
  readonly unverified: readonly string[];
}
export interface DiscoveryOptions {
  readonly home: string;
  readonly projectRoot?: string;
  readonly path?: string;
  readonly platform?: NodeJS.Platform;
  /** Define extra roots for global agent skills/config without monkey-patching HOME. */
  readonly extraSkillRoots?: readonly string[];
}
export const AGENT_REGISTRY: readonly AgentDefinition[] = [
  { id: "claude", commands: ["claude"], configRoots: [".claude"], skillRoots: [".claude/skills"], extensionRoots: [".claude/plugins"] },
  { id: "codex", commands: ["codex"], configRoots: [".codex"], skillRoots: [".agents/skills", ".codex/skills"], extensionRoots: [".codex/plugins"] },
  { id: "gemini", commands: ["gemini"], configRoots: [".gemini"], skillRoots: [".gemini/skills"], extensionRoots: [".gemini/extensions"] },
  { id: "opencode", commands: ["opencode"], configRoots: [".config/opencode", ".opencode"], skillRoots: [".config/opencode/skills", ".opencode/skills"], extensionRoots: [".config/opencode/plugins", ".opencode/plugins"] },
  { id: "pi", commands: ["pi"], configRoots: [".pi/agent"], skillRoots: [".pi/agent/skills"], extensionRoots: [".pi/agent/extensions"] },
  { id: "cline", commands: ["cline"], configRoots: [".cline", ".clinerules"], skillRoots: [".cline/skills", ".clinerules/skills"], extensionRoots: [".clinerules/hooks"] },
  { id: "cursor", commands: ["cursor", "cursor-agent"], configRoots: [".cursor"], skillRoots: [".cursor/skills"], extensionRoots: [".cursor/plugins"] },
  { id: "windsurf", commands: ["windsurf"], configRoots: [".windsurf"], skillRoots: [".windsurf/skills"], extensionRoots: [] },
  { id: "amp", commands: ["amp"], configRoots: [".config/amp", ".amp"], skillRoots: [".agents/skills"], extensionRoots: [] },
  { id: "goose", commands: ["goose"], configRoots: [".config/goose", ".goose"], skillRoots: [".agents/skills"], extensionRoots: [] },
  { id: "aider", commands: ["aider"], configRoots: [".aider.conf.yml"], skillRoots: [], extensionRoots: [] },
  { id: "qwen", commands: ["qwen"], configRoots: [".qwen"], skillRoots: [".qwen/skills"], extensionRoots: [] },
  { id: "kimi", commands: ["kimi"], configRoots: [".kimi"], skillRoots: [".kimi/skills"], extensionRoots: [] },
  { id: "copilot", commands: ["copilot"], configRoots: [".github"], skillRoots: [".github/skills"], extensionRoots: [] },
  { id: "roo", commands: ["roo"], configRoots: [".roo"], skillRoots: [".roo/skills"], extensionRoots: [] },
  { id: "kilocode", commands: ["kilocode"], configRoots: [".kilocode"], skillRoots: [".kilocode/skills"], extensionRoots: [] },
  { id: "continue", commands: ["cn"], configRoots: [".continue"], skillRoots: [], extensionRoots: [] },
];
const isFile = async (path: string): Promise<boolean> => {
  try { return (await stat(path)).isFile(); } catch { return false; }
};
const exists = async (path: string): Promise<boolean> => {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
};
const isExecutable = async (path: string, platform: NodeJS.Platform): Promise<boolean> => {
  try { await access(path, platform === "win32" ? constants.F_OK : constants.X_OK); return (await stat(path)).isFile(); } catch { return false; }
};
const listNames = async (path: string): Promise<string[]> => {
  try { return (await readdir(path, { withFileTypes: true })).filter(x => x.isDirectory() || x.isFile()).map(x => x.name).sort(); }
  catch { return []; }
};
function dedupe<T>(a: readonly T[]): T[] { return [...new Set(a)]; }
function candidatePaths(raw: string, home: string, project?: string): string[] {
  return dedupe([resolve(home, raw), ...(project ? [resolve(project, raw)] : [])]);
}
export async function findExecutables(commands: readonly string[], rawPath: string, platform: NodeJS.Platform): Promise<string[]> {
  const suffixes = platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  const result: string[] = [];
  for (const root of rawPath.split(delimiter).filter(Boolean)) {
    for (const command of commands) for (const suffix of suffixes) {
      const file = join(root, command + suffix);
      if (await isExecutable(file, platform)) result.push(file);
    }
  }
  return dedupe(result);
}

async function declarativeHookFiles(id: HarnessId, home: string, project?: string): Promise<{ path: string; scope: HookScope }[]> {
  const entries: { path: string; scope: HookScope }[] = [];
  const add = (p: string, scope: HookScope) => entries.push({ path: p, scope });
  if (id === "claude") {
    add(join(home, ".claude/settings.json"), "user");
    if (project) { add(join(project, ".claude/settings.json"), "project"); add(join(project, ".claude/settings.local.json"), "local"); }
  }
  if (id === "gemini") {
    add(join(home, ".gemini/settings.json"), "user");
    if (project) add(join(project, ".gemini/settings.json"), "project");
  }
  if (id === "codex") {
    add(join(home, ".codex/hooks.json"), "user");
    if (project) add(join(project, ".codex/hooks.json"), "project");
  }
  return entries;
}

function hookExecutable(path: string, event: string, scope: HookScope): HookDefinition {
  const origin = { harness: "cline" as const, event, scope, sourcePath: path };
  const mapped = mapNativeEvent("cline", event);
  return {
    id: createHash("sha256").update(JSON.stringify(origin)).digest("hex").slice(0, 24),
    origin, ...(mapped.phase ? { phase: mapped.phase } : {}),
    fidelity: mapped.fidelity, handler: "command",
    native: { executablePath: path }, enabled: true, trust: "unknown",
    discoveredFrom: "executable", evidence: [path],
  };
}
async function discoverHooks(id: HarnessId, home: string, project?: string): Promise<HookInventory> {
  const hooks: HookDefinition[] = [], unresolved: string[] = [];
  for (const item of await declarativeHookFiles(id, home, project)) {
    if (!await isFile(item.path)) continue;
    try {
      const value: unknown = JSON.parse(await readFile(item.path, "utf8"));
      const inv = parseDeclarativeHooks(value, { harness: id, scope: item.scope, sourcePath: item.path });
      hooks.push(...inv.hooks);
      unresolved.push(...inv.unresolved.map(x => `${item.path}: ${x}`));
    } catch {
      unresolved.push(`${item.path}: invalid or unreadable hook configuration`);
    }
  }
  if (id === "cline") {
    const dirs = [join(home, "Documents/Cline/Hooks"), ...(project ? [join(project, ".clinerules/hooks")] : [])];
    for (const dir of dirs) for (const name of await listNames(dir)) {
      const path = join(dir, name);
      if (await isFile(path)) hooks.push(hookExecutable(path, name, dir.includes(".clinerules") ? "project" : "user"));
    }
    unresolved.push("Cline hook enablement requires inspecting the host's active settings; file presence is not activation");
  }
  if (id === "codex") unresolved.push("Codex config.toml and managed/plugin hooks are not statically enumerated by this resolver");
  if (id === "claude") unresolved.push("Claude plugin hooks and managed settings require separate effective-config inspection");
  if (id === "gemini") unresolved.push("Gemini extension hooks and system settings require separate effective-config inspection");
  if (id === "opencode") unresolved.push("OpenCode lifecycle hooks may be registered dynamically by plugins");
  if (id === "pi") unresolved.push("Pi hooks may be registered dynamically by extensions");
  if (hooks.length === 0 && unresolved.length === 0) unresolved.push("No validated hook resolver for this CLI; empty configuration is not proof of no hooks");
  const unique = new Map(hooks.map(h => [h.id, h]));
  return { harness: id, discovery: unresolved.length ? "partial" : "complete", hooks: [...unique.values()], unresolved };
}
export async function inspectAgent(def: AgentDefinition, options: DiscoveryOptions): Promise<AgentEnvironment> {
  const platform = options.platform ?? process.platform;
  const home = resolve(options.home), project = options.projectRoot ? resolve(options.projectRoot) : undefined;
  const executablePaths = await findExecutables(def.commands, options.path ?? process.env.PATH ?? "", platform);
  const configPaths = (await Promise.all(def.configRoots.flatMap(root => candidatePaths(root, home, project)).map(async path => await exists(path) ? path : undefined))).filter((v): v is string => !!v);
  const skills = (await Promise.all([...def.skillRoots, ...(options.extraSkillRoots ?? [])].flatMap(root => candidatePaths(root, home, project)).map(async root => (await listNames(root)).map(name => join(root, name))))).flat();
  const extensions = (await Promise.all(def.extensionRoots.flatMap(root => candidatePaths(root, home, project)).map(async root => (await listNames(root)).map(name => join(root, name))))).flat();
  const hooks = await discoverHooks(def.id, home, project);
  const configured = configPaths.length > 0;
  const found = executablePaths.length > 0;
  const status = found && configured ? "executable_and_configured" : found ? "executable_present" : configured ? "configured" : "not_detected";
  return {
    id: def.id, status, executablePaths, configPaths: dedupe(configPaths),
    skills: dedupe(skills), extensions: dedupe(extensions), hooks,
    evidence: dedupe([...executablePaths, ...configPaths, ...hooks.hooks.flatMap(h => h.evidence)]),
    unverified: ["Version, current session, authentication, active plugins, remote-host executability and capability are not inferred from presence."],
  };
}
/** Includes undetected entries for truthful inventory; caller may filter for display. */
export async function discoverAgents(options: DiscoveryOptions, registry: readonly AgentDefinition[] = AGENT_REGISTRY): Promise<AgentEnvironment[]> {
  return Promise.all(registry.map(def => inspectAgent(def, options)));
}
