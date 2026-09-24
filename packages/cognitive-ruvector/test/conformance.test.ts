import { cognitiveIndexConformance } from "@cognate/cognitive-api/conformance";
import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuVectorIndex } from "../src/index.ts";

const dir = mkdtempSync(join(tmpdir(), "cognate-ruvector-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

cognitiveIndexConformance("cognitive-ruvector", () => createRuVectorIndex({ dimension: 4, storagePath: join(dir, `${crypto.randomUUID()}.db`) }));
