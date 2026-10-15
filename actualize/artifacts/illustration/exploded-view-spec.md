built_from: model@7
reads: [purpose, actors, form, voice, positioning, claims, unknowns, decisions]
cites: [C8, C10, C11, C30, C32, C33, C34, C35, C36, C38, C40, C41, C42]

# Illustration — the exploded assembly drawing

## What it asserts (the claims inside the picture)
1. Cognate-Workbench [C30] can be read as **four layers**: Interface → Agents → Capabilities → Durable record. These are logical layers taken from Workbench's own architecture document (main@d208cd0 docs/architecture.md:7-27). The figure caption says: *"Illustration of how the app is organized. It is not a memory map or a deployment diagram."*
2. The capability layer holds **named parts**. Each one is a real capability or component registered in Workbench, or inherited from a Cognate package [C42]. Every part carries a source citation.
3. Lines between parts are **verified dependency edges**. An edge is drawn only when the builder has found the code path (`ctx.invoke`, a declared requirement, or a direct import in the handler) and recorded it. An unverified edge is never drawn.

## Part census (BOM)
The builder confirms each row against source at the pinned SHA. A row that can't be confirmed is removed or relabelled, and the change is recorded in `landing/src/data/parts.ts` comments and in evidence/illustration/census.md.

| No. | Label (plain) | One-line job | Kind | Source anchor (to verify) |
|---|---|---|---|---|
| C-01 | MODELS | Talks to the AI model; providers can be swapped [C36] | inherited (Cognate providers) + Workbench registry | wb main src/components/providerRegistry.ts:3-27; cognate packages/provider-* |
| C-02 | TOOLS | Read, edit and run in the workspace | Workbench | wb main src/capabilities/tools.ts:164-208 |
| C-03 | WORKSPACE | Where the tools are allowed to act (local, SSH, WSL) | inherited (cognate-execution) | wb main src/capabilities/executionWorlds.ts:163 |
| C-04 | PERMISSIONS | Checks every call before it runs; the default is no [C8] | inherited (kernel policy) + Workbench authority | cognate packages/kernel-cordis/src/lease.ts:56-68; wb main src/server.ts:124-130 |
| C-05 | APPROVALS | Pauses the agent until a person decides [C10] [C32] | inherited (continuations) + Workbench gate | wb main src/agents/agentCoding.ts:527-529; src/domain/approvalGate.ts:52-62 |
| C-06 | WORK | Tasks with a contract: goal, limits, acceptance [C33] | Workbench | wb main src/workbench/contract.ts:5,51 |
| C-07 | EVIDENCE | Records what was checked; "finished" is not "accepted" [C34] | Workbench | wb main src/workbench/ledger.ts:163-188; src/capabilities/workbench.ts:195 |
| C-08 | WORKFLOWS | Repeatable sequences of work | Workbench | wb main src/capabilities/workbench.ts:279-310 |
| C-09 | SKILLS | A catalogue of reusable know-how bound to tasks | Workbench | wb main src/workbench/skillOs.ts; src/capabilities/workbench.ts:314-349 |
| C-10 | HISTORY | The durable record every view is rebuilt from [C11] [C35] | inherited (events, projections, store) | wb main src/projections/sessionTrace.ts:78; src/store.ts:14-23 |
| C-11 | MEMORY | What the agents can recall | inherited (cognitive) — **verify** | wb main src/server.ts (cognitiveComponent) |
| C-12 | INTERFACES | One service, many doors: browser UI, RPC | inherited (protocol-connect, react) | wb main src/server.ts:403-422 |
| C-13 | EXPERTS & TEAMS | Persistent specialists, teams, delegated work [C38] | Workbench, **branch only** [C40] | wb feature@fdc709b src/experts/service.ts:467 |
| C-14 | SCHEDULES | Runs due work at set times [C38] | Workbench, **branch only** [C40] | wb feature@fdc709b src/schedules/service.ts:100; evaluator.ts:200 |

Layers: **L1 Interface** (the real capture e2e-03 [C41]). **L2 Agents**, shown as three slim "agent" plates labelled CODING AGENT, CONFIG AGENT and MEMORY AGENT (main src/server.ts:218), to be verified. **L3 Capabilities** (C-01…C-12). **L4 Durable record**, a ruled ledger plate labelled "Event log · PostgreSQL" (src/store.ts:14-23).

Inherited vs built: every cartridge has a small corner tag, **"from Cognate"** or **"built in Workbench"** (or both). This is how the picture teaches that Workbench is made *with* Cognate.

## Drawing conventions
- Separation along a single assembly axis (Z, toward the viewer), in assembly order. Dashed mating lines run from each plate to the next. Cartridges rise from L3 along the same axis.
- Callouts use the part number plus a plain label, in Hanken 12–13px at display size. Leader lines are hairlines ending in a dot. Callouts sit outside the stage in two columns, so text never sits on the tilted plane. Information-dense text faces the reader.
- Cartridge: a rounded body (direction R4) with a notch on the connector edge, the part number in Martian Mono, the label in Hanken semibold, and the category fill `--part-*`.
- The selected part fills its outline with `--signal`. Its dependency edges draw in `--signal`, providers sit at full ink, and consumers are dashed. Everything else drops to 35% opacity. Colour is never the only carrier: edges also get arrowheads and the inspector lists them in text.
- Extension parts C-13 and C-14 use a dashed outline plus the tag "in development (branch)" until merged.

## Text equivalent (shipped in the page, always present in the DOM)
An ordered list follows the figure. It covers the 4 layers, then each part's number, label, job, "depends on" and "used by", from the same `parts.ts` data, so the text and the picture can't disagree. It is visible to no-JS and reduced-motion readers. For others it sits in a "Read the parts list" disclosure.

## Composition checks (before the full sequence is built)
- The densest keyframe has all four layers separated, C-01…C-12 visible, C-05 APPROVALS selected with its edges lit, and the inspector open. Render it at 1440×900 and 375×812, check that the smallest text is ≥12px and contrast is ≥4.5:1, and confirm nothing is clipped. Screenshots go to evidence/illustration/.
- Meaning test: show the keyframe to a reviewer agent that has no context, and ask what a cartridge represents and what the lines mean. Record the answers.

## As built (D18)
- C-11 is **SANDBOX WORLDS** (verified in source; nothing in Workbench is recall), not MEMORY. L2 agents are config, coding and cognitive.
- L3 is a 3×5 board: C-01…C-10 in two rows; front row C-11, C-12, the C-13/C-14 extension sockets, and one spare socket.
- 16 verified edges, recorded in actualize/evidence/illustration/census.md; G draws only the verified C-13→C-10 and C-14→C-13 edges.
