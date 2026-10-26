built_from: model@7
reads: [actors, capabilities, constraints, form, voice, claims, unknowns]
cites: [C9, C10, C11, C23, C24, C25, C26, C44, C45, C46, C47, C48]

# Experience — first-success journey, page interaction, state coverage

## Activation (decision D9)
**Activated = the visitor's coding agent has built a small Cognate app on their machine, the app runs, and its acceptance check passes, including a human-approval pause.**
Copying a command, finishing the scroll, or opening the repo is not activation.

**Product shape:** a pro developer tool, open source, with no account (flow-onboarding table). Include: a value-first browser demonstration (Beats D and F), a sample project in the form of a reference app plus the first request, a checklist, and recovery. Skip: signup, quiz, tour, pricing, invites.

## Journey J1: "Your turn" (#start), 4 steps (budget: ≤5 steps and ≤3 decisions)
| # | Step (verb-noun) | Owner | Exit (observable) | Failure path |
|---|---|---|---|---|
| 0 | Choose path: "I use a coding agent" / "I'm new to coding agents" | Visitor | The path is chosen. The choice only changes the explanatory copy, never the commands | — |
| 1 | Check prerequisites: Bun ≥1.4, git, a coding agent (Claude Code, Codex, Cursor, etc.). An API key is **not** needed for the first app [C25] | Visitor | `bun --version` prints ≥1.4 | "Bun not found" drawer: install link and the `bun x` vs `bunx` note |
| 2 | Give your agent the skill: run `npx skills add GodSpeedAI/Cognate` (choosing building-with-cognate and its two companion skills) **[verified route [C45]]**. A skills.sh card sits beside it marked "Coming soon", with a placeholder link (D4) | Visitor | The skill folder exists in the project (path shown) | Drawer: manual copy of `.agents/skills/{building-with-cognate,deriving-interaction-domain-models,domainforge-sea}` from GitHub |
| 3 | Ask your agent: copy the **first request** (Refund Desk) and paste it into the agent | Visitor → coding agent | The agent reports a plan, then builds | Drawer: "agent didn't use the skill" → tell it explicitly "use the building-with-cognate skill"; "agent asks for a Cognate checkout" → explain why, with the clone command [C23] |
| 4 | Check it works: run the acceptance command, then read the output. Expect ≤$50 to settle, >$50 to wait for approval, approve to refund, deny to not refund, and the history to be recorded [C10] [C11] | Visitor | Five named behaviour tests pass (the reference answer passes the same checks [C44] [C46]). This is the activation event | Drawer: common failures from the verified build report (exact messages and fixes) |
| → | Next: "Make it yours". Ask the agent to add a capability (extension request), then links to README, examples and docs | Visitor | — | — |

Notes:
- Commands and expected outputs are taken **verbatim** from the verified first-build report [C44] and match README.md's quick start (D15). skills.sh is shown as a labelled placeholder [C47]. An agent that wants the DomainForge CLI installs it with cargo [C48], and the skill also documents a no-CLI parse check. An unverified command is never shown as working.
- The "fast path" for A2 also offers a no-agent sanity check: `bun x @godspeedai/cognate-cli@0.5.0 create` with `--source` on a clone [C23] [C24], followed by the StartRun call with `{"message":"hello"}` [C26].
- Progress (checked steps and the chosen path) is kept in localStorage behind try/catch. A "Reset" link is provided. Steps work in any order; nothing is gated.

## Page-level interaction
- **Navigation:** a sticky slim progress rail lists the seven beat names. Each name is an anchor link, so the page can be entered directly. The rail is keyboard reachable and marks the current beat with `aria-current="step"`.
- **Skip links:** "Skip to: Build your first app", plus "Skip the animation" before the exploded view.
- **Exploded view:** cartridges are `<button>`s in DOM order (C-01…C-12). Hover or focus previews the part; click, Enter or tap selects it and opens the inspector (a non-modal side panel on desktop, a bottom sheet on mobile). Esc closes. Arrow keys move between parts. The inspector holds: what it does / why it exists / depends on / used by, with an optional "Show the code" disclosure (a real excerpt plus a GitHub link at the pinned SHA).
- **Demonstrations (Beats D and F):** real buttons. The result region is `aria-live="polite"`. They are labelled "Demonstration, runs in your browser".
- **Copy buttons:** use `navigator.clipboard`, falling back to select-text. Success shows "Copied" inline for 2s (`aria-live`). Failure shows "Select and copy manually", with the text pre-selected.

## State matrix
| Surface | Empty/first | Loading | Success | Error + recovery | Reduced motion | No-JS | Extremes |
|---|---|---|---|---|---|---|---|
| Hero | Static | n/a (static HTML) | — | — | Same | Same | 320px, 200% zoom |
| Exploded view | Intact capture | Capture lazy with low-res placeholder; layout reserved | Scrubbed | Image fail → alt text plus the drawing still works (cartridges are DOM) | Final keyframe static plus legend | Static legend list plus capture | 12 parts; long labels wrap to 2 lines |
| Inspector | "Select a part" hint | — | Part details | Code link 404 → still shows the excerpt | No slide (instant) | All parts rendered as a `<dl>` list | Long excerpts scroll inside |
| Composition demo | Default (Local provider, alice, UI door) | — | Result card plus event row | Mallory → "Denied by policy" state (intended) | Instant | Explanatory text plus the static outcome table | — |
| Approval demo | Run paused at gate | — | Approved → refunded | Denied → not refunded (intended); Reset | Instant | Static two-path table | — |
| Onboarding | Nothing checked | — | Step checked | Each step has an "It failed" drawer | Same | Fully readable; copy buttons hidden, code selectable | Long commands wrap/scroll; 320px |
| Copy | — | — | "Copied" | "Select and copy manually" | Same | Hidden | — |

## Capability↔surface correspondence (for the site)
- Every demonstrated behaviour cites a VERIFIED example run: D ↔ `example:mcp` [C9]; F ↔ `example:human-approval` [C10] plus the Refund Desk tests (U1).
- Any surface with no backing evidence is cut. In particular, no "deploy" button and no hosted playground.
