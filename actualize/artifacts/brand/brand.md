built_from: model@7
reads: [purpose, actors, constraints, voice, positioning, claims, unknowns, decisions]
cites: [C3, C4, C5, C6, C8, C10, C11, C15, C21, C30, C34, C44]

# Brand — Cognate

## Name and architecture
- **Keep "Cognate."** It has equity: 46 published packages, a GitHub org repo and an exemplar app ([C30]). A rename would cost the npm scope and the docs, and nothing in the evidence calls for one. Clearance screening hasn't been run. U8 records this; it does not block an existing OSS name.
- **Architecture rule:** Cognate is the framework. Things built with it are named on their own, with "built with Cognate" as an endorsement. Example: *Cognate-Workbench* is "an app built with Cognate," never "Cognate's IDE." Test: a hypothetical support-desk app would be "Refund Desk — built with Cognate," and a CLI tool would be `cognate`. Both are distinct and need no new mark.

## Positioning (four parts)
| Part | Decision | Status |
|---|---|---|
| Category | The agentic application framework (and SDK) | PROPOSED (owner D3) |
| Alternative used today | A coding agent writes the app from scratch on a general web framework and bolts on LLM calls and tool libraries. Each new feature is a fresh one-off. | PROPOSED: inferred, no actor evidence (U6) |
| The one difference | The app is assembled from **named, permission-checked capabilities** with a **durable record**. The same agents that build it can work inside it and extend it later without the app losing its shape. People approve what matters. | Each part rests on OBSERVED/VERIFIED claims: [C5], [C6], [C8], [C10], [C11], [C21] |
| Not for | Hosted no-code app builders; drop-in chatbot widgets; a thin wrapper around one model API; anyone who needs a stable 1.0 API today ([C4]) | — |

**Negation test.** Each line below states the opposite of a Cognate position and names who plausibly holds it.
- "Agents should call any tool the model chooses." Many agent loops work this way, so the difference survives.
- "Agent output is done when the agent says so." This is the default in most coding-agent workflows, so it survives ([C34]).
- "Simple, powerful, for teams." Nobody would say the opposite, so this line is cut.

**Owner-stated foundation (kept):** *"You steer the software. AI agents build it — and work within it."*

## Headline system (derived from positioning)
- **Eyebrow / category line:** Cognate — the agentic application framework
- **H1:** You steer the software. AI agents build it, and work within it.
- **Sub:** Describe the application you want. Your coding agent assembles it from Cognate's capabilities. Inside it, AI agents can do real work, within permissions you set, pausing for you when it matters.
- **Tagline challenge ("says who?"):** "agents build it" → [C21] [C44]. "Work within it" → [C10], [C15]. "You steer" → [C8] (default deny) + [C10]. All three are ledger-backed.

## Voice
**Parent voice (owner, 2026-10-15):** Cognate is a GodSpeed AI product and inherits the master voice at `godspeed-growth/brand/voice/godspeed-brand-voice.md`: *executive-safe candor with practitioner teeth*. The rules below adapt it for Cognate's audience, which includes intelligent non-developers.
- **Modes.** Journey mode (calm, precise, mechanism-first) is the default for explanation beats, onboarding and the README body. Speed mode is allowed for the hero hook and at most **one** sharp line per beat, always next to proof. The two modes are never mixed in one line.
- **Perception map.** *Governed* = authority before action (permissions, default deny, approvals [C8] [C10]). *Provable* = evidence after action (durable record, "finished" ≠ "accepted" [C11] [C34]). *Compounding* = capability after settlement (reusable, extensible capabilities [C5] [C21]). These line up with agent-operated, agent-built and agent-extensible.
- **Canonical lines usable where literally true:** "Authority precedes autonomy." "Evidence follows action." "A prompt is not an authority boundary." "Completion without proof is theater." When `.sea` modelling comes up, name DomainForge: "DomainForge makes business meaning executable."
- **Claims discipline:** separate evidence-backed claims from interpretation, ambition and roadmap. Roadmap items (skills.sh listing, CLI templates on npm, Expert Teams merge) are labelled as such.
- **Hard stops:** the master document's never-appear list applies, including glowing brains and humanoid robots, "trust the agent", and "done" without evidence.
- **"Not X. Y." contrasts:** the parent voice approves them, but use them sparingly (at most one per beat), because they also read as machine cadence.

**Traits with limits (Cognate adaptation)**
- Plain, not simplistic: explain outcomes first and mechanisms on request.
- Calm, not cold: confidence comes from showing, never from adjectives.
- Candid, not self-deprecating: state limits plainly (v0, needs a checkout today).
- Dry, not jokey: at most one light line per section, and never aimed at people.
- Human-first: the person directs and the agent does the work. Never give the agent the goal.

**Lexicon.** *Use:* steer, describe, direct, build, capability, part, permission, approve, accept, evidence, record, extend, plug in.
*Refuse:* revolutionary, magic, effortless, autonomous (as a selling point), unleash, supercharge, superpowers, 10x, AI-powered, seamless, cutting-edge, next-gen, "the only", "trusted by".

**Samples (voice transfer)**
- Greeting: "Describe the app. Direct the agent. Keep the final say."
- Confirmation: "Your app passed its checks. Here's what was tested and how."
- Warning: "This step changes files on your machine. Read it before you run it."
- Error: "The run stopped: the agent's input wasn't the shape the app expects. Send `{"message": "…"}` and try again."
- Limitation (instead of a price line, since Cognate is free under Apache-2.0, [C3]): "Cognate is early (v0). Some setup still needs a copy of the source. We say so where it matters."

**Floor:** install, error and permission copy is unambiguous first. Personality stops at commands, warnings and security notes.

## Identity (minimum system for this release)
- **Wordmark:** "Cognate" set in the display face chosen by Direction, with no symbol substitutions.
- **Mark:** a **capability cartridge**, a rounded-rectangle module with a single connector notch. It doubles as the visual unit of the exploded view, so the mark and the explanation share one shape. It must render at 16 px (favicon), in one colour, and reversed. Fidelity-qa renders and checks it.
- Unscreened mark (U8): label it internal until screened; this is a reversible decision.

## Proposed model rows
- `positioning`: the four-part table above (D7).
- `voice`: the traits, lexicon and samples above (D7).
- `unknowns` U8: trademark screening of the name and mark has not been run; the owner can answer.
