# Impeccable clarify (pass 1 of 6): copy only

Scope: visible copy in landing/src; copy-deck.md kept in sync. No layout, style or capability-fact changes. H1 unchanged.

## Changes and reasons

| Where | Before | After | Reason |
|---|---|---|---|
| `<title>` (pages/index.astro, copy-deck Meta) | Cognate — the agentic application framework | Cognate: the agentic application framework | Em dash ban (impeccable law) |
| ExplodedView `titleFor` (aria-label/tooltip) | `… — …` | `…: …` | Em dash ban |
| Beat F body (pages/index.astro) | waits durably, even across a restart | waits, even across a restart | "durably" is jargon; the clause already says it |
| Beat H step 2 body | Run both commands in an empty folder. | Run both commands in order, in the same terminal. The first makes a refund-desk folder and moves into it. | The first command creates the folder; "empty folder" was inaccurate |
| Beat H step 4 expected | run-on list of fragments | Expected: passing tests for each journey. A small refund completes. ... | Readable sentences |
| Beat H "It failed" drawer, step 3 | "symptom → fix" arrows | "If …, … If …, … That's the verified route." | Plain instructions for non-developers |
| Beat H skills.sh card | "coming soon (placeholder link)" | "coming soon." | Internal note was visible to visitors; link unchanged in code |
| Rail nav labels (Rail.tsx) | Possibility, Reveal, Composition, Construction, Operation | Overview, Parts, How parts fit, Building, Agents at work | Visitor-facing names match the section kickers |
| Rail aria-label | Beats | Page sections | Screen readers hear a plain name |
| Demo legend (CompositionDemo) | Door | Door (how the call comes in) | "Door" is an unexplained term |
| Parts list L2 (PartsText.astro) | L2 Agents: ... | L2 Agents. ... | Punctuation matches the other layer rows |

## Not changed (deliberately)
- H1, H2s checked by e2e (layout.spec) and parts.ts capability facts/job text (parts.test caps job length; facts checked by verify:sources).
- Commands and first-request text (shared with README; readme.test).
- En-dash line ranges in lib/links.ts (number ranges, not em dashes).

## Gates
- bun run check: 0 errors, 0 warnings
- bun run build: pass (notices written)
- bun run test: 23 pass, 0 fail
- bun run verify:sources: PASS (19 excerpts, 16 edges)
- bun run test:e2e: 25 passed
- Em dash scan of landing/src: 0 occurrences
- Screenshots at 1440 and 375 (Overview, How parts fit, Parts, Your turn): no horizontal overflow; copy fits.
