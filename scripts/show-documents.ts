// `just show-documents` — Artifact Viewer, Documentation Mode.
//
// A loopback-only projection server over the documentation already in this repository.
// It reads Markdown, Mermaid sources, the working tree, and local Git history; it holds no
// database, generates no HTML corpus, copies no Markdown, and never commits anything.
//
//   ArtifactSource   working tree | Git revision      (where the state came from)
//   Artifact         markdown | mermaid | code | …    (what it is)
//   Provenance       commit, author, date, dirty      (facts shown around the artifact)
//   Projection       read | source | edit | history | compare
//
// Security boundary: the server binds to 127.0.0.1 only, canonicalizes every requested path,
// refuses anything outside the documentation root, and writes only to existing Markdown files
// inside that root. Historical revisions are read-only.
import { join } from "node:path";
import { prepareAssets, type ViewerAssets } from "./viewer/assets.ts";
import { buildCorpus, indexResponse, type Corpus } from "./viewer/corpus.ts";
import { LocalGitProvider, type GitAvailability } from "./viewer/git.ts";
import { ViewerError, resolveRoot } from "./viewer/paths.ts";
import { DocumentationService } from "./viewer/service.ts";
import type { ErrorResponse, HealthResponse } from "../docs/.viewer/src/wire.ts";

export const DEFAULT_PORT = 4177;
const PORT_ATTEMPTS = 20;
export const VERSION = "0.1.0";

export interface Options {
  cwd: string;
  docsRoot: string;
  port: number;
  open: boolean;
  hyperlinks: boolean;
  help: boolean;
}

export function parseOptions(argv: readonly string[], env: Record<string, string | undefined> = process.env): Options {
  const options: Options = {
    cwd: process.cwd(),
    docsRoot: "docs",
    port: Number(env.COGNATE_VIEWER_PORT ?? DEFAULT_PORT),
    open: env.COGNATE_VIEWER_OPEN === "1",
    hyperlinks: true,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--open") options.open = true;
    else if (argument === "--no-hyperlink") options.hyperlinks = false;
    else if (argument === "--docs") options.docsRoot = argv[++index] ?? options.docsRoot;
    else if (argument.startsWith("--docs=")) options.docsRoot = argument.slice("--docs=".length);
    else if (argument === "--port") options.port = Number(argv[++index] ?? DEFAULT_PORT);
    else if (argument.startsWith("--port=")) options.port = Number(argument.slice("--port=".length));
    else throw new ViewerError("invalid_path", `Unknown option: ${argument}`, "Run `just show-documents --help`.", 400);
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new ViewerError("invalid_path", `Not a usable port: ${options.port}`, undefined, 400);
  return options;
}

export const USAGE = `Artifact Viewer — Documentation Mode

Usage: just show-documents [--port <n>] [--docs <dir>] [--open] [--no-hyperlink]

  --port <n>        Preferred loopback port (default ${DEFAULT_PORT}; a nearby free port is used if taken)
  --docs <dir>      Documentation root to serve (default docs)
  --open            Open the viewer in a browser after starting (off by default)
  --no-hyperlink    Print plain URLs only, even in terminals that support OSC-8 links
  --help            Show this text

Environment: COGNATE_VIEWER_PORT, COGNATE_VIEWER_OPEN=1
The server binds to 127.0.0.1 only. Documentation stays canonical: the viewer writes only to
existing Markdown files inside the documentation root, and never commits.`;

/** OSC-8 hyperlink, emitted only when the terminal is likely to honour it. */
export function hyperlink(text: string, url: string, enabled: boolean): string {
  return enabled ? `\u001b]8;;${url}\u001b\\${text}\u001b]8;;\u001b\\` : text;
}

export interface BannerDetails {
  url: string;
  docsRoot: string;
  corpus: Corpus;
  git: GitAvailability;
  options: Options;
  rebuilt: boolean;
  buildMs: number;
  portChanged: boolean;
}

export function printBanner(details: BannerDetails): void {
  const { url, docsRoot, corpus, git, options, rebuilt, buildMs, portChanged } = details;
  const lines: string[] = [];
  if (rebuilt) lines.push(`Building viewer assets (${(buildMs / 1000).toFixed(1)}s)`, "");
  lines.push("Artifact Viewer — Documentation Mode", "");
  lines.push(`Serving: ${docsRoot}/ · ${corpus.docs.length} document${corpus.docs.length === 1 ? "" : "s"} · git ${git.available ? (git.version ?? "available") : "unavailable"}`);
  lines.push(`URL: ${url}`);
  if (portChanged) lines.push(`Note: port ${options.port} was in use; serving on ${new URL(url).port}.`);
  if (!git.available) lines.push(`Note: history is unavailable — ${git.reason ?? "Git was not usable"}`);
  lines.push("");
  lines.push(hyperlink("Open Artifact Viewer", url, options.hyperlinks));
  if (options.hyperlinks) lines.push(url);
  lines.push("Ctrl+C to stop");
  process.stdout.write(`${lines.join("\n")}\n`);
}

/** Bind the preferred port, stepping to a nearby free one rather than failing outright. */
export async function listen(handler: (request: Request) => Promise<Response>, options: { port: number; attempts?: number; hostname?: string }): Promise<{ server: ReturnType<typeof Bun.serve>; port: number; changed: boolean }> {
  const attempts = options.attempts ?? PORT_ATTEMPTS;
  const hostname = options.hostname ?? "127.0.0.1";
  const candidates = [...Array.from({ length: attempts + 1 }, (_, offset) => options.port + offset), 0];
  let lastError: unknown;
  for (const port of candidates) {
    try {
      return { server: Bun.serve({ hostname, port, fetch: handler, idleTimeout: 30 }), port, changed: port !== options.port };
    } catch (error) {
      lastError = error;
      const code = (error as { code?: string }).code ?? "";
      if (code !== "EADDRINUSE" && !/in use/i.test(String((error as Error).message ?? ""))) throw error;
    }
  }
  throw new ViewerError("internal", "No loopback port could be bound.", lastError instanceof Error ? lastError.message : String(lastError), 500);
}

/** Responses carry no CORS grant and a restrictive policy: this surface is not a general server. */
function securityHeaders(contentType: string, cache: string): Record<string, string> {
  return {
    "content-type": contentType,
    "cache-control": cache,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy":
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  };
}

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  svg: "image/svg+xml",
  woff2: "font/woff2",
  md: "text/markdown; charset=utf-8",
};

function contentTypeFor(path: string): string {
  return CONTENT_TYPES[(path.split(".").pop() ?? "").toLowerCase()] ?? "application/octet-stream";
}

/** Every failure travels as a typed JSON envelope so the interface can be truthful about it. */
function errorResponse(error: unknown): Response {
  const viewerError = error instanceof ViewerError ? error : new ViewerError("internal", error instanceof Error ? error.message : String(error), undefined, 500);
  const body: ErrorResponse = { error: { code: viewerError.code, message: viewerError.message, ...(viewerError.detail ? { detail: viewerError.detail } : {}) } };
  if (viewerError.status >= 500) process.stderr.write(`artifact viewer: ${viewerError.message}${viewerError.detail ? ` — ${viewerError.detail}` : ""}\n`);
  return Response.json(body, { status: viewerError.status, headers: securityHeaders("application/json; charset=utf-8", "no-store") });
}

export interface ServerContext {
  corpus: Corpus;
  service: DocumentationService;
  assets: ViewerAssets;
  git: LocalGitProvider;
  version: string;
}

/** Serve one file from the allowlisted presentation surface. */
function serveFile(path: string, contentType: string, cache: string, etag?: string): Response {
  return new Response(Bun.file(path), { headers: { ...securityHeaders(contentType, cache), ...(etag ? { etag } : {}) } });
}

export function createHandler(context: ServerContext): (request: Request) => Promise<Response> {
  const { corpus, service, assets, git } = context;
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method !== "GET" && request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: securityHeaders("text/plain; charset=utf-8", "no-store") });

      if (url.pathname === "/" || url.pathname === "/index.html") {
        const index = assets.styles.get("index.html");
        if (!index) throw new ViewerError("not_found", "Viewer shell missing.", "docs/.viewer/index.html", 500);
        return serveFile(index, "text/html; charset=utf-8", "no-store");
      }

      if (url.pathname.startsWith("/assets/")) {
        const name = url.pathname.slice("/assets/".length);
        if (name === "app.js") return serveFile(assets.bundlePath, "text/javascript; charset=utf-8", "no-store");
        // An explicit allowlist: no user-supplied path ever reaches the filesystem here.
        const allowed = name === "index.html" || name === "viewer.css" || name === "tokens.css" || name === "favicon.svg";
        const path = allowed ? assets.styles.get(name) : undefined;
        if (!path) throw new ViewerError("not_found", "No such viewer asset.", name, 404);
        return serveFile(path, contentTypeFor(name), "no-store");
      }

      if (url.pathname.startsWith("/fonts/")) {
        const path = assets.fonts.get(url.pathname.slice("/fonts/".length));
        if (!path) throw new ViewerError("not_found", "No such font file.", undefined, 404);
        return serveFile(path, "font/woff2", "public, max-age=31536000, immutable");
      }

      if (url.pathname === "/api/health") {
        const availability = await git.availability();
        const body: HealthResponse = {
          ok: true,
          root: `${corpus.prefix}/`,
          documents: corpus.docs.length,
          git: { available: availability.available, ...(availability.reason ? { reason: availability.reason } : {}), version: availability.version },
        };
        return Response.json(body, { headers: securityHeaders("application/json; charset=utf-8", "no-store") });
      }

      if (url.pathname === "/api/index") {
        return Response.json(indexResponse(corpus), { headers: securityHeaders("application/json; charset=utf-8", "no-store") });
      }

      if (url.pathname === "/api/document") {
        const body = await service.document(url.searchParams.get("path"), url.searchParams.get("rev"));
        return Response.json(body, { headers: securityHeaders("application/json; charset=utf-8", "no-store") });
      }

      if (url.pathname === "/api/history") {
        const body = await service.history(url.searchParams.get("path"), Number(url.searchParams.get("limit") ?? 200));
        return Response.json(body, { headers: securityHeaders("application/json; charset=utf-8", "no-store") });
      }

      if (url.pathname === "/api/compare") {
        const body = await service.compare(url.searchParams.get("path"), url.searchParams.get("from"), url.searchParams.get("to"));
        return Response.json(body, { headers: securityHeaders("application/json; charset=utf-8", "no-store") });
      }

      if (url.pathname === "/api/asset") {
        const asset = service.asset(url.searchParams.get("path"));
        return serveFile(asset.absolute, asset.contentType, "no-store");
      }

      if (url.pathname === "/api/save") {
        if (request.method !== "POST") throw new ViewerError("invalid_path", "Saving requires POST.", undefined, 405);
        // A page on another origin must not be able to write local documentation.
        const origin = request.headers.get("origin");
        if (origin && origin !== url.origin) throw new ViewerError("outside_root", "Cross-origin writes are refused.", origin, 403);
        let body: unknown;
        try {
          body = await request.json();
        } catch (error) {
          throw new ViewerError("invalid_path", "The save request was not valid JSON.", error instanceof Error ? error.message : undefined, 400);
        }
        const saved = await service.save(body);
        return Response.json(saved, { headers: securityHeaders("application/json; charset=utf-8", "no-store") });
      }

      throw new ViewerError("not_found", "No such endpoint.", url.pathname, 404);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Open the viewer in the platform browser. Opt-in only; a failure is reported, never hidden. */
async function openBrowser(url: string): Promise<void> {
  const command = process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
  try {
    Bun.spawn(command as string[], { stdout: "ignore", stderr: "ignore", stdin: "ignore" });
  } catch (error) {
    process.stderr.write(`artifact viewer: could not open a browser — ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2), cwd: string = process.cwd()): Promise<{ url: string; server: ReturnType<typeof Bun.serve> }> {
  const options = parseOptions(argv);
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return { url: "", server: undefined as unknown as ReturnType<typeof Bun.serve> };
  }
  options.cwd = cwd;

  const root = resolveRoot(options.cwd, options.docsRoot);
  const corpus = await buildCorpus(root);
  const git = new LocalGitProvider(corpus.repositoryRoot);
  const availability = await git.availability();
  const service = new DocumentationService(corpus, git);
  const assets = await prepareAssets({ viewerDir: join(root, ".viewer"), repositoryRoot: corpus.repositoryRoot });

  const handler = createHandler({ corpus, service, assets, git, version: VERSION });
  const { server, changed } = await listen(handler, { port: options.port });
  const url = `http://127.0.0.1:${server.port}`;

  printBanner({ url, docsRoot: options.docsRoot, corpus, git: availability, options, rebuilt: assets.rebuilt, buildMs: assets.buildMs, portChanged: changed });
  if (options.open) await openBrowser(url);

  const shutdown = (): void => {
    server.stop(true);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return { url, server };
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof ViewerError ? `${error.message}${error.detail ? ` — ${error.detail}` : ""}` : error instanceof Error ? error.message : String(error);
    process.stderr.write(`artifact viewer: ${message}\n`);
    process.exit(1);
  }
}
