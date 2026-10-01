# Dispositions — structural visual parity (plan R4, settlement gates 20–21)

Every visible structural divergence found in the `diffs/*.png` triptychs (reference | Cognate |
pixel diff) is dispositioned here as **fixed** (changed in the presentation layer and
re-captured) or as a **named deviation** with a rationale. Brand-region differences are named
deviations, never masked. Non-structural differences (fixture copy where the fixture content
itself differs) are recorded as notes, not failures. There is no pixel-similarity threshold
(reconstruction prompt Phase 11); structural parity is the gate.

Captures: `cognate/screenshots/` (29 files, taken by `capture/capture.mjs` — node + Playwright,
desktop 1440×900 @2x, mobile 390×844 @2x, reducedMotion, animations disabled at capture time,
server data home wiped per run). Comparison: `capture/compare.mjs` → `diffs/*.png` +
`summary.md`. J-D and J-G have no reference screenshots (uncovered reference journeys), so they
have no rows in the summary and no dispositions are owed for them.

## Fixed (changed in the presentation layer, then re-captured)

| # | Divergence found in triptychs | Fix | Re-captured |
|---|---|---|---|
| F1 | Journey 09 head occupied the first grid cell of the two-column bench, pushing the thread/conversation column to the right and leaving the left column empty (`J-J-05/06/07/08`). | `.threadbench > .journey__head { grid-column: 1 / -1 }` in `cognate/src/ui/tokens.css`. | yes (runs 2–4) |
| F2 | The threads list disclosure nested inside the actions row misaligned the list and drew a rule through the control cluster (`J-J-06`). | Moved the disclosure out of the flex row in `cognate/src/ui/RichThreadView.tsx`. | yes |
| F3 | "No messages yet" empty-state box rendered even when the restored thread already showed earlier replies (`J-J-05/08`). | `ChatSurface` renders the empty state only when there are no turns and no earlier entries. | yes |
| F4 | J-E terminal state displayed component/phase/cards but not the run's answer, unlike the reference's card + closing text (`J-E-02/04`, `J-E-05`, `J-J-02`). | `ControlledRenderingSurface` now also renders the completed run's answer from the durable run output. | yes |
| F5 | J-F resolved state displayed only the raw status word, unlike the reference's "Meeting Scheduled" confirmation (`J-F-03`, `J-F-04`). | `ToolDecisionSurface` renders "Meeting scheduled — slot 10:30 accepted…" from the settled run output. | yes |

## Named deviations (recorded, not masked)

| # | Checkpoints | Divergence | Rationale |
|---|---|---|---|
| D1 | all | "CopilotKit" wordmark + kite logo vs. the "Cognate" masthead and subtitle. | Brand region. Cognate's visual identity is out of scope by the plan ("do not alter Cognate's visual identity"). |
| D2 | all desktop | Reference navigation is a persistent left sidebar (New Conversation / Recent Conversations / threads drawer) plus a Chat/App toggle; Cognate navigates journeys with a top tab bar (01–09). | Layout identity of the substrate bench. The Cognate shell predates this unit and is presentation-owned elsewhere; altering it to a sidebar would restyle Cognate's identity. |
| D3 | `J-*-00-initial`, plus the non-initial checkpoints where the pills persist: `J-A-02`, `J-C-01/04/05`, `J-E-02/05`, `J-F-03/04`, `J-H-01/02` | Reference shows clickable suggested-prompt pills under the composer; Cognate has none. | No equivalent control exists in the Cognate fixture: journeys are started through explicit, labeled journey controls rather than suggested prompts. Recorded, not fabricated. |
| D4 | `J-A-01/02`, `J-C-*`, `J-E-*`, `J-F-*`, `J-H-*`, `J-J-*` | Reply and payload copy differs ("How about Bubbles?…" vs. the deterministic "Hello from the deterministic Cognate chat."; three titled todo cards vs. `agent todo`/`user todo` ledger rows; flight list vs. deterministic answer). | Fixture content, not structure: the Cognate model component is deterministic and its fixtures are the tested ones. Non-structural; recorded in this file's non-structural notes, not a failure. |
| D5 | `J-C-01/03/04/05` | Reference canvas is a card board (todo cards with descriptions, a Done column, an add control) beside the transcript with tool chips (enableAppMode / manage_todos); Cognate renders a versioned state ledger with origin markers, and its conversation lives in the Conversation view (01), not beside the ledger. | Cognate's shared-state canvas presentation is the tested ledger surface; the agent→canvas→agent round trip (write, edit, observation "Agent read 2 rows and saw your edit.") is present and equivalent in outcome. Restyling to a card board would be a Cognate-identity change. |
| D6 | `J-E-02/04/05`, `J-H-01/02`, `J-J-02` | Reference renders chart bodies (donut, bar) inside the transcript; Cognate's controlled renderer presents component, phase, card count and answer, and the declarative surface presents the catalog-validated component, bound revenue and its one declared operation. | Fixture/catalog scope differs (reference pie-chart fixture vs. Cognate `FlightSearchCard`; reference full sales dashboard vs. Cognate catalog scalars `region`/`revenue`). Information and control equivalence holds at each side's fixture scope (Phase 11 "equivalent information, controls, interaction possibilities"); the chart body itself is fixture content. |
| D7 | `J-E-01`, `J-E-03` (reference-only rows in summary.md) | No Cognate capture: the pending phase is not UI-photographable. | The pending fold exists and is real (the J-E suite asserts the projection prefix fold `{phase:"pending", renders:1}`), but the Cognate run completes in ~5 ms while the streamed event channel delivers its first event ~100 ms later (TCP-buffered), so every read the app itself issues returns the terminal fold. The reference can photograph pending only because its mock LLM adds seconds of latency. Left uncaptured rather than mislabeled; pending/terminal transition semantics remain proven by `cognate/test/J-E-controlled-rendering.test.tsx`. |
| D8 | `J-F-02` | The triptych compares different run phases: the reference capture, though named "slot-selected", actually shows the resolved state (the reference's own capture caught the run after resolution — a "Meeting Scheduled" card), while the Cognate `J-F-02` capture shows the offered-slot (waiting) state, byte-identical to Cognate's `J-F-01`. The Cognate decision control also resolves in one activation and offers a single slot vs. the reference's three. | The tested Cognate capability handler resolves the waiting tool directly; no intermediate state exists on the Cognate side to capture, and Cognate's `J-F-02` is not presented as a distinct state. The resolved phase on both sides is compared by the `J-F-03` triptych. |
| D9 | `J-J-05` | After reload the reference renders its welcome screen with no prior messages (restoration OBSERVED_ABSENT on the reference; see reference-manifest `journeyCoverage.journeys[J-J].postObservation`); Cognate restores the thread from durable projections (earlier-replies disclosure opened, replay panel settled). | Divergence direction favors Cognate: the restoration the reference could not perform is exactly what the rich-thread projection exists for. Recorded with the reference's own observed-absence evidence, never masked. |
| D10 | `J-J-06` | Reference drawer is pinned to "Loading threads…" with zero rows (license-gated `useThreads` never resolves); Cognate lists the durable threads (`thread:demo`, `thread:j-c`, `thread:j-j`) with status and turn counts read from public projections. | Same direction as D9: the Cognate list is real durable state; the reference's own capture documents its loading-state dead end. |
| D11 | `J-J-07`, `J-J-08` | Reference shows the same welcome screen for "new thread" and "switched back" (its J-J-07/08 are byte-identical); Cognate shows a genuine fresh thread (empty conversation, idle replay) and a genuine switched-back thread (history restored from projections). | Same direction as D9. The Cognate thread lifecycle (new thread, switch back) is exercised through real controls backed by durable state. |
| D12 | `J-E-*`, `J-J-02` | Reference composes generative components inline in the chat transcript; the Cognate conversation transcript carries message turns only, while renders appear in their journey panels and in the thread replay readout. | Composition difference in the presentation layer: Cognate's transcript is message-delta-driven by design; folding a render into it would duplicate the journey panels' role. Recorded, not hidden. |
| D13 | all | Affordance regions differ: Cognate's masthead carries a runtime connection indicator ("Runtime connected · tenant-a") and a theme toggle; the reference has its launcher bubble and Chat/App segmented control. | Brand/affordance region (as D1/D2); both indicate liveness — the reference's own "Compiling…" dev-overlay badge is not part of either app's surface. |
| D14 | mobile checkpoints (J-A-02, J-C-05, J-E-05, J-F-04, J-H-02, J-J-04) | Reference chat rows carry per-message copy/tool action icons; Cognate transcript rows do not reproduce them. | Named deviation — peripheral, detail-level affordance (P2), not a structural control; interaction affordances live at surface level (stop/send, journey controls, HITL/interrupt controls). Found by the R6 consolidated critic's systematic pass at settlement; recorded, never masked. |

## Non-structural notes (recorded in this file)

- All shared checkpoints have equal dimensions per viewport (2880×1800 desktop, 780×1688
  mobile @2x); no padding was needed before the pixel diff.
- The reference carries a Next.js dev "Compiling…" badge in several shots (build tooling, not
  app surface); it is ignored as a difference.
- Cognate's J-J thread list shows every durable thread known to the projections (including
  threads created by earlier journeys in the same session), because that is the honest content
  of the projections the surface reads.

## Outcome

- 29 triptychs in `diffs/`; 2 reference-only checkpoints (D7) with the reason recorded in
  `summary.md`; 0 Cognate-only checkpoints.
- Every journey with reference screenshots has at least one desktop AND one mobile row in
  `summary.md` (gate 21): J-A 2/1, J-C 4/1, J-E 3/1 (+2 reference-only desktop), J-F 4/1,
  J-H 2/1, J-J 8/1.
