built_from: model@7
reads: [actors, capabilities, positioning, voice, claims, decisions]
cites: [C1, C3, C4, C5, C6, C8, C9, C10, C11, C19, C21, C23, C30, C31, C32, C33, C34, C38, C40, C41, C43, C44, C45, C46, C47]

# Landing copy deck (public-facing; every fact cites a claim)

Voice: Journey mode by default. Speed lines are marked ⚡ (at most one per beat). Use the copy verbatim unless a layout forces a line break. The builder must not add factual sentences.

## Meta
- `<title>`: Cognate — the agentic application framework
- description: Describe the software you want. Your coding agent builds it with Cognate. AI agents can then work inside it, within permissions you set. Open source, Apache-2.0. [C3]
- OG image: the exploded keyframe crop (direction, Variants).

## Top bar
Wordmark "Cognate" · links: How it works (#parts) · Build your first app (#start) · GitHub (https://github.com/GodSpeedAI/Cognate) · small status chip "v0 · 0.5.0 on npm" [C1] [C4]

## A — Possibility (hero)
- Eyebrow: The agentic application framework
- H1: You steer the software. AI agents build it, and work within it.
- Sub: Describe the application you want. Your coding agent assembles it from Cognate's capabilities [C21]. Inside it, AI agents can do real work within permissions you set, and pause for you when it matters [C8] [C10].
- Primary CTA: Build your first app → #start · Secondary: See it taken apart → #proof
- Dialogue (caption: "Illustration of a request"):
  - **You:** "Build me a refund desk. Small refunds can go through. Anything over $50 waits for me."
  - **Your coding agent (with the Building with Cognate skill):** "Here's the plan: 1. Write down what the app must do, and who decides what. 2. Reuse Cognate's runtime, permissions and approvals. 3. Build the two capabilities it's missing: look up an order, issue a refund. 4. Make refunds over $50 pause for you. 5. Test every one of those, and show you the results."
- Footline: ⚡ You stay the one who decides. A prompt is not an authority boundary, so Cognate checks permissions in code. [C8]
- Transition prompt: "Does this hold up for a real application?"

## B — Proof (#proof)
- Kicker: Evidence
- H2: This app was built with Cognate.
- Body: Cognate-Workbench is a working application built with Cognate [C30]. It is an agent harness for coding and general work, where AI agents write and run code, plan, and carry out tasks in conversation with you [C31]. A person scopes a task with a contract that sets its goal, limits and acceptance checks [C33]. The agent does the work, and pauses for approval before risky steps [C32]. Then a person accepts the result, or doesn't [C34].
- Distinction note (set apart, `--human` rule): **Workbench is what was built. Cognate is what it was built from.** Workbench is an example application, not Cognate itself.
- Capture caption: Real screen from Cognate-Workbench, captured by its own end-to-end test [C41].
- Annotation callouts on the capture (3, short): "The contract: goal, authority, budget, acceptance" · "How done is it: 'finished' is the bottom rung" [C34] · "Acceptance checks: a test, an independent check, a person"
- Small gallery (3 captures with captions): "Blocked until authority is granted" (e2e-05) · "Review gate" (e2e-07) · "Accepted, on evidence" (e2e-08) [C41]

## C — Reveal (#parts)
- Kicker: Take it apart
- H2: What Workbench is made of.
- Lede: Underneath the screen there are four layers: the **interface** you use, the **agents** that do the work, the **capabilities** they work through, and the **durable record** of everything that happened. Each part on the capabilities layer is a capability, a named job with one purpose [C5]. Some come straight from Cognate. Workbench built others for itself, using the same pattern.
- Scroll captions (in order): "This is the real app." → "Four layers: interface, agents, capabilities, durable record." → "Each part does one job." → "Parts connect by contract. Select one."
- Figure caption: Illustration of how the app is organized. It is not a memory map or a deployment diagram.
- Inspector empty state: Select a part to see what it does, what it depends on, and where its source lives.
- Legend chips: "From Cognate" · "Built in Workbench" · "In development (branch)" [C40]
- Skip link: Skip the animation →

## D — Composition (#fit)
- Kicker: How parts fit
- H2: Ask for the job by name, not for the code that does it.
- Body: A capability has a stable name and version, like `billing.quote@1`. Code asks for the name, not for a particular implementation. Any part that provides a compatible version can answer [C6]. Before any part runs, a permission check decides whether this caller may use it, and the default answer is no [C8].
- Demo label: Interactive demonstration, runs in your browser, not a deployed app.
- Demo controls: **Provider:** Local model · Remote model (same contract `model.generate@1`) [C19] · **Caller:** alice · mallory · **Door:** Button in the app · Agent tool (MCP) · API call
- Demo result copy: allowed → "billing.quote@1 answered by *{provider}* through *{door}* → total 42. Recorded: invocation · allowed." Denied → "Denied by policy before anything ran. Recorded: invocation · denied."
- Takeaway: The same job, through three different doors, under one permission check. That's the difference between a capability and a pile of tools. [C9]
- Static outcome line (visible without JS): Try it: switch the caller to *mallory*. The call is refused before anything runs, and the refusal is recorded. The check happens in code: see the line in `packages/kernel-cordis/src/lease.ts` (link) [C8].
- Source note: Mirrors `examples/mcp` in the Cognate repo, which runs this exact flow [C9].

## E — Construction (#build)
- Kicker: Building with an agent
- H2: What your coding agent actually does.
- Lede: The Building with Cognate skill gives your agent a method, and these are its steps [C21]. Here they are applied to the refund desk you asked for in the opening.
- Steps (each shows a real excerpt from `examples/refund-desk` [C46]):
  1. **You describe the outcome.** The request, in your words.
  2. **The agent writes down what the app must accomplish.** A small domain model: who acts, what an order and a refund are, and the rule that refunds over $50 need approval. It's written in DomainForge, GodSpeed's modelling language, so both people and the software can check the rules. → excerpt `domain/refund-desk.sea`
  3. **It reuses what exists.** Runtime, permissions, approvals and history come from Cognate packages on npm. → excerpt `package.json` dependencies
  4. **It builds and binds what's missing.** Two new capabilities: `orders.lookup` and `refunds.issue`. → excerpt
  5. **It wires the behaviour.** Small refunds go through. Large ones wait for a person. → excerpt (waitFor)
  6. **It tests every journey and shows you.** → the real `bun test` output lines. Caption: Seven tests pass: the five journeys you asked for, plus checks that the domain model loads and that refunds survive a restart [C46].
- Closing line: You don't need to know how to write any of this. You do need to read step 6. [C44]

## F — Operation (#operate)
- Kicker: Agents at work, inside the app
- H2: The agent proposes. You decide.
- Body: Agents don't only build Cognate apps. They can work inside them. The refund agent looks up the order and proposes a refund. Over $50, it stops and waits durably, even across a restart, until a person decides [C10] [C46]. Every step is written to the app's history [C11].
- Demo (label "Demonstration"): run strip events: `refund.proposed $75` → `refund.awaiting_approval` ■ gate. Buttons: **Approve** / **Deny** → continues to `refund.approved → refund.issued → run.completed` or `refund.denied → run.completed (no refund)`. Reset.
- Acceptance block: H3 "Finishing is not the same as accepting." Body: In Workbench, "Finished" only means the agent stopped. The work is accepted only after a person reviews the evidence [C34]. ⚡ Completion without proof is theater. (Workbench done-ladder capture, captioned as real.)

## G — Extension (#extend)
- Kicker: It can grow
- H2: Need something new? Authorize the agent to add it.
- Body: Extension is a development step you start and review. The agent models the new job, builds it, binds it, tests it, and asks you to accept it. A running agent can only use capabilities it has been granted. It has no way to add parts to itself [C43].
- Sequence stamps on the new cartridge: Modelled → Built → Bound → Tested → Accepted by a person
- Real examples: Workbench's Expert Teams work added Experts, Teams and Schedules to the existing app. It is in development on a branch and not yet merged [C38] [C40]. In the refund desk, a receipt capability was added the same way, and tested [C46].
- Reassembly caption: Same app, one more part, and the same structure.

## H — Your turn (#start)
- Kicker: Your turn
- H2: Build your first app.
- Lede: No Cognate account, and no AI API key for the app itself, because the first app runs without a model. (Your coding agent uses whatever sign-in it normally does.) You're done when your app's tests pass on your machine, not when the agent says it's finished.
- Path toggle: "I use a coding agent" · "I'm new to coding agents" (the new-to-agents path adds one-line explanations under each step: what a terminal is, what the agent is doing, what "tests pass" means)
- Step 1, **Check you have the tools.** Bun 1.4 or newer, git, Node.js and a coding agent such as Claude Code. Optional: Rust's `cargo`, if your agent wants to install the DomainForge checker (the skill also has a check that needs no install). Command: `bun --version`. Expected: `1.4.0` or higher. Recovery: "bun: command not found" → install from bun.sh, open a new terminal. If `bunx` isn't found, use `bun x`.
- Step 2, **Give your agent the skill.** Commands: `mkdir refund-desk && cd refund-desk && git init` and `npx skills add GodSpeedAI/Cognate --skill building-with-cognate --skill deriving-interaction-domain-models --skill domainforge-sea -a claude-code -y` [C45]. Expected: "Installed 3 skills", with files under `.claude/skills/`. Note: Using another agent? Change `-a` (see `npx skills add --help`). Card: "skills.sh listing: coming soon" (placeholder link https://skills.sh/godspeedai/cognate/building-with-cognate) [C47]. Recovery: install takes about a minute because it downloads the repo. If it fails, copy `.agents/skills/building-with-cognate`, `deriving-interaction-domain-models` and `domainforge-sea` from GitHub into `.claude/skills/`.
- Step 3, **Ask your agent.** The first request (verbatim from README, copy button). Recovery: "The agent didn't use the skill" → start your message with "Use the building-with-cognate skill". "It wants the DomainForge CLI" → let it install with `cargo install domainforge-core --features cli --locked`, or tell it to use the skill's no-CLI check. "It asks for a Cognate source checkout, or tries `cognate create`" → tell it: "Don't use `cognate create`. Add the published `@godspeedai/cognate-*` packages with `bun add` and build the app directly." That's the verified route [C44].
- Step 4, **Check it yourself.** Command: `bun test`. Expected: passing tests for small refund completes / large refund waits for approval / approval completes it / denial refunds nothing / history records each step. Recovery: `SQLITE_CANTOPEN` → the app's data folder doesn't exist yet; ask the agent to create it on start. Tests fail → paste the output back to your agent and ask it to fix the failing journey, then run `bun test` again.
- Success state (when all 4 are checked): "That's a working agentic application, built by an agent you directed and checked by you." Next steps: Make it yours (copy the extension request) · Compare with the reference answer (`examples/refund-desk`, command) · Read the README · Explore the docs.
- Honest notes (small): Cognate is v0, and APIs will change before 1.0 [C4]. For developers: the `cognate create` template command still needs a copy of the Cognate source [C23]. This path doesn't use it.

## Footer
Cognate is open source under Apache-2.0 [C3], made by GodSpeed AI. Links: GitHub · npm · README · Docs · Cognate-Workbench · Debt register. Line: "Workbench screenshots are real captures from Cognate-Workbench (Apache-2.0)."

## Parts-list text rules (first-contact fixes)
- Replace "none verified" with "Nothing in this view" (e.g. "Used by: nothing in this view").
- Layer rows explain themselves: "L2 Agents: the three agents Workbench registers: config, coding and cognitive".
- Keep code excerpts behind "Show the file" disclosures in Beat E, so the step text reads without code.
