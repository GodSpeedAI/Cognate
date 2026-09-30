# Current status

**Status revision:** 19

**Stage:** CopilotKit reconstruction: BLACK_BOX reference execution established; J-A and J-C green

**Summary:** The pinned reference application now executes end to end against the pinned @copilotkit/aimock fixtures with no paid endpoint, and two journeys finished green with BLACK_BOX_REFERENCE captures. The chain that had blocked every earlier attempt was root-caused: the pristine example always enables the A2UI catalog, so the sdk-js LangGraph middleware appends an 'App Context' developer message last on every model request, while llmock's toolCallId rule requires the final message to be role:tool - so every tool-result leg of the recorded d4 todo chain 404'd. The fix serves fixtures through the pinned library's own programmatic LLMock API with its requestTransform hook (matching only; the reference app is byte-identical to the pin), proven leg-by-leg against archived request bodies and then in-app: J-C ran green with every leg hit, agent-to-canvas and canvas-to-agent both proven, and J-A ran green with the fixture-declared prompt. The manifest and behavior matrix now record R-A01 and R-A02 as BLACK_BOX_REFERENCE. Seven harness defects were fixed along the way, the status stream corruption from revision 18 was repaired with the scripted method, and the stack was downed clean.

**Verified:** **J-C (jc9) ok:true** — five shots, both turns cleared on attempt 1 and rendered
the fixture reply, every model call hit with zero misses; agent→canvas proven by all three
streamed titles rendering, canvas→agent proven on the wire by the archived turn-2 run request
(`logs/runs/run-req-J-C-*.json`) containing the canvas-written `New Todo`; mobile recorded
honestly as `defaultPane:"app"` with the Chat tab revealing the reply. **J-A (ja3) ok:true** —
fixture-declared prompt `good name for a goldfish` rendered `How about Bubbles?` at both
viewports, 2 hits / 0 misses scoped to the run (the earlier invented prompt was a MISS and is
excluded). Seven harness defects fixed, each observed failing first: missing `process.exit` in
the boot dispatch (chained `boot && run` never reached `run`), missing run preflight (jc5
captured a dead stack), the 4010 port collision with `scripts/harness.ts` (moved to 4012), the
hydration gate plus 5 send attempts (90s first compile), sidecar reads scoped by `startSeq`
(stale misses failing later runs), tab-aware mobile assertion, and a page-level probe that
cold-restarts the UI — the Turbopack CSS defect struck a 4th and 5th time, including
mid-session, and healed both times. The status stream corruption from revision 18 was repaired
with the scripted parser (revisions 1–19 validated). Stack downed clean; all four ports free.

**Limits:** Only **2 of 10** canonical journeys have BLACK_BOX captures; J-D through J-K remain
unbuilt and uncaptured, about 22 of 32 settlement gates stay open, and `diffs/`,
`parity-report.md`, `parity-report.json` and `primitive-provenance.md` are still absent. Only
matrix rows R-A01/R-A02 were upgraded; every other row keeps its prior class. The transform
flips llmock into **exact** `userMessage` matching, so future journey prompts must equal the
fixture's `match.userMessage` byte-for-byte or they MISS by design. The App Context strip
applies to matching only; a critic may still treat harness-side normalization as an
evidence-scope caveat. A concurrent operator session modified `deepseek-harness` files plus
`scripts/harness.ts`/`justfile` — excluded from this revision's commit; port 4010 belongs to
that tooling. One mobile screenshot was verified by direct image read, but systematic visual
parity diffing still owes the independent critic pass. Carried forward: DEBT-021 (separate
framework change), DEBT-004/011/014–017/020, unfrozen ledger, `.jolli/jollimemory/debug.log`
left uncommitted.

**Next:** Build the remaining journeys in dependency order (J-D agent context, J-E controlled
rendering, J-F tool HITL, J-G interrupt, J-H declarative UI, J-J rich thread, J-K live
recovery), extending the harness JOURNEYS table with fixture-declared prompts under the
exact-match rule and capturing both reference and Cognate sides. Then produce `diffs/`,
`primitive-provenance.md` and `parity-report.md/json`, and re-audit the 32 settlement gates.
Run `just verify` before each commit; commit only copilot-reconstruction files while the
deepseek session's work stays uncommitted.
