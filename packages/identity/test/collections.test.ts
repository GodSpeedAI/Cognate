import { describe, expect, test } from "bun:test";
import { DEVICES, OPERATORS, SESSIONS } from "../src/service.ts";

// The SQLite store rejects collection names containing dots, so every identity collection must be a plain hyphenated name.
describe("identity collection names", () => {
  test("each collection name is lowercase letters and hyphens only", () => {
    for (const name of [OPERATORS, SESSIONS, DEVICES]) expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});
