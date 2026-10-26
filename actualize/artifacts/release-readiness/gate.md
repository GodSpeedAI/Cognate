built_from: model@7
reads: [purpose, actors, capabilities, constraints, form, voice, positioning, claims, unknowns, decisions]
cites: []
owner: Sam Prime (GodSpeed AI)
verdict: go-with-exception

# Release-readiness gate: Cognate repositioning

Repository: /home/sprime01/projects/cognate
Branch: feature/landing-repositioning, HEAD 90a749d (local commits 9 ahead of origin/main; c3eaf4d is local-only)
Goal and bar (D1): reposition Cognate as the agentic application framework; release bar.
Scope of this gate: the repository deliverables (README.md, CONTRIBUTING.md, examples/refund-desk/README.md, landing/dist, copy deck). Launch prerequisites are listed separately below.

## Decision

**NO-GO for the repository deliverables until blocker B1 is fixed and B2 is fixed, then re-run this gate.**
Accountable owner: Sam Prime (owner), for both fixes and the launch prerequisites.

Once B1 and B2 pass, the repository deliverables meet the release bar, with waivers D15, D17 and D18 recorded below. Nothing here is a launch: the owner-only prerequisites (U10/U11, U7, U8, U3) still gate publication.

Agent scope note: this run did not edit README, docs, landing source, the model, or the copy deck. The fixes below are routed to their owners.

## Blockers

| id | severity | finding | source re-opened | route |
|---|---|---|---|---|
| B1 | blocker | README "Permission is default no" section says "Only the two capabilities listed are allowed for the refund-desk caller" and shows `allowCapabilities("refund-desk", ["orders.lookup", "refunds.issue"])`. The source allows three: `["orders.lookup", "refunds.issue", "notify.receipt"]`. The receipt extension was added to the same policy, so the README sentence is false for the shipped example. | examples/refund-desk/src/refund-desk.ts:160 (vs README.md lines 99-103) | README author (marketing/direction lens). Fix: show the three names, or state the two core names and mention the receipt extension. |
| B2 | blocker (ledger) | Downgrade proposal and cites hygiene: the copy deck uses C31 inline (Beat B) but `cites:` omits C31. The site copy therefore carries a claim that no stamp covers. Re-running `status` lists this as a blocker. | actualize/artifacts/marketing/copy-deck.md:3 | marketing lens: add C31 to cites, republish stamp, rebuild landing. |

B2 is a blocker under the staleness rule (the stamp does not list a cited claim). C31 itself re-verifies (see ledger).

## Major and minor findings (not blocking on their own)

| id | severity | finding | route |
|---|---|---|---|
| M1 | major, owner launch prerequisite (U10/U11) | The GitHub default branch still serves the pre-fix skill. `origin/main:.agents/skills/building-with-cognate/references/cli.md` says "current line: 0.1.x" and `bunx @godspeedai/cognate-cli@0.1`. The fixes (D13, commit 4e2794f / local c3eaf4d) are not on the default branch. Both first-run records (C44, C49) used the default-branch skill text, so their PASS verdicts describe pre-fix skill text. | owner (merge + push), then re-run the clean first build |
| M2 | major (ledger) | Downgrade proposal C27: README no longer pins `@0.1` (grep: no hits). Mark C27 superseded, not cited by public copy. | claims ledger (product model; owner-approved edit) |
| M3 | minor (ledger) | Downgrade proposal C28: cited lines now state packages are on npm (`docs/getting-started.md:18`). The `docs/troubleshooting.md:27` line is about `create --source`, not unpublished packages. Mark C28 resolved, not cited. | claims ledger |
| M4 | minor | Citation drift: C32 cites `agentCoding.ts:480-482,527-529`, actual `478-483,525-530` at d208cd0; C33 cites `contract.ts:5,51`, actual `4-6,50-52`. Behavior confirmed; line numbers need updating. | claims ledger |
| M5 | minor | Local `feature/expert-teams` (7eabd82) is ahead of origin (fdc709b, which C38/C40 cite). The public copy is labelled "in development (branch)", so no false claim, but the cited SHA should say origin. | ledger |
| M6 | minor | The installer also writes `./.agents/skills/` and `skills-lock.json` in the project. README says only `.claude/skills/`. | README author (optional) |
| M7 | minor | Cold-build copy fixes not applied: "expect the model step to take a few minutes", and the note on the installer's project-level files. Waived under D18 (accepted first-contact results and copy fixes). | waiver D18 |

## Check results

| # | check | method | result | evidence |
|---|---|---|---|---|
| 1 | Ledger walk | Re-ran npm view for all 45 public packages; refund-desk `bun install && bun test`; `example:human-approval`; `example:mcp`; `typecheck`; `example:` source re-opened at dd13c84 (kernel-api, kernel-cordis, runtime-api, continuations, runtime-bun, events, examples); C15 governance test; C24 cli-create test; C22 skills list; C45 install in a fresh `git init` scratch dir; Workbench refs read-only via `git show d208cd0` / `fdc709b` | **FAIL** (B1, B2). Everything else reproduces: C1, C2, C3, C5-C10, C9, C10, C13 (read), C14, C15, C17, C18, C20, C22, C24, C29, C30 (Apache LICENSE; no `license` field in package.json, minor), C31-C42 (cited lines match, drift in M4), C45, C46, C47, C50. C11, C19, C21, C23, C25, C26, C44, C48, C49 not re-run in this pass: cited evidence files exist (see below), source line-level checks only where listed. | npm-view.log, npm-all-45.log, refund-desk-test.log (exit 0, 7 pass), example-human-approval.log (exit 0), example-mcp.log (exit 0), typecheck.log (exit 0), c15-governance-test.log (exit 0, 7 tests), c24-cli-create-test.log (exit 0, 4 tests), c22-skills-list.log (exit 0), c45-skills-add.log (exit 0; global dirs unchanged by sha256), cited-source-ranges.txt, workbench-cited.txt, c2-changelog-line.txt |
| 2 | Staleness | `bun .../product-actualizer/hooks/src/cli.mjs status` from repo root | exit 0; **stale list empty**. Status reports 3 blockers: release-readiness lens still running (this run), B2 (copy-deck cites), gate file absent (this run). | staleness-status.log |
| 3 | Placeholder scan | Pattern scan over README, CONTRIBUTING, refund-desk README, copy deck (case-insensitive); grep -o over landing/dist/index.html | **PASS, with one labelled placeholder.** The skills.sh link is labelled "placeholder; not live yet" (README:46) and "coming soon" in the site (1 hit each in dist). The copy deck labels it too (line 92). Other pattern hits are false positives (markdown link text). No lorem, TODO, TBD, example.com, xxx, FIXME, or bracketed placeholders in public text. | placeholder-scan.txt |
| 4 | Cross-artifact extraction | JS extraction over site text, README, CONTRIBUTING, refund-desk README | **Consistent with explained differences.** Version 0.5.0: README, site, refund-desk README, npm (45/45). Package count 45: README only; site and CONTRIBUTING silent (no conflict). Bun: "≥1.4" (README), "1.4 or newer" (site), "1.4.0" (CONTRIBUTING, refund-desk). Test counts: README "five behaviours" in the quick start vs 7 in the example (5 journeys + domain-model load + restart) and site "Seven tests pass: the five journeys". Explained. Skill command: identical across README, site, copy deck. License Apache-2.0: consistent (README, site, CONTRIBUTING, LICENSE). Workbench: consistent (README, site; 23 capabilities, 12 projections confirmed). Expert Teams: labelled as development branch on all surfaces. Differences: B1 (policy excerpt); M6 (installer side effects). | cross-surface extraction (sandbox), link-inventory.json |
| 5 | Clean first run | Summarized existing records; did not redo the agent build | **PASS on the record, with M1 caveat.** Cold build (`first-contact/cold-build-REPORT.txt`): `bun test` 6/6, activated, but the record lists 9 HIGH/MEDIUM friction items (F1-F9, pre-fix skill text) and suggested copy fixes. npm-only build (`experience/first-build-npm-only.md`): PASS, bun test 6 pass, tsc 0 (after 2 skill-reference fixes), clean replay 0; friction F-1…F-14 each dispositioned to D13 or noted. Neither record ran on the default-branch skill that the public install command serves today. | cold-build-REPORT.txt, first-build-npm-only.md, c45-skills-add.log |
| 6 | Link and action sweep | Relative and anchor links resolved in README, CONTRIBUTING, refund-desk README, landing/dist; external URLs checked with fetch (HEAD, then GET) | **Relative and anchor links: 0 broken** (README 64 relative, CONTRIBUTING 22 + 1 anchor, dist 14 relative + 15 anchors). External (15 unique): 200 for casey/just, GodSpeedAI org and repo, README#readme, docs tree, DEBT.md, dd13c84 blob, Cognate-Workbench repo. skills.sh placeholder: 200 soft-404 body (labelled placeholder; C47). npmjs.com: 403 from the bot block (npm view confirms the package). **Five SHA links to c3eaf4d return 404.** c3eaf4d is local-only (not in any remote branch), so these **resolve after push (U11)**, not broken. CTAs and copy buttons: `landing test:e2e` 25 passed (exit 0). `just verify`: exit 0, 81/81 gates pass. | external-link-status.txt, landing-e2e.log, just-verify.log, link-inventory.json |
| 7 | Physical | n/a (software only, model Constraints) | n/a | model Constraints |
| 8 | Summary | This table and the waivers below | see decision | this file |

Landing build: `cd landing && bun run build` exit 0. dist/index.html sha256 aa62eb179f154f2ed1ee23b629688060905c292313c18f390499bbd115c2de09 (landing-dist-sha256.txt). Deployment hash check at a consumption point: **not run, no host yet (U7)**. The build hash is the only artifact covered by this verdict.

Repo state after the run: `git status` shows only the untracked `actualize/` directory; no commits, no pushes, no publish.

## Waivers (decision ids)

| decision | waiver | scope | expiry |
|---|---|---|---|
| D15 | skills.sh link is a labelled placeholder ("coming soon", "placeholder; not live yet") | README:46, site | until U3 (listing) is done |
| D17 | fidelity waivers (capture density at 1440 DPR2, practical UI type steps) | landing visual | not measured by this gate |
| D18 | accepted first-contact results and copy fixes (cold-build suggested copy changes M7) | README and site copy | next release |
| D13 | skill fixes committed at c3eaf4d, not yet on the default branch | `npx skills add` path | U10/U11 |
| D6 | irreversible actions (publish, push, npm release) deferred to owner | launch | U10/U11, U7 |

## Launch prerequisites (owner only, not repository deliverables)

- U10/U11: merge and push feature/landing-repositioning, so `npx skills add GodSpeedAI/Cognate` serves the fixed skill (M1), GitHub SHA links resolve (5 links, Check 6), and the landing deploys.
- U7: public URL / host for the landing page (deployment hash check cannot run until it exists).
- U8: trademark screening of "Cognate" and the cartridge mark.
- U3: skills.sh listing (placeholder until then).
- Also open: U4 (Expert Teams merge, Workbench beat copy), U9 (adoption baseline metrics), U6 (positioning test, user research). Not blocking the repository deliverables.

## Ledger downgrade proposals

- C27: CONTRADICTED to superseded (README no longer pins @0.1; not cited by public copy).
- C28: CONTRADICTED to resolved (cited docs now say packages are on npm; not cited).
- C32, C33: keep OBSERVED, correct the line ranges (M4).
- C31: keep OBSERVED (re-verified; also needs to be in copy-deck cites, B2).

## Evidence index

All files under /home/sprime01/projects/cognate/actualize/evidence/release-readiness/:
npm-view.log, npm-all-45.log, package-scan.txt, refund-desk-test.log, example-human-approval.log, example-mcp.log, typecheck.log, c15-governance-test.log, c24-cli-create-test.log, c22-skills-list.log, c45-skills-add.log, cited-source-ranges.txt, workbench-cited.txt, c2-changelog-line.txt, landing-build.log, landing-dist-sha256.txt, landing-e2e.log, just-verify.log, staleness-status.log, placeholder-scan.txt, site-text.txt, link-inventory.json, external-link-status.txt.
The C45 scratch install ran in /tmp/claude-1000/-home-sprime01-projects-cognate/91e0ba2e-15d8-47d4-bef4-6c86664f2534/scratchpad/rr/proj.

## Re-run after fixes (orchestrator, 2026-10-15)

| item | fix | verification |
|---|---|---|
| B1 | README "What you just built" now shows the real `.sea`-bound contracts (`bindCapabilities`, refund-desk.ts:57-66) and the three-name policy (refund-desk.ts:160), naming `notify.receipt` as the later extension | re-read source lines; `just docs` OK; `bun test tests/architecture/docs.test.ts tests/examples.test.ts` 21 pass |
| B2 | copy-deck `cites:` regenerated from inline ids (now includes C31) | synccites output lists C31 |
| M6 | README notes the installer's `.agents/skills/` copy and `skills-lock.json` | landing readme drift test pass (commands unchanged) |
| M2–M4 | ledger: C27/C28 annotated as resolved by D13; C32/C33 line ranges corrected | model reconciliation D19 |

**Decision after re-run: GO for the repository deliverables at the release bar**, with waivers D15, D17 and D18. **Launch remains gated by owner-only prerequisites:**
- U10/U11: merge and push the branch, so `npx skills add` serves the fixed skill and branch-SHA source links resolve. After that, re-run the clean first build (C44/C49) against the default branch.
- U7: choose the host and public URL (then add the canonical and OG URL).
- U8: trademark screening.
- U3: the skills.sh listing (the placeholder is labelled until then).
