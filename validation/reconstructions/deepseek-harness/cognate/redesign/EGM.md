# deepseek-harness/cognate/redesign — Hallmark/Impeccable redesign evidence bundle

## Overview

This directory contains almost no product code. It is a capture of one design pass over the
reconstruction's UI: three audit/critique inputs, a merged backlog, a verification script, nine PNGs
under `screenshots/`, and two reports written afterwards. The backlog states what it is — a merge of
`hallmark-audit.md`, `impeccable-critique.md`, and `impeccable-audit.md`, deduplicated and classified
into ten dependency levels with the instruction to fix lower levels first
`[validation/reconstructions/deepseek-harness/cognate/redesign/backlog.md]`. The code being audited
lives in `src/ui/`; the audits only cite it `[validation/reconstructions/deepseek-harness/cognate/redesign/hallmark-audit.md]`.

## Interface

- `verify.ts` — the only source file; an ad-hoc Playwright script described as "not a permanent
  fixture", run by hand with the app already on `:3180`
  `[validation/reconstructions/deepseek-harness/cognate/redesign/verify.ts]`
- Reads `APP_URL` (default `http://127.0.0.1:3180`); no mock-model URL is read
  `[validation/reconstructions/deepseek-harness/cognate/redesign/verify.ts:APP_URL]`
- Writes its PNGs into `redesign/screenshots/`
  `[validation/reconstructions/deepseek-harness/cognate/redesign/verify.ts:OUT_DIR]`
- `screenshots/` — nine files, `01-first-launch` … `08-narrow-first-launch`, per the `shot()` call
  sites; `09-dark-mode-settings.png` exists on disk but no `shot()` call in `verify.ts` names it
  `[validation/reconstructions/deepseek-harness/cognate/redesign/verify.ts:shot]`
- `hallmark-audit.md` — read-only structural baseline with numbered findings, each citing
  `src/ui/app.css` line numbers for tokens such as the radius scale and the two-accent scheme
  `[validation/reconstructions/deepseek-harness/cognate/redesign/hallmark-audit.md]`
- `impeccable-audit.md`, `impeccable-critique.md` — the technical and UX inputs to the backlog
  `[validation/reconstructions/deepseek-harness/cognate/redesign/backlog.md]`
- `impeccable-detect-report.json` — a JSON array with no entries, i.e. the mechanical detector's
  "0 findings" result `[validation/reconstructions/deepseek-harness/cognate/redesign/impeccable-detect-report.json]`
- `verification-report.md` — final re-check as a per-finding table with a resolved? column and
  evidence column, plus a disclosed known-limitations section
  `[validation/reconstructions/deepseek-harness/cognate/redesign/verification-report.md]`

## Invariants

- `verify.ts` asserts nothing; it screenshots after fixed sleeps and prints collected console/page
  errors at the end, exiting 0 either way
  `[validation/reconstructions/deepseek-harness/cognate/redesign/verify.ts:newPage]`
- It expects the server and a scratch `COGNATE_HARNESS_HOME` to already exist; it boots neither
  `[validation/reconstructions/deepseek-harness/cognate/redesign/verify.ts]`
- The report keeps partial work visible rather than claiming completion: several rows are marked
  "Mostly", "Partially", or "Improved" with the residual scope spelled out
  `[validation/reconstructions/deepseek-harness/cognate/redesign/verification-report.md]`
- The report distinguishes findings verified live via a named screenshot from findings verified only
  by code reading, and says so for the graphite surface register
  `[validation/reconstructions/deepseek-harness/cognate/redesign/verification-report.md]`
- Findings are attributed to their source audit with a marker (`*(hallmark)*`, `*(critique)*`,
  `*(audit)*`) so the merge stays traceable
  `[validation/reconstructions/deepseek-harness/cognate/redesign/backlog.md]`

## Side Effects

- `verify.ts` launches Chromium from the hardcoded path `/opt/pw-browsers/chromium`, creates the
  screenshots directory, and overwrites the PNGs
  `[validation/reconstructions/deepseek-harness/cognate/redesign/verify.ts:chromium]`
- It creates a temp workspace directory via `mkdtemp` and selects it in the app's chooser
  `[validation/reconstructions/deepseek-harness/cognate/redesign/verify.ts]`
- It presses the app's Settings/General/Escape path, so it drives real UI state on the running server
  `[validation/reconstructions/deepseek-harness/cognate/redesign/verify.ts]`

## Verification

- The report records the checks run for the pass — `bun run typecheck` clean, and the mechanical
  detector returning no findings
  `[validation/reconstructions/deepseek-harness/cognate/redesign/verification-report.md]`
- To re-run the capture by hand, with the app already serving:
  `bun validation/reconstructions/deepseek-harness/cognate/redesign/verify.ts`
  `[validation/reconstructions/deepseek-harness/cognate/redesign/verify.ts]`
