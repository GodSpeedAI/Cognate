# Product: Cognate landing page

Sources: `actualize/artifacts/brand/brand.md`, `actualize/artifacts/direction/creative-direction.md`, `actualize/artifacts/marketing/copy-deck.md` (owner-approved Product Actualizer run, model@7, 2026-10-15). Those files are authoritative; this is the working summary for design commands.

## Register

brand

## Product purpose

Cognate is the agentic application framework (open source, Apache-2.0, v0 on npm as `@godspeedai/cognate-*`). **You steer the software. AI agents build it, and work within it.** A person describes the app; their coding agent assembles it from Cognate's named, permission-checked capabilities with a durable record; inside the finished app, AI agents do real work within permissions the person sets and pause for approval when it matters; agents can extend it later without it losing its shape.

The page exists to move a visitor to one activation: their coding agent builds a small Cognate app, it runs, and its acceptance tests pass on their machine (the four steps in `#start`).

## Users

- Developers who already use coding agents (Claude Code, Codex, Cursor) and are new to Cognate. They want exact commands and proof.
- Intelligent non-developers and technical leaders deciding whether to trust AI with building and running software. They want to understand how it is put together and where the person stays in charge.
- Skeptics of AI autonomy. They look for permissions, approvals, and evidence, not adjectives.

Scene: a curious, intelligent reader on a laptop or phone, in daylight or office light, trying to understand what this is before deciding whether to trust an AI with their software. Light paper is primary; dark ("drawing on slate") is derived.

## Brand personality

Technical-editorial: an instrument manual crossed with a long-form magazine. Calm, precise, peer-guide stance ("here is how it is put together"). Parent voice is GodSpeed AI: executive-safe candor with practitioner teeth. Journey mode by default; at most one sharp Speed line per beat, always next to proof.

Lexicon to use: steer, describe, direct, build, capability, part, permission, approve, accept, evidence, record, extend, plug in.
Refuse: revolutionary, magic, effortless, autonomous (as a selling point), unleash, supercharge, superpowers, 10x, AI-powered, seamless, cutting-edge, next-gen, "the only", "trusted by", "trust the agent", "done" without evidence.

## Anti-references

- Purple/blue AI gradients, glowing brains, neural node clouds, particle fields.
- Fake browser, terminal, or IDE chrome. Real captures only, captioned as real.
- Icon-over-heading three-card feature grids, hero metric tiles, benchmark numbers.
- Dark-first neon developer look.
- Cognate-Workbench's cockpit styling (its cobalt, Inter/Space Grotesk/JetBrains Mono) outside its captures.
- Reflex-reject typefaces: Inter, Space Grotesk, Fraunces, IBM Plex Mono, Instrument Sans/Serif.
- Decorative motion. Every animation reveals a relationship or a state change.

## Strategic principles

1. **Truth over polish.** No unsupported claims, no fake screens, no dead controls. Every capability claim is source-verified (`bun run verify:sources`). Cognate-Workbench is an app built with Cognate (a coding and work agent harness), never "Cognate" itself, and never a supervision cockpit. Do not claim parallel Specialists.
2. **One signature.** The exploded assembly drawing of a real Workbench capture is where distinctiveness is spent. Everything else stays quiet: type, rules, white space, real captures.
3. **The person decides.** `--human` green appears only where a person approves, denies, accepts, or authorizes. `--signal` orange marks the one thing to look at now.
4. **No reader loses information.** Reduced motion, no-JS, keyboard, touch, and screen-reader readers get the full story (static keyframe and text parts list).
5. **Copy is kept in sync.** The README and the page share commands and the first request; `tests/readme.test.ts` enforces it.
