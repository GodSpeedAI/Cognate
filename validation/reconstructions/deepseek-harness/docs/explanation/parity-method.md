# Why there is a validation harness at all

## The question this answers

This repository builds a web app **and** a rig that pins a third-party product, drives both through
one interface, and measures the difference. That is a lot of apparatus. What is it for, and what does
"parity" mean here now that the product has moved on?

## The exercise

Reconstruct a pinned reference product's behaviour on a different framework, then establish two things:
that the behaviour matches (or differs in documented, deliberate ways), and that doing it required no
reference-specific framework primitives.

The second half is the part that is actually novel. A reconstruction that imported the reference's own
session abstraction or copied its tool layer would be behaviourally faithful and architecturally
worthless. `tests/architecture/` exists to make that outcome impossible:

- Criterion 1: no dependency on the reference package family in any manifest.
- Criterion 2: no import resolving into the reference checkout — **including the built browser
  bundle**, which is fetched from the running app rather than re-derived.
- Criterion 3: no copied source, tested as 8-line normalized shingles, and no byte-identical asset.
  (It ran for real, because the reference checkout was present.)
- Criterion 4: no reference-specific primitive in the framework; every symbol added to `packages/`
  must be traceable to a declared finding.
- Criterion 8: the app still works after the reference checkout is physically moved off disk.

The payoff came in the form of four framework findings, and their character is the interesting part.
Three were **defect repairs** in existing primitives: D1 (emit-counter drift on replay), D2
(provider stream abort not mapped to the typed error), F3 (structured failure detail discarded at the
kernel's JSON boundary). One was a **genuine architectural gap**: G1 — a capability handler had no
way to publish incremental progress into its invoking run, which meant streaming through a
policy-gated, hot-swappable `model.*` capability was not expressible in the framework at all. That
was surfaced, declared, and added as a domain-independent primitive with a conformance test, rather
than routed around inside the app. `parity-report.md` is explicit that G1 is reported honestly as
"a new general capability the test required", not folded into "no special case".

One finding was **left open**: F2, `spawnSubagent` being unreachable outside `createHarness`, with a
candidate general fix noted and correctly not taken, because it was never on the critical path.

## Why a differential harness rather than a spec

Because the interesting unknowns were behavioural, not textual. Which permission fields does a
sandbox-escalating tool actually have? Does a pending approval survive a reload? Does a session title
appear at turn start or at completion? Is delegation fire-and-forget? None of these are answerable by
reading documentation, and several were answered *wrong* by the reconstruction during the build and
corrected — the session title was fixed after critic round 1 found the evidence showed the title
already set mid-run, and delegation was corrected from synchronous-await to fire-and-forget.

Two more examples of the same shape:

- `reference-behavior-matrix.md` §0 and §0b are titled "RESOLVED" and record two questions the first
  capture could not answer — mock-model scenario routing, and a mock crash on client-aborted streams.
  Both were resolved by experiment, then re-observed.
- Three mock scenarios (`error`, `interrupt`, `retry`) exist *only* to make failure paths testable.
  `interrupt` drips one chunk every two seconds for up to a minute so a Stop button can be pressed
  while streaming. A testability constraint that shaped the fixture.

## Why the Driver interface

Because the assertions must not weaken per system. `tests/drivers/types.ts` puts every branding and
selector difference inside a driver implementation and leaves the *assertion* in the shared spec. The
`Expectations` interface is the pressure valve: exactly two named values where the systems are allowed
to differ — `approvalSurvivesRestart` and `providerErrorCode` — each with a citation explaining why.
Everything else is asserted identically. If a third divergence had appeared, the correct move was to
add a third cited expectation, not to add a branch in a spec.

## Why "deviation" is a first-class concept

A reconstruction that quietly differs is worthless as evidence. `cognate/DEVIATIONS.md` is a numbered
catalogue of every intentional difference, classified in `parity-report.md` as permitted brand
substitution, scope-limited stub, deliberate behavioural divergence, or evidence-quality caveat. The
inert controls are the clearest example of the discipline: rather than omit a control the reference
has, the reconstruction renders it with the reference's accessible name, disabled, with a visible
reason. That keeps a structural diff meaningful — "this control is missing" and "this control is
present and deliberately inert" become distinguishable in the aria tree.

## The status change, and what it means for the harness

**Verified:** `parity-report.md` and `cognate/DEVIATIONS.md` both carry a 2026-09-27 note that the
**visual** parity target was retired by operator decision in favour of an independent design system,
recorded in `cognate/DESIGN.md` and `cognate/PRODUCT.md`. `cognate/src/ui/app.css`'s own header
comment says the same: "an independent visual system, no longer a forensic reconstruction of the DeepSeek
Harness reference".

The settlement gate's 19 items were all MET before that decision, and the report is retained as a
historical record that parity *was* achieved. But it is explicitly "no longer being kept green".

**What survives the change:**

- The journey suite. Behavioural parity is unaffected, and `tests/journeys/` is a test rig, not a
  screenshot comparison.
- The architectural criteria. They say nothing about appearance.
- The app's journey tests, which are written against the app's own behaviour.
- The mock model, the fixture workspace, the reference manifest, and the aria observations — the
  behavioural evidence base.

**What is now historical:** the per-checkpoint pixel diffs in `diffs/`, and the argument encoded in
`DEVIATIONS.md` that "every control listed below is present in the DOM/aria tree with the reference's
accessible name" — a strategy that existed so structural diffs would be meaningful. With visual
conformance retired, inert controls are now a product problem, not a parity-tooling decision. That is
precisely why `cognate/PRODUCT.md` lists Principle 3 — "No control renders that doesn't do
something" — and why `cognate/DESIGN.md` records that the inert-control catalogue is to be resolved per
control rather than preserved.

## What this means for the documentation you are reading

Two things follow, and they shape this docs tree.

**1. Exact user-facing strings are load-bearing.** "the user rejected escalating this program to
…" and "exit_plan_mode is only available in plan mode" are asserted in tests because they were matched
against observed reference behaviour. That is why a surprising amount of this documentation quotes
strings verbatim.

**2. Deliberate oddness has a reason.** Inert dropdowns, a single-provider backend behind a
multi-row UI, a right panel that exists only for subagent transcripts, `+1` step counters — each traces
to a documented deviation or critic finding. If something looks over-specified, look for it in
[../reference/deviations.md](../reference/deviations.md) and `critic/` before "fixing" it.

## Confirmed versus inferred

**Verified:** all nine architectural criteria and their results; the four framework findings and
their dispositions; the 19 settlement-gate items; the retired visual target; the two `Expectations`.

**Strong inference:** that the harness is a reusable pattern for future reconstructions. The
`Driver` interface, the mock-model scenario convention, and the "cite the divergence" discipline are
all written to be reused, and the `tests/package.json` description calls the suite "reusable". No second
reconstruction has been run against it, though.

**Uncertain:** how much of the harness is still exercised. Journey results and parity numbers in the
repository are from a recorded run; whether they have been re-run since the redesign decision is not
recorded anywhere in this tree. Treat the numbers as a snapshot, not a live status.

## Related

- [../subsystems/validation-harness.md](../subsystems/validation-harness.md) — the machinery
- [../reference/deviations.md](../reference/deviations.md) — the catalogue
- [../reference/journeys.md](../reference/journeys.md) — journeys and their tests
- [../operations/testing.md](../operations/testing.md) — how to run each suite
- `architecture-evidence.md`, `primitive-provenance.md`, `parity-report.md` — the evidence
- `critic/round-1-disposition.md` … `round-7-disposition.md` — the review record
