// Transparent proxy that adds the aimock fixture-column header.
//
// Why this exists: aimock selects a fixture column from the X-AIMock-Context
// header and returns `no_fixture_match` without it (verified: the same request
// returns 400 without the header and the fixture content with it). The showcase
// sets that header in its own harness, but the reference application itself does
// not know about aimock at all. Editing the pinned reference's agent source to add
// the header would change the thing under observation, so instead the base URL the
// reference is pointed at is this proxy, which forwards every request to llmock
// byte-for-byte and adds exactly one header.
//
// This makes the reference's own model traffic select fixtures, with no reference
// edit and no paid endpoint.
//
// Evidence sidecar: the reconstruction needs to know not only which fixture served
// a turn, but whether the reference put thread state into the model request. The
// mock matches on the user message, so a scripted "recall" reply proves nothing on
// its own; the outbound request body is the observable that does.
//
// Usage: node mock-context-injector.mjs <listenPort> <mockPort> <context> [markersCsv]

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [LISTEN, MOCK, CONTEXT] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4]];
const MARKERS = (process.argv[5] || "").split(",").map((s) => s.trim()).filter(Boolean);
const SIDECAR = process.env.CK_REQUEST_LOG || "/tmp/ck-requests.jsonl";
// Byte-level archive of every model request. The derived fields below are a
// convenience; the archived body is what settles a fixture miss, because it is
// byte-for-byte what llmock received. Without it, every miss diagnosis is a guess.
const RAWDIR = process.env.CK_REQUEST_RAW_DIR || null;
if (RAWDIR) mkdirSync(RAWDIR, { recursive: true });
let seq = 0;
if (!LISTEN || !MOCK || !CONTEXT) {
  console.error("usage: node mock-context-injector.mjs <listenPort> <mockPort> <context> [markersCsv]");
  process.exit(2);
}

let forwarded = 0;
let misses = 0;

const append = (rec) => {
  try {
    appendFileSync(SIDECAR, JSON.stringify(rec) + "\n");
  } catch (e) {
    console.log(`SIDECAR_WRITE_ERROR ${e && e.message}`);
  }
};

// Exactly llmock's predicate (dist/router.js currentTurnHasToolResult): a tool
// message AFTER the last user message. Recorded here so a miss can be compared
// against the fixture's declared match without re-deriving it by hand.
const currentTurnHasToolResult = (msgs) => {
  let lastUserIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i] && msgs[i].role === "user") { lastUserIdx = i; break; }
  }
  return msgs.slice(lastUserIdx + 1).some((m) => m && m.role === "tool");
};

const inspect = async (req) => {
  if (req.method === "GET" || req.method === "HEAD") return null;
  try {
    const buf = await req.arrayBuffer();
    const text = new TextDecoder().decode(buf);
    let parsed = null;
    let userMessage = null;
    let userContentType = null;
    let roles = null;
    let turnHasToolResult = null;
    let toolCallIds = null;
    let toolResultIds = null;
    let hasStateField = false;
    try {
      const j = JSON.parse(text);
      parsed = j;
      const msgs = Array.isArray(j.messages) ? j.messages : [];
      const lastUser = [...msgs].reverse().find((m) => m && m.role === "user");
      userMessage = typeof lastUser?.content === "string" ? lastUser.content : null;
      userContentType = lastUser ? (Array.isArray(lastUser.content) ? "array" : typeof lastUser.content) : "none";
      roles = msgs.map((m) => (m && m.role) || "?").join(">");
      turnHasToolResult = currentTurnHasToolResult(msgs);
      // ids the assistant asked to run, and ids whose results came back. A fixture
      // that matches on toolCallId fails silently when these drift.
      toolCallIds = msgs.flatMap((m) => (Array.isArray(m?.tool_calls) ? m.tool_calls.map((t) => t?.id ?? null) : []));
      toolResultIds = msgs.filter((m) => m && m.role === "tool").map((m) => m.tool_call_id ?? null);
      hasStateField =
        j.state !== undefined ||
        (j.messages || []).some((m) => typeof m?.content === "string" && /\bstate\b\s*[:=]/i.test(m.content));
    } catch {}
    const found = {};
    for (const m of MARKERS) found[m] = text.includes(m);
    return { buf, text, parsed, userMessage, userContentType, roles, turnHasToolResult, toolCallIds, toolResultIds, found, hasStateField, bytes: buf.byteLength };
  } catch {
    return null;
  }
};

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: LISTEN,
  async fetch(req) {
    const url = new URL(req.url);
    const seen = await inspect(req);
    const headers = new Headers(req.headers);
    headers.set("x-aimock-context", CONTEXT);
    const upstream = await fetch(`http://127.0.0.1:${MOCK}${url.pathname}${url.search}`, {
      method: req.method,
      headers,
      body: seen ? seen.buf : undefined,
      duplex: seen ? "half" : undefined,
    });
    const body = upstream.body ? await upstream.arrayBuffer() : null;
    let outcome = "passthrough";
    if (body) {
      const text = new TextDecoder().decode(body);
      if (text.includes("no_fixture_match")) {
        misses += 1;
        outcome = "MISS";
        console.log(`MISS ${req.method} ${url.pathname} user=${JSON.stringify(seen?.userMessage ?? null)} -> no_fixture_match (uncovered behavior)`);
      } else {
        forwarded += 1;
        outcome = "HIT";
        console.log(`HIT  ${req.method} ${url.pathname} -> ${upstream.status}`);
      }
    }
    if (seen && url.pathname.includes("/chat/completions")) {
      seq += 1;
      const rec = {
        seq,
        ts: new Date().toISOString(),
        outcome,
        userMessage: seen.userMessage,
        userContentType: seen.userContentType,
        roles: seen.roles,
        turnHasToolResult: seen.turnHasToolResult,
        toolCallIds: seen.toolCallIds,
        toolResultIds: seen.toolResultIds,
        hasStateField: seen.hasStateField,
        markers: seen.found,
        bytes: seen.bytes,
      };
      append(rec);
      const hit = MARKERS.filter((m) => seen.found[m]);
      console.log(`STATE user=${JSON.stringify(seen.userMessage ?? null)} type=${seen.userContentType} turnTool=${seen.turnHasToolResult} toolResults=${JSON.stringify(seen.toolResultIds ?? [])} stateField=${seen.hasStateField} markersSeen=[${hit.join(" ")}] bytes=${seen.bytes}`);
      // Archive the exact bytes forwarded upstream. This is the primary evidence
      // for a fixture miss; the derived fields above only orient you to it.
      if (RAWDIR) {
        try {
          const name = join(RAWDIR, `${String(seq).padStart(4, "0")}-${outcome}.json`);
          writeFileSync(name, seen.text);
          append({ seq, ts: rec.ts, outcome, rawArchive: name });
        } catch (e) {
          console.log(`RAW_WRITE_ERROR ${e && e.message}`);
        }
      }
    }
    return new Response(body, {
      status: upstream.status,
      headers: upstream.headers,
    });
  },
});

console.log(`injector listening on http://127.0.0.1:${LISTEN} -> :${MOCK} context=${CONTEXT} markers=${MARKERS.length} sidecar=${SIDECAR}`);

// Periodic tally so a log reader can tell matched from uncovered without parsing lines.
setInterval(() => {
  console.log(`TALLY hit=${forwarded} miss=${misses}`);
}, 60000);
