# First-Run Red Team: Cognate landing page and first build (2026-10-15)

Evidence used:
- **Comprehension:** a cold reader (a Haiku agent that read only the page text) answered the narrative questions. See `comprehension.md`.
- **Cold build:** a Sonnet agent followed only the page's "Your turn" section, the installed skill, and the files in node_modules. The transcript and friction table are in `cold-build-REPORT.txt` and summarized below.
- **Earlier build:** the npm-only first build in `../experience/first-build-npm-only.md`.
- **Browser runs:** the e2e suite at `landing/tests/e2e`.

## Executive read
- **Step most likely to lose the user:** Step 3 (the agent builds). The skill GitHub serves today, from main, is stale. It says the packages aren't published, pins 0.1.x, and routes through `cognate create`. The agent then hesitates or asks for a source checkout. **This is fixed on the branch (commit 4e2794f) and only reaches users when the branch is merged (U10).**
- **Permission moment most likely to fail:** the `npx skills add` warning about running with "full agent permissions", together with an install that takes about 60 seconds and prints no progress. Skeptical users may stop here.
- **Moment where things most likely look dead:** the skill install. A long clone runs with spinner noise and gives no progress.
- **Fastest improvement to activation:** merge the skill fixes. Second: the page's Step 3 recovery line "Don't use `cognate create` …" (added).

## First-run timeline (cold build, measured)
1. Prerequisites: about 1 s.
2. Skill install: 35 s. Files landed in `refund-desk/.claude/skills/` only; global dirs were unchanged.
3. Agent build: package install 7 s, plus npm checks of about 60 s. The `.sea` model took 4 validation attempts. Agent reasoning time was not measured.
4. `bun test`: 0.16 s, **6/6 pass** (five named journeys plus a model-load check). **Activated.**

## Failure points
### 1. Stale skill on GitHub main
- **Moment:** Step 3.
- **User goal:** the agent builds from npm.
- **What goes wrong:** `cognate-api.md` says nothing is published, `cli.md` pins 0.1.x, and SKILL step 3 relies on `create`.
- **Likely interpretation:** "This isn't released yet."
- **Abandonment risk:** high.
- **Recovery quality:** weak. The page recovery text didn't cover it until this pass.
- **Fastest fix:** merge 4e2794f before launch (product). The Step 3 recovery copy has also been added.
### 2. DomainForge CLI is an unstated prerequisite
- **Moment:** Step 3, during modelling.
- **What goes wrong:** the skill asks for `domainforge validate`, which needs Rust and cargo, and that isn't listed.
- **Abandonment risk:** medium.
- **Recovery quality:** good on the branch, where the skill has a no-CLI parse check and the cargo route.
- **Fastest fix:** done. An optional cargo line was added to Step 1 and the README prerequisites. The skill fallback goes live on merge.
### 3. "No API key" read as false
- **Moment:** Step H lede.
- **Likely interpretation:** "The coding agent needs a key, so this is untrue."
- **Abandonment risk:** low.
- **Fastest fix:** done. The copy now says "no AI API key for the app itself; your coding agent uses its usual sign-in".
### 4. Test count mismatch (7 vs 5)
- **Moment:** Beat E step 6.
- **Likely interpretation:** "The page contradicts itself."
- **Abandonment risk:** low.
- **Fastest fix:** done. The caption now explains that the seven tests are the five journeys plus two checks.
### 5. Jargon in the parts list and the layers
- **Moment:** Beat C, for non-developers.
- **What goes wrong:** "none verified", unexplained L1–L4 layer labels and agent names, and capabilities and parts blurring together.
- **Fastest fix:** done. The lede now explains the four layers and says "each part is a capability", and the list wording is plainer.
### 6. Permission claims are asserted, not shown, in text-only reading
- **Moment:** Beats D and F without interaction.
- **Fastest fix:** done. A static outcome line ("switch the caller to mallory … refused") now links to the authorization code line.
### 7. `.sea` modelling friction
- **Moment:** Step 3.
- **What goes wrong:** flows need entities; quantity units don't parse; `fmt --check` fails on a valid file; and the method asks for 7 deliverables for a tiny app.
- **Abandonment risk:** medium, because the agent absorbs it but it costs time.
- **Fastest fix:** an opportunity (OP-2). Add a proportionate "small app" path to the modelling skill, and fix the DomainForge fmt/units issues upstream. Not changed in this run because it is the owner's methodology.

## Persona notes
### In a hurry
The hero and "Build your first app" CTA reach #start in one click, and the four steps are short. The risk is the 35–60 s skill install with no progress output. Their time to a passing test was about 5 minutes of commands plus agent time.
### Skeptical about AI, autonomy and permissions
They see that people approve consequential steps and accept the results. Before this pass, the permission claims read as assertions. The static mallory line and the link to the authorization code now give them something checkable. The skills CLI's "full agent permissions" warning will alarm them, but the page is honest that the skill installs only into the project folder [verified]. Residual: they may want a security page, and `docs/security.md` exists and is linked from the README.
### No development background
Before the copy pass, the comprehension score was 3–4 out of 5. They understood build versus operate and that Workbench is an example. They lost the thread in the repeated parts list and the code. After the fixes, code sits behind disclosures and the layers are explained. Residual: they still need a terminal and a coding agent. The page's "I'm new to coding agents" path explains each step, but installing an agent is outside Cognate's scope.
### Familiar with coding agents, new to Cognate
This persona is best served. The exact commands and request are copyable, and the README and site match (enforced by a drift test). Residual: they may try `cognate create` from habit. The recovery line covers it.
### Hits an early install or runtime error
Every step has an "It failed" drawer with the observed errors: `bunx` missing, `SQLITE_CANTOPEN`, the agent not using the skill, and the agent wanting a checkout. Gap: no recovery is listed for the skills CLI failing on the network (git clone). The manual-copy fallback is listed in Step 2.

## Activation killers
- The stale skill on the default branch (merge needed).
- An unstated Rust/DomainForge prerequisite (now stated; the fallback goes live on merge).
- `cognate create` habit or instruction (now covered in recovery).

## Highest-leverage fixes
1. [owner] Merge feature/landing-repositioning, which brings the skill fixes into the default branch that `npx skills add` reads.
2. [done] Step 3 recovery copy, prerequisite clarity, and the no-API-key wording.
3. [opportunity] Ship the CLI templates on npm so `cognate create` works without `--source`. Add a small-app path to the modelling skill.
