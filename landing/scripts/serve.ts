// Static server for the built site (dist/). Unlike `astro preview`, any number can run side by side.
// Usage: bun scripts/serve.ts [--port N] [--host H]
import { existsSync, statSync } from "node:fs";
import { join, normalize } from "node:path";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const dist = join(import.meta.dir, "..", "dist");
if (!existsSync(join(dist, "index.html"))) {
  console.error("serve: dist/index.html not found; run `bun run build` first");
  process.exit(1);
}

function resolve(pathname: string): string | undefined {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(dist, rel);
  if (!file.startsWith(dist)) return undefined;
  if (existsSync(file) && statSync(file).isFile()) return file;
  const index = join(file, "index.html");
  return existsSync(index) ? index : undefined;
}

const server = Bun.serve({
  hostname: arg("--host", "127.0.0.1"),
  port: Number(arg("--port", "4321")),
  fetch(request) {
    const file = resolve(new URL(request.url).pathname);
    if (file) return new Response(Bun.file(file));
    const notFound = join(dist, "404.html");
    return new Response(existsSync(notFound) ? Bun.file(notFound) : "Not found", { status: 404 });
  },
});
console.log(`serving ${dist} at http://${server.hostname}:${server.port}/`);
