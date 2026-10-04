import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executionWorldConformance } from "../src/conformance.ts";
import { localExecutionWorld } from "../src/index.ts";

// The local provider is the one that must be behaviourally identical to the pre-abstraction
// `node:fs` + `Bun.spawn` implementation. It runs the same conformance suite every other provider
// runs, against a real temp root and a real shell.
executionWorldConformance("local", async () => {
  const root = await mkdtemp(join(tmpdir(), "cognate-execution-local-"));
  await mkdir(join(root, "nested"), { recursive: true });
  return {
    provider: localExecutionWorld(),
    root,
    commands: {
      echo: (marker) => ({ argv: ["bash", "-lc", `printf %s ${JSON.stringify(marker)}`], cwd: root }),
      fail: (marker, code) => ({ argv: ["bash", "-lc", `printf %s ${JSON.stringify(marker)} 1>&2; exit ${code}`], cwd: root }),
      slow: () => ({ argv: ["bash", "-lc", "sleep 30"], cwd: root }),
    },
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
});