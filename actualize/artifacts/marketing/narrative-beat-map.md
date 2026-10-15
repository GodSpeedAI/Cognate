built_from: model@7
reads: [actors, capabilities, constraints, positioning, voice, claims, unknowns, decisions]
cites: [C1, C3, C4, C5, C6, C8, C9, C10, C11, C15, C19, C21, C22, C23, C24, C25, C30, C32, C33, C34, C35, C38, C40, C41, C44, C45, C46]

# Landing narrative — beat map and conversion structure

**Page job:** take an intelligent non-specialist (A1) or a developer who already uses a coding agent (A2) from "what is this?" to a working first app. **Funnel stage optimized:** activation, not signup. There is nothing to sign up for (Apache-2.0, [C3]).
**One primary action:** "Build your first app" → #start (Beat H). **Secondary:** "View on GitHub". Nothing else competes in the hero.
**Spine:** Possibility → Evidence → Understanding → Construction → Operation → Extension → First action.

## Beats

### A — Possibility ("You steer")
- **Visitor knows:** AI can write code. They are unsure whether it can build *their* app, and whether they'd stay in charge.
- **Question:** "Could I just describe software and have an agent build it, and would I still be in control?"
- **New understanding:** Yes. You describe the outcome, a coding agent builds it with Cognate, and you approve what matters.
- **Evidence:** [C21] (the agent skill exists); [C8] (default deny means nothing acts without permission).
- **Mechanism:** an H1 and a short **human→agent exchange** set as a typeset dialogue. It is not a fake chat UI. The person's request is set in Newsreader italic. The agent's reply is a plan of 5 numbered steps that mirror the real skill workflow (plan → model → bind → test → evidence). Stamp: "Illustration of a request".
- **Unlocks:** the vocabulary "describe → build → approve", and the question "does this hold up for a real app?"
- **Marginal value:** it sets agency and the human-in-charge frame before any mechanism appears.
- **Shorten when:** a test reader can already say what Cognate is from the H1 alone. In that case drop the dialogue to two lines.

### B — Proof ("This was built with it")
- **Visitor knows:** the promise. **Question:** "Show me something real."
- **New understanding:** Cognate-Workbench is a working app built with Cognate [C30]. It is a workspace where a coding agent works on tasks that a person scopes, approves and accepts [C32] [C33] [C34]. *Workbench is what was built; Cognate is what it was built from.*
- **Evidence:** a real capture [C41] (e2e-03 contract-complete) plus 2–3 more real captures (approval block e2e-05, review gate e2e-07, accepted e2e-08), each captioned.
- **Mechanism:** the capture sits large on the paper. Three annotations point at real UI (the contract, the "How done is it" ladder, acceptance criteria). A side note reads: "Workbench is an example app. It is not Cognate."
- **Unlocks:** a concrete object to take apart.
- **Marginal value:** it converts the promise into evidence.
- **Shorten when:** never remove. Cut to one capture if the beat exceeds 1.5 viewports.

### C — Reveal ("Take it apart") — SIGNATURE
- **Visitor knows:** a real app exists. **Question:** "What is it actually made of?"
- **New understanding:** the app is layers (interface → agents → capabilities → durable record). The capability layer is a set of **named, replaceable parts**: models, tools, workspace, permissions, approvals, work, evidence, history, workflows and interfaces. Each part does one job and connects to others by contract [C5] [C6].
- **Evidence:** the parts map to real Workbench and Cognate source. Each inspector cites a file and line and links to GitHub [C35] [C32] [C33].
- **Mechanism:** a pinned, scrubbed exploded view (see illustration and motion-editorial specs), with capability inspection and dependency highlighting.
- **Unlocks:** the word *capability*, as "a named part with a stable job".
- **Marginal value:** it is the one explanation that is hard to give in prose. The reader *sees* composition.
- **Shorten when:** if the exploded sequence plus inspector exceeds ~5 viewports of scroll, compress steps 2–3.

### D — Composition ("How parts fit")
- **Visitor knows:** the parts. **Question:** "How do parts become behaviour, and what stops them doing whatever they like?"
- **New understanding:**
  1. An app **asks for** a capability by name and version, and any **eligible provider** can fill it [C6].
  2. Every call is **checked against permissions first**, and the default is no [C8].
  3. The **same capability** shows up through different doors (a button, an agent's tool, an API) without becoming different features [C9].
- **Evidence:** the interactive is a faithful re-enactment of `examples/mcp`: `billing.quote` is provided by `billing` and listed as an MCP tool, and the caller "mallory" is denied [C9]. The provider swap mirrors provider pluggability [C19].
- **Mechanism:** a small "workbench table" demonstration labelled **"Interactive demonstration, runs in your browser, not a deployed app"**. Controls: swap the provider (Local ↔ Remote model, same contract `model.generate@1`); switch the caller (alice ✓ / mallory ✗ shows the policy decision); and pick a door (UI button / agent tool / API call). The same result card and the same event row appear each time.
- **Unlocks:** the difference between *meaning* (contract) and *implementation* (provider).
- **Marginal value:** it converts the picture into a rule the reader can predict.
- **Shorten when:** test readers already state the contract/provider distinction after C. Then keep only the provider swap.

### E — Construction ("What your agent does")
- **Visitor knows:** what an app is made of. **Question:** "So what does the agent actually do when I ask it to build something?"
- **New understanding:** the six real steps from the building-with-cognate skill [C21]: (1) you describe the outcome; (2) the agent writes down what the app must accomplish, as journeys in a domain model; (3) it reuses existing capabilities; (4) it builds and binds the missing ones; (5) it builds the interface and operating behaviour; (6) it tests each journey and shows you evidence.
- **Evidence:** a **real** small app, the Refund Desk reference [C44] [C46] (examples/refund-desk). Each step shows the actual artifact: the model excerpt, the binding list, the test names, and the real test output lines.
- **Mechanism:** a scroll-stepped assembly. A small app drawing gains cartridges step by step (reused parts drop in grey and new parts are outlined, then filled). Real file excerpts sit beside each step. No typing animation.
- **Unlocks:** "what to ask my agent", which is the first request used in H.
- **Marginal value:** it bridges "I understand the parts" and "I can get this built".
- **Shorten when:** if the verified build did not produce a step's artifact, drop that step's excerpt and say so.

### F — Operation ("Agents at work, inside the app")
- **Visitor knows:** agents build. **Question:** "What does it mean that agents work *inside* the app, and who stops them?"
- **New understanding:** an operational agent uses the app's permitted capabilities. When an action needs a person (a refund over $50), the agent **pauses durably** until someone decides [C10]. The decision and every step are recorded [C11] [C15]. **Finishing is not acceptance.** In Workbench, "Finished" sits at the bottom of a ladder that ends in "Accepted" [C34].
- **Evidence:** the human-approval run (`{"amount":75,"approved":true,"status":"refunded"}`) [C10]; the Refund Desk acceptance tests [C46]; and a real Workbench capture of the done-ladder [C34].
- **Mechanism:** a run timeline drawn as a strip of events. The agent proposes a $75 refund and the strip **stops** at an approval gate drawn in `--human`. The reader presses **Approve** or **Deny** (a demonstration), and the strip continues to "refunded" or "not refunded". Below it, the Workbench ladder capture is annotated.
- **Unlocks:** "collaborative agency under human direction", and the difference between execution and acceptance.
- **Marginal value:** it is the second meaning of *agentic*, which most readers won't infer.
- **Shorten when:** never remove. Compress the strip to 4 events on mobile.

### G — Extension ("It can grow")
- **Visitor knows:** build + operate. **Question:** "What happens when I need something new?"
- **New understanding:** you authorize your coding agent to add a capability with the same method: model it, build it, bind it, test it, accept it. The new part plugs into the same structure. **Deployed agents do not silently rewrite their own app.** Extension is a development act you authorize.
- **Evidence:** (1) Workbench's Expert Teams work added Experts, Teams and Schedules capabilities to the existing app on a development branch [C38], labelled "in development, not yet merged" [C40]; (2) the Refund Desk receipt extension, built and tested [C46].
- **Mechanism:** return to the exploded Workbench drawing. A new cartridge (`C-13 SCHEDULES`, dashed outline, "in development") is modelled → built → bound (leader lines connect) → tested (check) → accepted (`--human` mark). Then the layers **reassemble**.
- **Unlocks:** the complete loop, and readiness to start.
- **Marginal value:** it is the third property (agent-extensible) and it closes the narrative loop.
- **Shorten when:** the reader already understood extension from E. Then drop the Workbench part and keep the reassembly.

### H — Your turn ("Build your first app") — ONBOARDING (#start)
- **Visitor knows:** everything needed. **Question:** "What exactly do I do now?"
- **New understanding:** four steps to a working app. The success condition is a *passing check on a running app*, not a copied command.
- **Evidence:** only VERIFIED commands [C1] [C22] [C23] [C24] [C25] plus the verified first-build sequence [C44] [C45].
- **Mechanism:** a checklist journey (see the experience journey map) with progress kept in localStorage, copy buttons, an "It failed" recovery drawer per step, and a final acceptance check.
- **Unlocks:** their own development journey: next steps to docs, examples and the README.

## Objections and where they are answered
| Objection | Answered in | Proof |
|---|---|---|
| "Is this real or a concept?" | B, E | [C30] [C41], verified build (U1) |
| "Will the AI act without me?" | A, D, F | [C8] [C10] [C15] |
| "I'm not a developer." | A, E, H (plain path) | [C21], first request copy |
| "Is it ready?" | footer status, H | [C4] (v0, early), honest setup notes [C23] |
| "Why not just let my agent build on any framework?" | C, D, G | [C5] [C6] [C9] |

## Statements of absence (must stay true)
- "Cognate is early (v0)." [C4]
- "Scaffolding a new app today uses a copy of the Cognate source." [C23] Keep this only until the CLI ships its templates.
- "Expert Teams is in development and not yet merged." [C40]
- "The skills.sh listing is coming; until then, install from GitHub." (owner D4; the working route is [C22]).

## Measurement
The site ships **no analytics** (decision D8). Static, private by default, and no consent banner is needed. The activation metric is measured off-site: GitHub clones/stars and npm weekly downloads of `@godspeedai/cognate-cli` (baseline at launch to be recorded by the owner, U9).
