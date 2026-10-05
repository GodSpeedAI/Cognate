# Critic round 1 — disposition

Builder pass addressing `critic/round-1.md` (checkpoints 01, 02/02b/02c/02d, 03, 04, 05, 06, 07, 08,
09, 10, 11, 11b, 12, both viewports). Checkpoints 13/14/18/19 and their variants remain out of scope
(owned by the plan/subagent/cancel workstream) and were not touched except incidentally (capture
script + fixture-seeding fixes below, which affect every checkpoint's capture reliability, not their
behavior).

Process: implemented each fix in `APP/src/**`, ran `bun test test` (19/19) and `bun run typecheck`
after each change, then ran `tests/capture/cognate.capture.ts` for both viewports, `tests/visual/
compare.ts`, and read the resulting triptychs for every affected checkpoint. Five capture/compare
rounds total (two spent tracking down a capture-infrastructure regression unrelated to the critic
items — see "Capture infrastructure fixes" below). No code, CSS, or assets were copied from
`.tmp/ref/**`; screenshots/observations/ARIA text were used as evidence only.

---

## P0

### P0-1. First-run dialog pair — **FIXED**
Two Cognate-branded dialogs now appear on a fresh `COGNATE_HARNESS_HOME`: "Internal Testing Notice"
(heading + two paragraphs + "Continue") and "Add an API key to get started" (API-key textbox +
"Configure later"/"Save and continue", the latter disabled until a key is entered). Same `dialog`/
`heading[level=2]` roles and button set as the reference; copy is Cognate's own, not DeepSeek's.
Dismissal is durable per-home (`onboarding.dismiss` capability → `agent.config` → `onboarding.dismissed`
event → `onboarding` projection — `src/capabilities/onboardingDismiss.ts`,
`src/projections/onboarding.ts`), so it reproduces the reference's per-`DSH_HOME` persistence via
Cognate's own event/projection mechanism.
Evidence: `diffs/desktop/01-first-launch.png`, `diffs/laptop/01-first-launch.png`,
`cognate/observations/aria/01-first-launch.desktop.txt`.
Files: `APP/src/ui/App.tsx` (`FirstRunNotice`, `FirstRunApiKey`, `FirstRunDialogs`,
`useOnboardingDismissed`), `APP/src/capabilities/onboardingDismiss.ts`,
`APP/src/projections/onboarding.ts`, `APP/src/agents/agentConfig.ts`, `APP/src/server.ts`.

### P0-2. Sidebar auto-collapses at 1024×768 laptop viewport — **FIXED**
The breakpoint media query was `(max-width: 1024px)`, which matches at exactly 1024px (the laptop
checkpoint width itself). Changed to `(max-width: 1023px)` so the sidebar stays fully expanded at
1024×768, matching every pinned laptop reference screenshot's evidence
(`product-characterization.md` §2: "`SIDEBAR_AUTO_COLLAPSE = 1024px` — sidebar auto-collapses to
rail *below* this width").
Evidence: `diffs/laptop/04-workspace-selected.png` (full sidebar: brand text, "New Session" label,
"Workspaces" header + search/view/add icons, session tree, "Settings" label — all now present at
1024×768); laptop checkpoints 04-20 now sit in the same 2-6% diff range as desktop (previously an
outlier before this fix).
File: `APP/src/ui/App.tsx` (the `useEffect` matchMedia query).

### P0-3. Session title not literal-first-message during a run — **FIXED**
`sessions` projection now sets the title from the literal first human message text (truncated) at
`session.turn.started` time, matching the reference's in-flight behavior confirmed in
`reference/observations/aria/06-user-message.desktop.txt`/`08-tool-running.desktop.txt`.
`message.completed` no longer overwrites an already-set title.
Evidence: `cognate/observations/aria/11-approval-pending.desktop.txt` (sidebar treeitem shows the
literal message, not "New Session", while the run is still waiting); `J-B-basic-session.test.ts`/
`J-G-persistence.test.ts` updated and passing.
File: `APP/src/projections/sessions.ts`.
Note: the reference's separate `all-prompts` LLM re-titling call (observed to exist per
`reference-behavior-matrix.md` §0) was not observed to visibly replace the literal title within the
pinned pass's evidence — not implemented here either; documented as an assumption in
`DEVIATIONS.md`, not silently dropped.

### P0-4. Settings → Models: provider list + add-provider wizard — **FIXED**
`SettingsModels` now has a list view (configured-provider card with API key field + collapsible
"Customized settings" + Cancel/Apply, or an empty state) and a two-tab "Add model provider" wizard
("Third-party model provider" combobox / "Custom model API" form: Provider ID, Display name, Base
URL, API protocol combobox (3 options), API key, a Models region with Fetch/Add, Cancel/Create
provider). The created provider renders as a card with an "API key configured" checkmark and
Edit/Delete buttons.
Evidence: `diffs/{desktop,laptop}/02-model-settings.png`, `02b-model-settings-custom-form.png`,
`02c-model-settings-provider-created.png`, `02d-model-settings-redacted-key.png`.
File: `APP/src/ui/App.tsx` (`SettingsModels` rewrite), `APP/src/ui/app.css`, `APP/src/ui/icons.tsx`
(`CheckIcon`/`EditIcon`/`TrashIcon`), `APP/tests/drivers/cognate.ts`,
`APP/tests/capture/cognate.capture.ts` (driver/capture updated to exercise the new wizard flow).
Deviations documented in `DEVIATIONS.md`: the "Third-party model provider" list is a short, original
list of generic OpenAI-compatible presets (not the reference's ~35-entry DeepSeek-branded list —
trademark-copy concern, see below); the backend still holds one live provider config, so Delete is
present-but-disabled and only the Models sub-list's first row is wired to `model.configure`; "Fetch
available models" is present but disabled (no live introspection capability this tranche). J-CFG
test (`test/J-CFG-model-provider.test.ts`) still passes unchanged (UI-only change).

### P0-5. Sidebar approval badge — **FIXED**
Session rows now show a "Waiting for approval `<title>`" prefix plus an "Approval" badge with an
amber dot while `lastStatus === "waiting"` (and it isn't a plan-review wait, which keeps its own
"Plan awaiting review" prefix).
Evidence: `cognate/observations/aria/11-approval-pending.desktop.txt` — `treeitem "Waiting for
approval [[scenario:approval]] run something risky Approval now"`; `diffs/desktop/11-approval-pending.png`.
File: `APP/src/ui/App.tsx` (session-row rendering), `APP/src/ui/app.css` (`.approval-badge`).

### P0-6. Review panel missing bottom toolbar — **FIXED**
The expanded edit-diff view ("Review" panel) now has a "Split view" toggle (switches between a
two-pane old/new split diff and the previous unified view), a "Line wrap" toggle, and an "Open
`<file>` in sidebar" button (present with the reference's accessible-name pattern, disabled — no
file-in-sidebar viewer capability this tranche).
Evidence: `diffs/{desktop,laptop}/10-file-change-expanded.png`.
File: `APP/src/ui/App.tsx` (`EditDiff` rewrite), `APP/src/ui/app.css` (`.review-panel*`).

---

## P1

### P1-1. Missing "Open configuration file" link — **FIXED**
Present in the Settings dialog titlebar (top-right), disabled — no OS file-reveal capability this
tranche. Evidence: `diffs/{desktop,laptop}/02-model-settings.png`.

### P1-2. First-launch/no-workspace shell diff once dialogs land — **FIXED (verified)**
Re-diffed 01/03 after the P0-1 fix: the underlying shell (sidebar width, "Into the Unknown" wordmark,
composer disabled state) is intact behind/around the dialogs — confirmed by reading
`diffs/{desktop,laptop}/01-first-launch.png` and `03-no-workspace.png`. Remaining diff is the
dialogs' content (Cognate copy vs. DeepSeek copy) and the third-party-preset list, which is expected
and documented, not a defect.

### P1-3. Composer stats/message-action row static — **NOT FIXED (accepted, per critic's own note)**
Critic explicitly flagged this as "not this round's blocker" pending durability/usage-accounting
work. No change made; still tracked in `DEVIATIONS.md`/README "Known gaps".

### P1-4. Settings button-label mismatches — **FIXED**
Subsumed by the P0-4 rebuild: list view now uses Cancel/Apply, the add-provider wizard uses
Cancel/Create provider. No more Close/Save.

### P1-5. Laptop Review-panel toolbar + Settings left-nav width — **FIXED (toolbar); partial (nav
chevron)**
The Review-panel toolbar fix (P0-6) applies identically at the laptop viewport —
`diffs/laptop/10-file-change-expanded.png` confirms. The Settings left-nav column width now closely
matches the reference's proportions at 1024×768 as a side effect of the wizard-dialog width increase
(`diffs/laptop/02-model-settings.png`). The small chevron/hierarchy affordance next to "Models" the
reference shows was not added — cosmetic-only, not a distinct control, and out of the P0/P1 budget
for this round; left as a P2-tier polish item.

---

## P2

### P2-1. Original icon set — **DEVIATION (unchanged, critic-accepted)**
No action; critic already ruled this acceptable (non-trademark visual substitution).

### P2-2. Original `run_code` sandbox — **DEVIATION (unchanged, critic-accepted)**
No action; critic already ruled this acceptable (backend detail, invisible in the UI).

### P2-3. Pending approvals surviving a full restart — **DEVIATION (unchanged, critic-accepted)**
No action; critic already ruled this acceptable (durable-continuation architectural invariant).

---

## Capture infrastructure fixes (not critic items, but required to produce trustworthy evidence)

- `tests/capture/cognate.capture.ts` now seeds the capture workspace directory with the same
  `fixtures/workspace/make-workspace.ts` template `test/J-C-tool-execution.test.ts` uses (a real
  `src/greet.ts` under git), instead of an empty directory — the empty directory (from this pass's
  earlier auto-`mkdir`) made every `[[scenario:multi]]`/edit tool call fail silently, which was
  producing `10-file-change-expanded` screenshots with no diff to expand at all.
- `tests/drivers/cognate.ts`'s `reload()` now waits out a flat window instead of a fixed 500ms: a
  hard reload re-triggers a full event-stream replay, and every replayed event refetches *every*
  client-side projection store (`packages/client`'s `Engine.dispatch`); on a session with dozens of
  recorded events this created a request-generation race (`ProjectionStore.refresh()`'s generation
  guard discarding late-arriving-but-superseded responses faster than they could resolve), which made
  `17-restored-after-reload` render the app's genuine fresh-install "no workspace" state (plus a
  flash of the now-present first-run dialogs) instead of the restored session — not a product bug,
  a capture-timing bug exposed by (not caused by) the round-1 fixes. Confirmed fixed:
  `17-restored-after-reload` is back to 2.90%/4.50% (desktop/laptop), in line with every other
  checkpoint.
- `tests/drivers/cognate.ts` gained `authenticateRaw`/`dismiss`, and `configureModel` was rewritten
  to drive the new wizard (Provider ID/Display name/Base URL/API key/Add model/Model ID), mirroring
  `drivers/reference.ts`'s equivalent methods.
- `tests/capture/cognate.capture.ts` pre-creates the workspace dir it needs (was previously assumed
  to exist).

## Test/typecheck gates

- `APP` (`bun test test`): **19/19 pass**, unchanged count.
- `APP` (`bun run typecheck`): clean.
- Root `bun run typecheck`: clean.
- Root `bun run test`: **524 pass, 0 fail** (≥523 required).
