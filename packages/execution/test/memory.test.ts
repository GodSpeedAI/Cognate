import { executionWorldConformance } from "../src/conformance.ts";
import { memoryExecutionWorld } from "../src/index.ts";

// The deterministic fixture world: no network, no real root, but the same contracts — so the
// abstraction is proven independently of any transport.
executionWorldConformance("memory", async () => ({
  provider: memoryExecutionWorld({ worldId: "memory" }),
  root: "/workspace",
  commands: {
    echo: (marker) => ({ argv: ["memory", "echo", marker], cwd: "/workspace" }),
    fail: (marker, code) => ({ argv: ["memory", "fail", marker, String(code)], cwd: "/workspace" }),
    slow: () => ({ argv: ["memory", "slow"], cwd: "/workspace" }),
  },
}));