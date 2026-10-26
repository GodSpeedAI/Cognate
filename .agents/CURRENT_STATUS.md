# Current status

**Status revision:** 72

**Summary:** Main now carries four reconciled lines of work with every gate re-run on the merged tree: the debt burndown, the README reframe, the standalone explainers, and the landing page with the unique work it owned. Superseded material was dropped rather than merged: the landing branch's README, its pre-debt CLI and create test, its templates move, and its 0.5.0-era doc and skill edits. The repository is reduced to main as the only branch, with the other branches archived in a local bundle.

The debt burndown (revision 70) closes eleven entries, makes the runtime loop event-driven,
and makes registry-mode `create` the default in the repository's CLI. `templates/starter`
stays at the repository root as the single copy and is copied into the CLI tarball at pack
time. The published `0.7.1` CLI still requires `--source`, and the README says so; that line
flips after the next release.

The root README is reframed around the public positioning — Cognate is an open-source
semantic application SDK for building agent-native software — with a verified two-path
quick start. The standalone explainers are under `docs/explainers/`, and the deeper
explanation pages (`design-principles`, `under-the-hood`, `what-you-can-build`,
`comparisons`) now exist where the README links to them, so no link is broken.

The landing page is the repository's own site: the semantic application SDK framing, the
one-application-many-doors beat, the build-time npm version chip, and the Expert Teams
evidence re-pinned to Workbench main. Its gates pass on the merged tree.

Gates observed on merged main: 81/81 substrate gates, 81 requirements implemented with none
blocked, docs 5/5, examples 16/16, package READMEs 45/45, landing 49 unit and 36 e2e tests,
source verification 19 excerpts and 16 edges, shots PASS at every width, and the Refund Desk
example 7/7 at 0.7.1.

Next: release 0.8.x from main, then flip the README `--source` wording. Ledger freeze
remains an operator decision.
