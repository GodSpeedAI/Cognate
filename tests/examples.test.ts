// CG-EXM-001 (spec §37 Phase 10): every example the README lists runs independently via `bun run example:<name>`.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const readme = readFileSync("README.md", "utf8");
const block = readme.slice(readme.indexOf("examples/\n"), readme.indexOf("```", readme.indexOf("examples/\n")));
const names = [...block.matchAll(/[├└]── ([a-z0-9-]+)\//g)].map((m) => m[1]!);
const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;

describe("README examples", () => {
  test("the README example list is parsed", () => {
    expect(names.length).toBe(15);
  });

  for (const name of names) {
    test(`example:${name} runs and reports its outcome`, async () => {
      expect(existsSync(`examples/${name}/index.ts`) || existsSync(`examples/${name}/index.tsx`)).toBe(true);
      expect(scripts[`example:${name}`]).toBeString();
      const proc = Bun.spawn(["bun", "run", `example:${name}`], { stdout: "pipe", stderr: "pipe", env: { ...process.env, COGNATE_EXAMPLE_CI: "1" } });
      const [exit, out, err] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
      if (exit !== 0) console.error(err);
      expect(exit).toBe(0);
      expect(out).toMatch(/^ok: .+/m);
    }, 60_000);
  }
});
