# Deviations from the pinned DeepSeek Harness reference (tranche T5b)

This file records every place the Cognate reconstruction's UI is intentionally different from, or
inert relative to, the pinned reference — either because the underlying feature is out of scope
for this tranche, or because reproducing the reference exactly would mean copying DeepSeek's own
content/branding. Structural parity is still intentional: every control listed below is present in
the DOM/aria tree with the reference's accessible name, just disabled (`title="Not implemented in
this tranche — see APP/DEVIATIONS.md"`), so `tests/visual/compare.ts` diffs are content differences,
not missing-control differences. See `diffs/summary.md` for the measured per-checkpoint pixel-diff
evidence this file explains.

## No first-run dialog sequence (checkpoints 01, 03)

The reference shows an "Internal Testing Notice" dialog (DeepSeek-specific legal/testing-notice
copy) on a fresh `DSH_HOME`, dismissed with "Continue", before landing on the same "no workspace"
state Cognate shows immediately. Reproducing that dialog verbatim would mean copying DeepSeek's own
notice text; reproducing it with placeholder Cognate copy would misrepresent what this app actually
needs a first-run notice for (single-operator local app, `devTokenAuthenticator`, no external
account). We do not ship an equivalent dialog. This accounts for nearly all of the 01/03 checkpoints'
pixel-diff in `diffs/summary.md` (~76-85%) — the shell underneath (sidebar, empty state, chrome) is
otherwise the reference's structure.

## Settings > Models is a single always-open provider form, not a provider-list + add-wizard

The reference's Models pane lists configured providers as cards (name + collapsed "Customized
settings"), with a separate "Add model provider" flow (a dialog with a "Custom model API" tab, a
multi-step "Add model" -> per-model Model ID/Display name inputs, then "Create provider"). This
tranche only ever has one provider ("mock"/custom), so `SettingsModels` in `src/ui/App.tsx` keeps a
single inline form (Provider id / Base URL / Protocol / Model / API key) inside the same left-nav +
"Models" panel chrome as the reference (checkpoints 02/02b/02c/02d), with a disabled "+ Add model
provider" button present for structural parity. The write-only API key contract is implemented:
reopening Settings after Save never shows the plaintext key back, only a "Configured — enter a new
value to replace" placeholder (checkpoint 02d).

## Settings General / Built-in plugins / Agent presets — inert nav items

Present in the Settings left nav with the reference's exact labels (aria: `button "General"`,
`"Models"`, `"Built-in plugins"`, `"Agent presets"`), disabled. Only Models is implemented.

## Sidebar "Plugins" global panel — inert

`nav[aria-label="Global panels"] > button[aria-label="Plugins"]` is present and disabled. No plugin
system in this tranche.

## Session header actions — inert

"Open in Files", "More ways to open", "More actions" (`…`), and "Open right sidebar" are present
with the reference's accessible names but disabled — no file-open integration, no right sidebar/
inspector panel in this tranche.

## Trajectory tab — inert

`tablist` has both `tab "Chat"` (selected, functional) and `tab "Trajectory"` (present, disabled).
No trajectory/step-inspector view in this tranche.

## Message action row — Good/Bad response, Branch, Usage are inert or static

Copy (functional, uses `navigator.clipboard`), Good response / Bad response / Branch into a new
conversation are present with the reference's accessible names but disabled — no feedback or
conversation-branching backend in this tranche. "Usage 0 tok" is a static placeholder chip (no
token-usage accounting is computed).

## Composer permission-mode and model dropdowns — inert, single-value

`button[aria-label="Access mode, current: Workspace Write"]` and `button[aria-label="Select model,
current <model>"]` are present with the reference's accessible-name pattern but disabled — there is
only one implicit access mode and the currently-configured model in this tranche, so there is
nothing to switch between yet.

## Composer stats footer — static

"`N turns N steps · N tok/s`" and "`N% of context used`" are present in the reference's position and
wording pattern but always render `0 turns 0 steps · 0 tok/s` / `0% of context used` — no
turn/step/token/context accounting is implemented. Wiring this to real per-run counts is a backend
change; tracked here rather than done silently.

## Session title source (backend change made this tranche)

Confirmed against `reference/observations/aria/15-completed-session.desktop.txt`: the reference's
sidebar session-tree label is derived from the session's first **assistant answer** (its raw
markdown, truncated), not the user's first prompt, and reads "New Session" before any answer lands
(`04-workspace-selected.desktop.txt`). `src/projections/sessions.ts` was changed to match: title is
now set from the first `message.completed` text instead of the first `session.turn.started` message.
Tests `J-B-basic-session.test.ts` and `J-G-persistence.test.ts` were updated accordingly. The
reference's `all-prompts` LLM-re-titling cadence (session-title subsystem) is still not implemented
— every session uses the `first-prompt`-equivalent single-answer title for its lifetime.

## Cancel/error presentation — implemented, not reference-identical

`client.cancelRun()` is wired to a "Stop" button shown in place of "Send message" while a run
streams; a cancelled run appends a small centered "Stopped" system row (no reference equivalent
observed to copy exactly — the reference's own "Stop"-labelled control was not confirmed against
the pinned build per `reference-behavior-matrix.md`). A failed run renders the assistant row with a
red status dot and a `role="alert"`-free error-tinted body ("Something went wrong…") rather than the
reference's still-unconfirmed error-row chrome.

## Icons

All icons (`src/ui/icons.tsx`) are original inline SVGs drawn for this reconstruction — simple
monochrome line glyphs, not visual copies of the reference's iconography.
