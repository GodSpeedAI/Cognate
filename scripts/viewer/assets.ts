/**
 * The viewer's presentation surface, assembled locally.
 *
 * The committed surface stays simple: `docs/.viewer/index.html` plus its tokens, styles, and
 * TypeScript modules. The modules import pinned local dependencies, so a bundle is generated
 * with Bun's bundler and cached under `.tmp/viewer/` keyed by a hash of its inputs. Nothing is
 * fetched at runtime: after `bun install`, the viewer works with no network at all.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ViewerError } from "./paths.ts";

/** The exact font files the styles reference, mapped to their pinned local package. */
export const FONT_FILES: ReadonlyMap<string, string> = new Map([
  ["space-grotesk-latin-wght-normal.woff2", "@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2"],
  ["space-grotesk-latin-ext-wght-normal.woff2", "@fontsource-variable/space-grotesk/files/space-grotesk-latin-ext-wght-normal.woff2"],
  ["inter-latin-wght-normal.woff2", "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"],
  ["inter-latin-ext-wght-normal.woff2", "@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2"],
  ["jetbrains-mono-latin-wght-normal.woff2", "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2"],
  ["jetbrains-mono-latin-ext-wght-normal.woff2", "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2"],
]);

/** The only styles and assets served from `docs/.viewer/`; there is no directory listing. */
export const STATIC_FILES: readonly string[] = ["index.html", "viewer.css", "tokens.css", "favicon.svg"];

export interface ViewerAssets {
  viewerDir: string;
  bundlePath: string;
  styles: Map<string, string>;
  fonts: Map<string, string>;
  rebuilt: boolean;
  buildMs: number;
}

async function hashInputs(viewerDir: string, repositoryRoot: string): Promise<string> {
  const hash = createHash("sha256");
  const walk = async (dir: string): Promise<void> => {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else {
        hash.update(entry.name);
        hash.update(await readFile(path));
      }
    }
  };
  await walk(join(viewerDir, "src"));
  for (const name of ["viewer.css", "tokens.css", "index.html"]) {
    const path = join(viewerDir, name);
    if (existsSync(path)) {
      hash.update(name);
      hash.update(await readFile(path));
    }
  }
  // A dependency upgrade must rebuild the bundle even though no viewer source changed.
  hash.update(await readFile(join(repositoryRoot, "package.json")));
  return hash.digest("hex").slice(0, 16);
}

export async function prepareAssets(options: { viewerDir: string; repositoryRoot: string; cacheDir?: string }): Promise<ViewerAssets> {
  const { viewerDir, repositoryRoot } = options;
  const entry = join(viewerDir, "src", "app.ts");
  if (!existsSync(entry)) throw new ViewerError("not_found", `Viewer entry not found: ${entry}`, undefined, 500);

  const styles = new Map<string, string>();
  for (const name of STATIC_FILES) {
    const path = join(viewerDir, name);
    if (existsSync(path)) styles.set(name, path);
  }
  for (const required of ["index.html", "viewer.css", "tokens.css"]) {
    if (!styles.has(required)) throw new ViewerError("not_found", `Viewer asset missing: docs/.viewer/${required}`, undefined, 500);
  }

  const fonts = new Map<string, string>();
  for (const [name, packagePath] of FONT_FILES) {
    const path = resolve(repositoryRoot, "node_modules", packagePath);
    if (!existsSync(path)) throw new ViewerError("not_found", `Font package missing: ${packagePath}`, "Run `bun install`.", 500);
    fonts.set(name, path);
  }

  const cacheDir = options.cacheDir ?? join(repositoryRoot, ".tmp", "viewer");
  const digest = await hashInputs(viewerDir, repositoryRoot);
  const outDir = join(cacheDir, digest);
  const bundlePath = join(outDir, "app.js");
  const cached = existsSync(bundlePath) && (await stat(bundlePath)).size > 0;

  const started = Date.now();
  if (!cached) {
    await mkdir(outDir, { recursive: true });
    const result = await Bun.build({ entrypoints: [entry], target: "browser", outdir: outDir, naming: "app.js", minify: true, sourcemap: "none" });
    if (!result.success || !existsSync(bundlePath)) {
      const detail = result.logs.map((log) => log.message).join("; ") || "no diagnostics";
      throw new ViewerError("internal", "The viewer bundle failed to build.", detail, 500);
    }
  }
  return { viewerDir, bundlePath, styles, fonts, rebuilt: !cached, buildMs: Date.now() - started };
}
