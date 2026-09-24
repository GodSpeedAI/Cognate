import { expect, test } from "bun:test";

test("an unimplemented dependency gate fails explicitly", async () => {
  const process = Bun.spawn(["just", "gate-ak-002"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exit, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ]);
  expect(exit).not.toBe(0);
  expect(stderr).toContain("AK-002: unmet Phase 0 gate");
});
