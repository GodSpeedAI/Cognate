# Deviations from the pinned reference

An index and a summary. The full narrative — with the reasoning behind each entry — is
`cognate/DEVIATIONS.md`, which remains authoritative. This page exists so you can find the right entry
without reading 400 lines, and so the classification is visible in one table.

## Why there is a deviation list at all

The reconstruction's method was parity-with-documented-exceptions. A difference that was not written
down would make every subsequent measurement untrustworthy, so every intentional difference is
catalogued, and `parity-report.md` classifies each one. See
[../explanation/parity-method.md](../explanation/parity-method.md).

**The status of the *visual* target changed on 2026-09-27.** Pixel parity is retired; `DESIGN.md` and
`PRODUCT.md` now describe an independent visual system. Entries below about inert controls, dialog
copy, and layout exist because of the *parity method*, and the inert controls are now a product
problem rather than a preserved decision — `PRODUCT.md` Principle 3 says so explicitly.

## Classification

| Class | Meaning |
|---|---|
| **Brand substitution** | Structure and accessible names match; the copy or assets are the app's own, because the reference's are a third party's. Explicitly permitted by the exercise. |
| **Scope-limited stub** | The control exists with the reference's accessible name, disabled, with a visible reason. Not a missing control — a deliberately unimplemented one. |
| **Deliberate divergence** | A behavioural difference the app chose, with the reasoning recorded. |
| **Evidence-quality caveat** | A difference caused by the evidence, not the implementation. |
| **Capture artifact** | A timing race in the screenshot rig, not a product difference. |

## The entries

### Brand substitution

| Entry | What differs | Why |
|---|---|---|
| First-run dialog pair | Cognate-branded copy for the reference's notice and API-key dialogs; structure, roles, and button names match | DeepSeek's own copy is not ours to ship. **Note:** "Save and continue" behaves like "Configure later" — it dismisses the step without persisting a key. That is an assumption, not an observed reference behaviour. |
| Settings → Models provider list | 7 generic OpenAI-compatible presets (OpenAI, OpenRouter, Azure OpenAI, Groq, Mistral, Together, Fireworks) instead of the reference's ~35 DeepSeek-branded entries | Same. Picking one pre-fills the Custom model API form. |
| Icons | All original inline SVGs in `src/ui/icons.tsx` | Not copies of the reference's iconography. |

### Deliberate divergences

| Entry | What differs | Why |
|---|---|---|
| **Pending approval across a full server restart** | The reference silently finalizes the turn as "Worked" after a process restart. This app keeps the continuation `OPEN` and the run `waiting`, and completing it still works. | Durable continuations are the framework's behaviour, and treating durable history as authoritative is a project invariant not worth breaking to match what looks like data loss. This is the app's **only** intentional P0-level behavioural divergence, and it is carried through the journey suite as a cited `Expectations` value. `J-D-approval` asserts the app's behaviour; `tests/drivers/types.ts` carries the citation. |
| Approval-gate access mode | The gate compares against a fixed `read-only` default because the composer's access-mode dropdown is inert | The dropdown is a control this app does not implement. `AgentCodingInput.mode` exists so wiring it later does not change the gate. |
| Session title | Always the literal first human message, truncated, for the session's lifetime | The reference has a second LLM re-titling cadence that was observed but never seen to replace the literal title within the pinned window. Documented as an assumption. |
| Cancelled-turn history | A cancelled turn contributes only its user message to later history; its partial reply is not folded back | Not documented in the reference behaviour matrix. `session.history` already only synthesizes an assistant message for `completed` runs. |
| "Request changes" wording on a plan review | This app's own text | The reference path was never exercised against the pinned build. `J-E-plan` deliberately asserts only the approve branch. |
| "Plan mode off." confirmation | A pure control command with no model round trip, producing a short assistant-style message | The reference's UI for this transition was never captured. The composer's toggle works by sending exactly `/plan off` as a turn. |
| `run_code`'s sandbox | A small original harness defining one `tools.bash`, run via `bun -e` | The reference's sandbox was not read or copied. Adequate for the fixture's snippet, not a general sandbox model. |
| Provider-error code mapping | A scripted HTTP 500 maps to `HTTP_500` / "Internal server error"; a timeout maps to `TIMEOUT` / "Request timed out." | Honest rather than fabricated. **Caveat:** `DEVIATIONS.md` still describes this mapping as message-regex-only, which is now stale — the code prefers structured `failure.details` after framework finding F3. The *behaviour* is unchanged. See [../operations/troubleshooting.md](../operations/troubleshooting.md#known-documentation-drift). |
| Retry backoff duration | 300ms default instead of the reference's ~90s total | The reference's own timing is not reproduced. The **count** (5) and the event shape are. `MODEL_RETRY_BACKOFF_MS` overrides the duration. |
| No right-sidebar plan tab | The plan renders inline via a "View full plan" disclosure | This app has no right sidebar. "Open right sidebar" is already inert. Accounts for most of the `13b`/`13c` pixel diff. |
| Subagent child panel | A small new `RightPanel` showing the child's prompt and final answer, sourced from the `subagents` row | There was no right sidebar to reuse, and children are not sessions, so there is no child-transcript capability. |
| No manual Retry/Dismiss on a failed turn | The composer stays available underneath | Matches the reference exactly, per the behaviour matrix. |
| Stop control label | `Stop generating` | Matches the reference. An earlier pass used "Stop" and was corrected. |

### Scope-limited stubs

Each of these renders with the reference's accessible name, is `disabled`, and shows a reason from the
`NOT_IMPLEMENTED` constant.

| Control | Missing |
|---|---|
| Settings nav: "Built-in plugins", "Agent presets" | A plugin system |
| Sidebar "Plugins" global panel | A plugin system |
| Per-session header actions: "Open in Files", "More ways to open", "More actions", "Open right sidebar" | File-open integration; a right sidebar |
| "Trajectory" tab | A step/trajectory inspector |
| Per-message "Good response", "Bad response", "Branch" | Feedback and conversation branching backends |
| Per-message "Usage 0 tok" | Token accounting |
| Composer's access-mode and model dropdowns | A second mode, a second model |
| Composer's stats footer | Turn/step/token/context accounting — **it renders zeros, deliberately** |
| Settings → Models: "Delete" on a provider | An unconfigure capability |
| Settings → Models: "Fetch available models" | Live provider introspection |
| Settings → Models: "Open configuration file" | An OS file reveal |
| Review panel: "Split", "Fullscreen", "Collapse right sidebar", "Show file location", "More ways to open" | A multi-pane layout engine; fullscreen; a collapsible right sidebar (the reference shows the last two disabled too) |
| Completed session: "Open plan: `<title>`" | A plan-artifact viewer |

### Evidence-quality caveats

| Entry | What differs |
|---|---|
| Reference captures `16`/`17`/`18` never settled | The reference's 15s capture wait is shorter than its own retry backoff. Structurally comparable, temporally not. Each carries a "Reference not settled at capture" note. |
| The error checkpoint's trigger | The reference's `18-error` came from a connection timeout (closed port → `TIMEOUT`); the app's uses the mock's `[[scenario:error]]` (a scripted HTTP 500). Different failure modes, honestly reported rather than matched. |
| `02-model-settings` pairing | The reference's own `02` capture already showed a configured-provider card; the app's `02` is a genuinely fresh first visit. Both states are correct for their own lifecycle. Reordering the capture to match would corrupt `01`/`03`. Accepted, not fixed. |

### Capture artifacts (not product differences)

| Checkpoint | Why it can look wrong |
|---|---|
| `08-tool-running` | Local tools resolve in well under a millisecond, so the genuinely-"running" window is one event round trip. The capture can land on a completed frame. The running-state UI itself is verified by the stably-reproducible pending-approval state. |
| `13-plan-active` | The mock's `plan` script runs `todo_write` then `exit_plan_mode` back to back with no latency, so the capture often lands after the review card opened. |
| `14-subagent-active` | The "N subagent(s)" banner appears as soon as the child is *started*, which on a local mock can precede the capture's poll for the activity label. |

None of these was fixed by adding artificial delays, which would have misrepresented the app's real
latency.

## Where the full record lives

| File | What it holds |
|---|---|
| `cognate/DEVIATIONS.md` | The 30-entry narrative, with the reasoning, the evidence citations, and the 2026-09-27 status note |
| `parity-report.md` §"Deviations" | Each entry classified, plus the 19-criterion settlement gate |
| `critic/round-1-disposition.md` … `round-7-disposition.md` | Which findings were fixed, accepted, or rejected, and why |
| `reference-behavior-matrix.md` | What the reference actually does — the baseline for "deviation" |
| `primitive-provenance.md` | Not deviations, but the companion question: does every feature map onto existing framework primitives? |

## The two tests that encode divergences

A behavioural divergence is only real if something checks it. Two do:

- `cognate/test/J-D-approval.test.ts` — the approval-restart survival, in the app's own suite.
- `tests/drivers/types.ts` `Expectations` — `approvalSurvivesRestart` and `providerErrorCode`, so one
  Playwright spec asserts the *different* expected value for each system while keeping the assertion
  identical.

## Related

- [../explanation/parity-method.md](../explanation/parity-method.md) — why the method produces this list
- [../subsystems/validation-harness.md](../subsystems/validation-harness.md) — the machinery
- [../reference/journeys.md](journeys.md) — which journeys cover which divergence
- [../operations/troubleshooting.md](../operations/troubleshooting.md) — known documentation drift
