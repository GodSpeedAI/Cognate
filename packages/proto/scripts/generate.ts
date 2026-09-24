// Deterministic codegen: `buf generate` (pinned local protoc-gen-es plugin) against the
// canonical `proto/` sources, into `outDir` (default `src/gen`). See CG-WIR-001 (spec §21, §38).
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const outDir = resolve(process.cwd(), process.argv[2] ?? "src/gen");

const proc = Bun.spawn(["node_modules/.bin/buf", "generate", "--template", "buf.gen.yaml", "-o", outDir], {
  cwd: packageDir,
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await proc.exited;
if (exitCode !== 0) {
  process.exit(exitCode);
}
