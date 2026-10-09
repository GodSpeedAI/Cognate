// Package graph extracted from manifests and source imports, shared by architecture tests.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface PackageNode {
  readonly name: string;
  readonly dir: string;
  readonly declared: ReadonlySet<string>;
  /** Bare specifiers imported from src/ (not tests), e.g. `@godspeedai/cognate-events`, `cordis`, `react`. */
  readonly imports: ReadonlySet<string>;
}

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const IMPORT = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

export function bareName(specifier: string): string | undefined {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:") || specifier.startsWith("bun:") || specifier === "bun") return undefined;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

export function loadGraph(root = "."): PackageNode[] {
  const nodes: PackageNode[] = [];
  for (const base of ["packages", "profiles"]) {
    const baseDir = join(root, base);
    if (!existsSync(baseDir)) continue;
    for (const entry of readdirSync(baseDir)) {
      const dir = join(baseDir, entry);
      const manifestPath = join(dir, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const declared = new Set<string>([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]);
      const imports = new Set<string>();
      for (const file of files(join(dir, "src"))) {
        const text = readFileSync(file, "utf8");
        for (const match of text.matchAll(IMPORT)) {
          const name = bareName(match[1] ?? match[2] ?? match[3] ?? "");
          if (name) imports.add(name);
        }
      }
      nodes.push({ name: manifest.name, dir, declared, imports });
    }
  }
  return nodes;
}

/** Internal (@godspeedai/*) edges from source imports. */
export function internalEdges(nodes: readonly PackageNode[]): [string, string][] {
  const names = new Set(nodes.map((node) => node.name));
  return nodes.flatMap((node) => [...node.imports].filter((dep) => names.has(dep) && dep !== node.name).map((dep) => [node.name, dep] as [string, string]));
}

export function findCycle(nodes: readonly PackageNode[]): string[] | undefined {
  const adjacency = new Map<string, string[]>();
  for (const [from, to] of internalEdges(nodes)) adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (name: string): string[] | undefined => {
    if (state.get(name) === "done") return undefined;
    if (state.get(name) === "visiting") return [...stack.slice(stack.indexOf(name)), name];
    state.set(name, "visiting");
    stack.push(name);
    for (const next of adjacency.get(name) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(name, "done");
    return undefined;
  };
  for (const node of nodes) {
    const cycle = visit(node.name);
    if (cycle) return cycle;
  }
  return undefined;
}
