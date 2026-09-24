// CG-WIR-001 (spec §21, §38): proto/ compiles twice to byte-identical output equal to the committed bindings.
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

function digest(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const path = join(d, entry);
      if (statSync(path).isDirectory()) walk(path);
      else out[relative(dir, path)] = createHash("sha256").update(readFileSync(path)).digest("hex");
    }
  };
  walk(dir);
  return out;
}

async function generate(outDir: string) {
  const proc = Bun.spawn(["bun", "scripts/generate.ts", outDir], { cwd: "packages/proto", stdout: "pipe", stderr: "pipe" });
  const [exit, err] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  if (exit !== 0) throw new Error(`generation failed: ${err}`);
}

test("generation is reproducible and matches the committed bindings", async () => {
  const a = mkdtempSync(join(tmpdir(), "cognate-gen-a-"));
  const b = mkdtempSync(join(tmpdir(), "cognate-gen-b-"));
  try {
    await generate(a);
    await generate(b);
    const first = digest(a);
    expect(Object.keys(first).length).toBeGreaterThanOrEqual(10);
    expect(digest(b)).toEqual(first);
    expect(digest("packages/proto/src/gen")).toEqual(first);
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
}, 120_000);

test("the generated runtime service exposes only unary and server-streaming methods (DEBT-004)", async () => {
  const { RuntimeService } = await import("../src/index.ts");
  const kinds = Object.values(RuntimeService.method).map((m) => m.methodKind);
  expect(new Set(kinds)).toEqual(new Set(["unary", "server_streaming"]));
});
