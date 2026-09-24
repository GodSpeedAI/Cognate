import { cognitiveIndexConformance } from "@cognate/cognitive-api/conformance";
import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRvfIndex } from "../src/index.ts";

const dir = mkdtempSync(join(tmpdir(), "cognate-rvf-kit-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
cognitiveIndexConformance("cognitive-rvf", () => createRvfIndex({ dimension: 4, path: join(dir, `${crypto.randomUUID()}.rvf`) }));
