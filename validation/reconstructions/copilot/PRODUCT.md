# Product

## Register

product

## Users

Engineers and reviewers evaluating the Cognate substrate against a pinned CopilotKit
reference. They arrive to answer one question: *does this actually work the way the
reference does?* They open the app, drive a journey, and read the resulting state.

They are technically fluent and impatient. They do not need to be taught what a
lease or a projection is, and copy that explains architecture at length is noise.
What they cannot reconstruct themselves is **what just happened** — which run, what
state it left behind, and whether the thing they were checking is true.

Two modes of use exist and both must work:

- **Focused** — one journey, full attention, reading run status and state values.
- **Comparative** — one journey in view while another remains available for reference.

## Product Purpose

This app exists to make three agent capabilities *legible and trustworthy*:

- **Conversation** (J-A) — a message produces a visible, streaming, durable reply.
- **Frontend capability** (J-B) — a browser-mounted capability is discoverable while
  mounted, and genuinely unavailable once unmounted.
- **Shared state** (J-C) — the agent can write state, the user can edit it, and the
  next agent turn observes the user's edit.

Success is a reviewer being able to drive a journey and conclude, without reading
source code, that the behavior is correct. Failure is a reviewer *not knowing which
of those three claims was demonstrated*.

The app must be judged as a product-quality agent application. It carries its own
visual identity and is not a pixel copy of the reference UI.

## Brand Personality

Calm, exact, quietly confident. Three words: **precise, unhurried, evidentiary**.

It should feel like a well-made instrument rather than a dashboard — closer to a
well-designed developer tool than to a SaaS marketing surface. Confident enough to
be spare, never decorative. Evidence is presented, not advertised.

## Anti-references

- Generic dark-mode SaaS dashboards: cyan/indigo gradients, glassmorphism, glowing
  status dots, identical rounded cards in a uniform grid.
- "AI slop" signatures: purple-blue gradient hero text, emoji-as-iconography, pill
  badges on every heading, drop shadows on every surface, generic sans everywhere.
- Marketing landing-page composition applied to an instrument: centered hero sections,
  metric tiles, repeated card rows that carry no distinct information.
- Flattering the user with fake progress or decorative motion that does not correspond
  to real state.
- Overwriting the reference product's structure: this is an agent application, so
  conversation must read as a conversation, not as a log viewer.

## Design Principles

1. **Show the state, not the schema.** Surface what the user can act on — the reply,
   the state, whether a capability is available. Keep run IDs, projection names and
   package identifiers available on demand, not permanently on screen.
2. **One journey, one primary action.** Each view has exactly one thing to do. Chrome
   that competes with that action is noise.
3. **Evidence over reassurance.** If the app says a capability is unmounted, the
   control that mounts it should be the obvious next move. States are demonstrated,
   never asserted.
4. **Distinction over sameness.** Chat, capability and state are different kinds of
   work. They share a design language, not a layout.
5. **Progressive disclosure for the expert.** Diagnostic detail is one gesture away,
   never in the primary reading path.

## Accessibility & Inclusion

WCAG 2.1 AA is the floor, including 4.5:1 text contrast in both themes and visible
keyboard focus on every interactive element. All three journeys must be completable
by keyboard alone. Status must never be conveyed by color alone — pair it with text
or shape. `prefers-reduced-motion` disables all non-essential animation. Layouts must
survive 200% browser zoom and text expansion without clipping or horizontal scroll.