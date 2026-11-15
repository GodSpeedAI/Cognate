import { describe, expect, test } from "bun:test";
import { EXECUTION_POSTURE_ENV, parseExecutionPosture } from "../src/index.ts";

describe("execution posture", () => {
  test("defaults to contained", () => {
    expect(parseExecutionPosture(undefined)).toBe("contained");
    expect(parseExecutionPosture("")).toBe("contained");
    expect(parseExecutionPosture("contained")).toBe("contained");
  });

  test("uncontained-local is the only other value", () => {
    expect(parseExecutionPosture("uncontained-local")).toBe("uncontained-local");
  });

  test("any other value throws", () => {
    for (const value of ["uncontained", "Contained", "local", " contained", "off", "true"]) {
      expect(() => parseExecutionPosture(value)).toThrow(EXECUTION_POSTURE_ENV);
    }
  });
});
