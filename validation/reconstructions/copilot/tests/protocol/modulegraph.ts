// Transitive static import scanner backing the CopilotKit-absence proof (prompt Phase 10:
// "verify a normal AG-UI client can communicate with Cognate without CopilotKit installed";
// settlement gates 19/22). From the given entry files it walks every statically importable
// module — Bun.Transpiler.scanImports for specifiers, Bun.resolveSync for resolution — and
// flags any raw specifier or resolved module path matching /copilotkit/i.
//
// A specifier is flagged even when it does not resolve, so an uninstalled CopilotKit import
// cannot hide behind a resolution error. A file that cannot be scanned is reported in
// `scanFailures` (not silently skipped), so the caller can fail rather than prove less.
export const FORBIDDEN_SPECIFIER = /copilotkit/i;

const BUILTIN_SPECIFIER = /^(node|bun|data|https?):/;
const SCANNABLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);

const loaderOf = (file: string): "ts" | "tsx" | "js" => {
  if (file.endsWith(".tsx")) return "tsx";
  if (file.endsWith(".ts") || file.endsWith(".mts") || file.endsWith(".cts")) return "ts";
  return "js";
};

export interface ScanHit {
  readonly file: string;
  readonly specifier?: string;
}

export interface GraphScan {
  /** Every module visited, by resolved path (symlinks resolved, so cycles terminate). */
  readonly files: readonly string[];
  /** Files whose imports could not be statically scanned — a caller treats these as reduced proof. */
  readonly scanFailures: readonly string[];
  /** Specifiers that did not resolve (platform binaries, optional native modules, ...). */
  readonly unresolved: readonly { readonly file: string; readonly specifier: string }[];
  /** Forbidden specifiers or module paths found in the reachable graph. */
  readonly hits: readonly ScanHit[];
}

export async function scanModuleGraph(entries: readonly string[]): Promise<GraphScan> {
  const files: string[] = [];
  const scanFailures: string[] = [];
  const unresolved: { file: string; specifier: string }[] = [];
  const hits: ScanHit[] = [];
  const visited = new Set<string>();
  const queue = [...entries];

  const fileHit = (file: string): void => {
    if (FORBIDDEN_SPECIFIER.test(file)) hits.push({ file });
  };
  const specifierHit = (file: string, specifier: string): void => {
    if (FORBIDDEN_SPECIFIER.test(specifier)) hits.push({ file, specifier });
  };

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);
    files.push(file);
    fileHit(file);
    if (!SCANNABLE_EXTENSIONS.has(file.slice(file.lastIndexOf(".")))) continue;
    let code: string;
    try {
      code = await Bun.file(file).text();
    } catch {
      scanFailures.push(file);
      continue;
    }
    let imports: readonly { path: string }[];
    try {
      imports = new Bun.Transpiler({ loader: loaderOf(file) }).scanImports(code);
    } catch {
      scanFailures.push(file);
      continue;
    }
    for (const imported of imports) {
      const specifier = imported.path;
      if (BUILTIN_SPECIFIER.test(specifier) || specifier.startsWith("\0")) continue;
      specifierHit(file, specifier);
      let resolved: string | undefined;
      try {
        resolved = Bun.resolveSync(specifier, file.slice(0, file.lastIndexOf("/")));
      } catch {
        resolved = undefined;
      }
      if (resolved === undefined) {
        unresolved.push({ file, specifier });
        continue;
      }
      if (SCANNABLE_EXTENSIONS.has(resolved.slice(resolved.lastIndexOf(".")))) queue.push(resolved);
    }
  }

  return { files, scanFailures, unresolved, hits };
}
