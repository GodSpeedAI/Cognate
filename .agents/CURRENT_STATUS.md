# Current status

**Status revision:** 71

**Summary:** Main now carries three reconciled lines of work: the debt burndown (revision 70), the README reframe, and the standalone explainers.

The debt burndown closes eleven entries, makes the runtime loop event-driven, and makes
registry-mode `create` the default in the repository's CLI: `cognate create` pins the
`@godspeedai/cognate-*` packages from npm without a source checkout, and `templates/starter`
stays at the repository root as the single copy, copied into the CLI tarball at pack time.
The published `0.7.1` CLI still requires `--source`, and the README says so; that line flips
after the next release.

The root README is reframed around the public positioning — Cognate is an open-source
semantic application SDK for building agent-native software — with a verified two-path
quick start. The 1541-line front page became an orientation document: one definition, why
the semantic center matters, what you can build, the Refund Desk working example, one
architecture diagram with the six-plane table, the one-operation-many-representations idea,
a mechanism map linking each idea to the doc that owns it, Workbench and Horizon with honest
scope, the 15-example tree, and an explicit what-works-today list. Deep material lives where
it was always owned: in `docs/`.

The standalone explainers are new under `docs/explainers/`: an index, a run execution and
replay stepper, a planes and invariants explorer, and a concurrency and leases model. The
docs index, the README documentation map, and the architecture, verification, durable state,
runtime, and run execution pages link to them. The store wording now names SQLite and
PostgreSQL (pg0) where the docs previously said SQLite only.

Gates observed on the merged branches: documentation links and map (5/5), README examples
(16/16), package READMEs (45/45), proof routing (5/5), release publication (9/9), and the
substrate check (81 requirements, 0 blocked). The merged tree is re-verified in the next
snapshot. Details are in
[`.agents/evidence/2026-10-26-readme-reframe.md`](.agents/evidence/2026-10-26-readme-reframe.md)
and [`.agents/reports/debt-and-open-questions-2026-10-21.md`](.agents/reports/debt-and-open-questions-2026-10-21.md).

Next: merge the landing branch, re-run the full gate set on the merged tree, then release
0.8.x and flip the README `--source` wording. Ledger freeze remains an operator decision.
