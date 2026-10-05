# Round 7 disposition

| Item | Disposition | Evidence |
|---|---|---|
| P1 Work details control shape (toggle group vs dropdown) | FIXED: single menu button (`aria-haspopup="menu"`) named by the current value, opening four `menuitem`s | `cognate/observations/aria/22-settings-general.desktop.txt` lines 34–38 (`button "Standard"`) vs `reference/observations/aria/21b-persistence-after-reload.desktop.txt` line 72 (`button "Verbose"`); `cognate/screenshots/desktop/22-settings-general.png` |
| P2 verbose capture shows a different set of failed steps | Not a rendering defect: the failing steps depend on each capture run's workspace state; failed-step styling matches where it's triggered (round-7.md) | `diffs/desktop/21-work-details-verbose.png` |

Verification (orchestrator, 2026-09-27): `bun test cognate/test` 21 pass / 0 fail; `cognate` typecheck clean; `bun run journeys/run.ts cognate` 11/11 passed.
