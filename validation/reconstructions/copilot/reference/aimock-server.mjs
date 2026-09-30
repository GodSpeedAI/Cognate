#!/usr/bin/env node
/**
 * Programmatic fixture-backed mock for the pinned reference (Phase 1B), served through
 * @copilotkit/aimock's OWN LLMock API instead of the flag-driven `llmock` bin.
 *
 * Why programmatic: the pristine example's layout.tsx sets a2ui={{ catalog }} unconditionally,
 * so the sdk-js LangGraph middleware appends an `App Context:` developer message to every model
 * request (observed LAST on the wire, sometimes twice - see logs/raw/0002-MISS.json). llmock's
 * toolCallId rule (router.js:243-244) requires the FINAL message to be role:"tool", so every
 * tool-result leg of the recorded d4 chain ([44] enable_app_mode -> manage_todos,
 * [43] manage_todos -> final text) can never match and the reference agent dies with
 * 404 no_fixture_match / RUN_ERROR. No showcase test covers this chain, which is why the
 * incompatibility shipped unnoticed.
 *
 * requestTransform is the reference library's own supported normalization hook (server.js:384
 * passes defaults.requestTransform into matchFixtureDiagnostic; useExactMatch follows from it).
 * It edits NOTHING the reference app sends: the app stays byte-identical to the pin, and the
 * transform only drops trailing `App Context:` developer/system messages for MATCHING purposes
 * so the recorded fixtures replay in their recorded order. The reference's request payload is
 * archived unaltered by mock-context-injector.mjs (logs/raw/).
 *
 * chunkSize 9999: fixture [44] streams emoji todo titles and llmock slices by UTF-16 code
 * units (default 20), which splits surrogate pairs exactly as the fixture's own comment warns.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const port = Number(process.argv[2] ?? 4012);
const fixtureDirs = process.argv.slice(3);
if (fixtureDirs.length === 0) {
  console.error("usage: node aimock-server.mjs <port> <fixtureDir> [fixtureDir ...]");
  process.exit(1);
}

const REF = process.env.CK_REF_ROOT ?? path.resolve(new URL("../../../../.tmp/ref/copilotkit", import.meta.url).pathname);
const PKG = path.join(REF, "showcase/scripts/node_modules/@copilotkit/aimock");
if (!fs.existsSync(PKG)) {
  console.error(`aimock package not found at ${PKG}; restore the pinned reference checkout first`);
  process.exit(1);
}
const { LLMock } = await import(pathToFileURL(path.join(PKG, "dist/index.js")).href);

const textOf = (c) => (typeof c === "string" ? c : Array.isArray(c) ? String(c[0]?.text ?? "") : "");
const isAppContext = (m) =>
  (m?.role === "developer" || m?.role === "system") && textOf(m?.content).startsWith("App Context:");

const requestTransform = (req) => {
  if (!Array.isArray(req?.messages)) return req;
  return { ...req, messages: req.messages.filter((m) => !isAppContext(m)) };
};

const llmock = new LLMock({
  port,
  host: "127.0.0.1",
  chunkSize: 9999,
  requestTransform,
});
for (const dir of fixtureDirs) llmock.loadFixtureDir(path.resolve(dir));

const url = await llmock.start();
console.log(`[aimock-programmatic] listening on ${url} fixtures=${fixtureDirs.join(",")} transform=strip-app-context chunkSize=9999`);