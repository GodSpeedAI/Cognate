# Current status

**Status revision:** 70

**Summary:** The root README is reframed around the public positioning — Cognate is an open-source semantic application SDK for building agent-native software — with every quick-start claim re-verified against the published surface. No code changed.

The 1541-line front page became an orientation document: one definition, why the
semantic center matters, what you can build, the Refund Desk working example, a verified
two-path quick start, one architecture diagram with the six-plane table, the
one-operation-many-representations idea, a mechanism map that links every idea to the doc
that owns it, Workbench and Horizon with honest scope, the 15-example tree, and an explicit
what-works-today list. Deep material now lives where it was always owned: in `docs/`.

Every quick-start claim was run, not assumed. The skills flow installs from the public
repository; the Refund Desk example's tests pass (7/7) on the landing branch; the SDK is at
0.7.1 on npm; and the published CLI still requires `--source`, so the README keeps that
instruction and cites DEBT-016 until the debt-burndown branch's registry-mode `create`
ships. The skills-flow fences stay byte-identical to the landing onboarding data, so the
landing branch's tests survive the eventual merge.

Gates observed after the rewrite: documentation links and map (5/5), README examples
(16/16), package READMEs (45/45), proof routing (5/5), release publication (9/9), and the
substrate check (81 requirements, 0 blocked). Details are in
[`.agents/evidence/2026-10-26-readme-reframe.md`](.agents/evidence/2026-10-26-readme-reframe.md).

The `docs/readme-reframe` branch is ready for operator review. The landing branch
`feature/landing-repositioning` carries the matching landing-page reframe and is pushed for
review. Merge of both remains the operator's decision; the debt-burndown branch's small
README edits are superseded by this rewrite.
