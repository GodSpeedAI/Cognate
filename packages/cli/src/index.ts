// CG-CLI-001 (spec §37 Phase 10): `cognate create` (starter generation with profiles) and `cognate dev`
// (runtime + Connect + AG-UI + UI server). Packages are not published to a registry (DEBT-016): `create`
// vendors the `@cognate/*` packages a profile needs from `--source` with `bun pm pack` and pins them with
// `file:` dependencies plus a package.json `overrides` map, so `workspace:*` inside the packed tarballs
// resolves outside the workspace.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { RuntimeService } from "@cognate/runtime-api";

export interface CreateOptions {
  readonly dir: string;
  readonly profile: "copilot" | "harness";
  /** Path to a Cognate source checkout whose packages are packed and vendored (packages are not on npm; DEBT-016). */
  readonly source: string;
  /** Optional components requested beyond the profile; unsupported ones are reported and never imported. */
  readonly with?: readonly string[];
}

export interface CreateReport {
  readonly dir: string;
  readonly files: readonly string[];
  readonly vendored: readonly string[];
  readonly unsupported: readonly { readonly name: string; readonly reason: string }[];
}

/** `--with` names the starter cannot yet wire up, with a specific reason where one is known. */
const KNOWN_UNSUPPORTED: Readonly<Record<string, string>> = {
  sona: "SONA was rejected as a ranker (ADR-0005); adaptive ranking is built in via @cognate/capabilities createOutcomeRanker (UCB1)",
};

/** Root `@cognate/*` package names a generated app's own package.json depends on, per profile. */
const PROFILE_ROOTS: Readonly<Record<CreateOptions["profile"], readonly string[]>> = {
  copilot: ["@cognate/cli", "@cognate/profile-copilot", "@cognate/domainforge", "@cognate/provider-local"],
  harness: ["@cognate/cli", "@cognate/profile-harness", "@cognate/domainforge", "@cognate/provider-local"],
};

async function copyDir(srcDir: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  await cp(srcDir, destDir, { recursive: true });
}

/** Maps every `@cognate/*` package name in `--source` to its directory, by reading each package.json. */
async function indexCognatePackages(source: string): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  for (const group of ["packages", "profiles"]) {
    const groupDir = join(source, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of await readdir(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgDir = join(groupDir, entry.name);
      const pkgJsonPath = join(pkgDir, "package.json");
      if (!existsSync(pkgJsonPath)) continue;
      const manifest = JSON.parse(await readFile(pkgJsonPath, "utf8")) as { readonly name?: string };
      if (manifest.name) byName.set(manifest.name, pkgDir);
    }
  }
  return byName;
}

/** BFS over `@cognate/*` `dependencies` edges from `roots`, returning every reachable package name (roots included). */
async function transitiveClosure(roots: readonly string[], byName: ReadonlyMap<string, string>): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    const pkgDir = byName.get(name);
    if (!pkgDir) throw new Error(`cognate create: cannot find source package "${name}" under --source`);
    seen.add(name);
    const manifest = JSON.parse(await readFile(join(pkgDir, "package.json"), "utf8")) as { readonly dependencies?: Readonly<Record<string, string>> };
    for (const dep of Object.keys(manifest.dependencies ?? {})) {
      if (dep.startsWith("@cognate/") && !seen.has(dep)) queue.push(dep);
    }
  }
  return [...seen];
}

/** `bun pm pack --quiet --destination` into `destination`; stdout is the tarball's full path. */
async function packPackage(pkgDir: string, destination: string): Promise<string> {
  const proc = Bun.spawn(["bun", "pm", "pack", "--quiet", "--destination", destination], { cwd: pkgDir, stdout: "pipe", stderr: "pipe" });
  const [exit, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  if (exit !== 0) throw new Error(`cognate create: "bun pm pack" failed in ${pkgDir}: ${stderr}`);
  const outputPath = stdout.trim().split("\n").filter(Boolean).pop();
  if (!outputPath) throw new Error(`cognate create: "bun pm pack" produced no output in ${pkgDir}`);
  return basename(outputPath);
}

/** Generate a starter app from templates/starter for a profile. */
export async function create(options: CreateOptions): Promise<CreateReport> {
  const dir = resolve(options.dir);
  const source = resolve(options.source);
  const templateRoot = join(source, "templates", "starter");
  if (!existsSync(templateRoot)) throw new Error(`cognate create: no template at ${templateRoot}`);

  await mkdir(dir, { recursive: true });
  await copyDir(join(templateRoot, "common"), dir);
  await copyDir(join(templateRoot, options.profile), dir);
  const files = ["domain", "src/agents", "src/capabilities", "src/components", "src/projections", "src/ui", "test", "cognate.config.ts", "package.json"];

  const byName = await indexCognatePackages(source);
  const closure = await transitiveClosure(PROFILE_ROOTS[options.profile], byName);

  const vendorDir = join(dir, ".cognate", "vendor");
  await mkdir(vendorDir, { recursive: true });
  const fileDepFor = new Map<string, string>();
  for (const name of closure) {
    const filename = await packPackage(byName.get(name)!, vendorDir);
    fileDepFor.set(name, `file:./.cognate/vendor/${filename}`);
  }

  const pkgPath = join(dir, "package.json");
  const manifest = JSON.parse(await readFile(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
    overrides?: Record<string, string>;
    [key: string]: unknown;
  };
  manifest.overrides = { ...(manifest.overrides ?? {}) };
  for (const name of closure) manifest.overrides[name] = fileDepFor.get(name)!;
  manifest.dependencies ??= {};
  for (const key of Object.keys(manifest.dependencies)) {
    if (manifest.dependencies[key] === "workspace:*") manifest.dependencies[key] = fileDepFor.get(key) ?? manifest.dependencies[key]!;
  }
  await writeFile(pkgPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const unsupported = (options.with ?? []).map((name) => ({ name, reason: KNOWN_UNSUPPORTED[name] ?? `not available in the starter yet: ${name}` }));

  return { dir, files, vendored: closure, unsupported };
}

export interface CognateConfig {
  readonly profile: "copilot" | "harness";
  readonly instructions?: string;
}

export interface DevServer {
  readonly url: string;
  stop(): Promise<void>;
}

const BROWSER_ENTRY = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@cognate/client";
import { CognateProvider } from "@cognate/react";
import { CognateShell, ChatPanel } from "@cognate/ui-astryx";
import { connectTransport, devToken } from "@cognate/protocol-connect-bun";
import { createRemoteRuntimeService } from "@cognate/protocol-connect";

const caller = { tenant: "local", actor: { id: "dev", kind: "user" } };
const transport = connectTransport(window.location.origin);
const service = createRemoteRuntimeService(transport, () => devToken(caller));
const client = createClient({ service, caller });

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    createElement(
      CognateProvider,
      { client },
      createElement(CognateShell, { title: "Cognate Starter" }, createElement(ChatPanel, { agent: "agent.copilot", placeholder: "Say something..." })),
    ),
  );
}
`;

function indexHtml(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Cognate Starter</title>
<link rel="stylesheet" href="/astryx.css" />
<link rel="stylesheet" href="/theme.css" />
</head>
<body>
<div id="root"></div>
<script type="module" src="/app.js"></script>
</body>
</html>
`;
}

/**
 * Run an app directory: load `cognate.config.ts`, parse `domain/*.sea` through the DomainForge adapter, create the
 * runtime on `.cognate/app.sqlite`, and serve `/health`, Connect (`/cognate.v1.RuntimeService/*`), AG-UI (`/agui`),
 * and the profile UI (`/`).
 */
export async function dev(options: { readonly dir: string; readonly port: number }): Promise<DevServer> {
  const dir = resolve(options.dir);
  const configPath = join(dir, "cognate.config.ts");
  if (!existsSync(configPath)) throw new Error(`cognate dev: no cognate.config.ts in ${dir}`);
  const { default: config } = (await import(pathToFileURL(configPath).href)) as { default: CognateConfig };

  const { loadSemanticProjection } = await import("@cognate/domainforge");
  const domainDir = join(dir, "domain");
  const seaFiles = existsSync(domainDir) ? (await readdir(domainDir)).filter((name) => name.endsWith(".sea")) : [];
  const objects: { readonly id: string; readonly kind: string; readonly name: string }[] = [];
  const digestParts: string[] = [];
  for (const file of seaFiles.sort()) {
    const source = await readFile(join(domainDir, file), "utf8");
    const result = loadSemanticProjection(source, { uri: `domain/${file}` });
    if (!result.ok) throw new Error(`cognate dev: failed to parse domain/${file}: ${JSON.stringify(result.error)}`);
    for (const object of result.projection.objects) objects.push({ id: object.ref.id, kind: object.kind, name: object.name });
    digestParts.push(result.projection.source.digest);
  }
  const digest = `sha256:${createHash("sha256").update(digestParts.sort().join("|")).digest("hex")}`;

  await mkdir(join(dir, ".cognate"), { recursive: true });
  const storePath = join(dir, ".cognate", "app.sqlite");

  let agents: string[];
  let components: string[];
  let agUi: ((request: Request) => Promise<Response>) | undefined;
  let runtimeService: RuntimeService;
  let closeApp: () => Promise<void>;

  if (config.profile === "copilot") {
    const { createCopilotApp, COPILOT_AGENT, copilotRegistry } = await import("@cognate/profile-copilot");
    const { localProvider } = await import("@cognate/provider-local");
    const app = await createCopilotApp({
      store: storePath,
      model: localProvider({ id: "starter", rules: [{ respond: () => ({ message: { role: "assistant", content: "Hello from the Cognate starter." }, toolCalls: [], finishReason: "stop" }) }] }),
      instructions: config.instructions,
    });
    agents = [COPILOT_AGENT];
    components = copilotRegistry.map((entry) => entry.name);
    agUi = app.agUi;
    runtimeService = app.runtime.service;
    closeApp = () => app.close();
  } else {
    const { createHarness, LOOP_AGENT, harnessRegistry, providerComponent } = await import("@cognate/profile-harness");
    const { localProvider } = await import("@cognate/provider-local");
    const harness = await createHarness({ store: storePath, instructions: config.instructions });
    await harness.mount(providerComponent(localProvider({ id: "starter" })));
    agents = [LOOP_AGENT];
    components = harnessRegistry.map((entry) => entry.name);
    runtimeService = harness.runtime.service;
    closeApp = () => harness.close();
  }

  const { serveRuntime, devTokenAuthenticator } = await import("@cognate/protocol-connect-bun");
  // Dev-only auth: `Bearer <tenant>:<principalId>` (see devTokenAuthenticator); never for production use.
  const internal = serveRuntime({ service: runtimeService, authenticate: devTokenAuthenticator, port: 0, hostname: "127.0.0.1" });

  let bundleJs: string | undefined;
  let cssPaths: readonly string[] = [];
  if (config.profile === "copilot") {
    const { stylesheetPaths } = await import("@cognate/ui-astryx/styles");
    cssPaths = stylesheetPaths();
    const entryPath = join(dir, ".cognate", "entry.tsx");
    await writeFile(entryPath, BROWSER_ENTRY);
    const build = await Bun.build({ entrypoints: [entryPath], target: "browser", format: "esm" });
    if (!build.success) throw new Error(`cognate dev: failed to bundle the UI: ${build.logs.map((log) => String(log)).join("; ")}`);
    bundleJs = await build.outputs[0]!.text();
  }

  const healthPayload = { ok: true, semantic: { objects: objects.length, digest }, agents, components };

  const server = Bun.serve({
    port: options.port,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/health") return Response.json(healthPayload);
      if (url.pathname.startsWith("/cognate.v1.RuntimeService/")) {
        const init: RequestInit & { duplex?: "half" } = { method: request.method, headers: request.headers, body: request.body };
        if (request.body) init.duplex = "half";
        return fetch(new Request(internal.url + url.pathname + url.search, init));
      }
      if (agUi && url.pathname === "/agui" && request.method === "POST") return agUi(request);
      if (config.profile === "copilot") {
        if (url.pathname === "/app.js" && bundleJs !== undefined) return new Response(bundleJs, { headers: { "content-type": "text/javascript" } });
        if (url.pathname === "/astryx.css" && cssPaths[0]) return new Response(Bun.file(cssPaths[0]));
        if (url.pathname === "/theme.css" && cssPaths[1]) return new Response(Bun.file(cssPaths[1]));
        if (url.pathname === "/") return new Response(indexHtml(), { headers: { "content-type": "text/html" } });
      } else if (url.pathname === "/") {
        return Response.json(healthPayload);
      }
      return new Response("not found", { status: 404 });
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    async stop() {
      server.stop(true);
      await internal.stop();
      await closeApp();
    },
  };
}
