# Current status

**Status revision:** 73

**Summary:** 0.8.0 is published and verified end to end. Release Please cut the linked-version release from main, the workflow published all packages, and a clean-room bunx @godspeedai/cognate-cli@0.8.0 create my-app --profile copilot generated an app that installed from npm and passed its own test with no checkout. Documentation now matches: README, getting-started, troubleshooting, the checkout tutorial, the substrate and verification references, and the building-with-cognate skill describe registry mode as current and keep --source as the way to try unreleased local changes. DEBT-016 records the 0.8.0 evidence, and examples/refund-desk is bumped to 0.8.0 with 7/7 passing.

0.8.0 is the release the reframe was waiting for. Release Please cut the linked version
from `main`; the workflow published every `@godspeedai/cognate-*` package and created
`v0.8.0`. A clean-room run outside the repository then exercised the promise the README
makes: `bunx @godspeedai/cognate-cli@0.8.0 create my-app --profile copilot` generated an
app whose dependencies resolved from npm, and the generated app's own test passed with no
source checkout.

`--source` did not disappear; it changed meaning. It is now the way to vendor a local
checkout when you want to try unreleased changes. The README, `getting-started`,
`troubleshooting`, the checkout tutorial, the substrate and verification references, and
the `building-with-cognate` skill all say that, and DEBT-016 carries the 0.8.0 evidence
that closed it.

The Refund Desk example runs on 0.8.0 and passes 7/7. The rest of the merged main still
holds: 81/81 substrate gates, 81 requirements implemented with none blocked, docs 5/5,
examples 16/16, package READMEs 45/45, landing 49 unit and 36 e2e tests, source
verification 19 excerpts and 16 edges, and shots PASS at every width.

Next: run `just verify` on `main`, then choose the next requirement from the ledger. Ledger
freeze remains an operator decision.
