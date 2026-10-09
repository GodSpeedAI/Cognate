# Evidence: 2026-10-09 — published-package README overhaul and 0.1.2 documentation release prep

## Audit matrix (initial audit → correction → verification)

All 36 published packages (35 `packages/*` + 2 `profiles/*`, minus none — 36 total including the
umbrella) shared the same baseline defects; per-package notes follow the shared matrix.

| Defect category (baseline audit) | Correction applied | Verification |
|---|---|---|
| 7–12-line stubs with no install/usage guidance (majority of packages) | Full consumer READMEs per `docs/package-readme-standard.md` | `bun scripts/check-readmes.mjs` gate |
| Internal identifiers in consumer docs: `spec §N`, `DEBT-###`, `CG-XXX-###` | Removed; consumer-important constraints rewritten in plain language | checker: banned-pattern scan |
| No installation instructions with exact published names | Every README: `bun add @godspeedai/cognate-<module>` | checker: install-command package names must exist in the workspace |
| No Bun-only runtime statement | "Requires Bun >= 1.4.0"; no Node/browser/Deno claims | standard + review |
| No working examples, or examples citing monorepo-internal paths | Quick starts derived from each package's `src/` and tests; citations point into the installed package | review vs src; CI clean-room executes representative flows |
| Missing license statement | Apache-2.0 section | checker |
| Repo README claimed "Nothing is published" (DEBT-016) | Targeted fixes: status banner, getting-started (published CLI), workspace-package intro | `bun run check` + review |

Per-package highlights:

- `cognate` (umbrella): license section added (was the gate's finding); already consumer-shaped.
- `cognate-cli`: rewritten for the published distribution — install (`bun add -g` / `bunx`),
  `create` with `--source` stated as a requirement (registry-only mode = remaining gap),
  `dev` routes and dev-only auth called out; internal vendoring prose and DEBT reference removed.
- `cognate-store-sqlite`: gold-standard rewrite — durability guarantees (WAL + FULL fsync,
  atomic per-decision transactions), one-writer-process and backup limitations preserved from
  the internal README but reframed; example corrected to the real `openSqliteStore({ path })`
  export (the draft's invented `createSqliteStore` was caught by source verification).
- `cognate-store-memory`, `cognate-events`, `cognate-runtime-api`, `cognate-kernel-api`,
  `cognate-profile`: rewritten by subagent A (contract/contract-implementer framing).
- `cognate-runtime-bun`, `cognate-client`, `cognate-projections`, `cognate-kernel-cordis`: subagent A.
- `cognate-artifacts`, `cognate-capabilities`, `cognate-continuations`, `cognate-provider-local`,
  `cognate-provider-openai-compatible`, `cognate-cognitive-api`, `cognate-cognitive-memory`,
  `cognate-cognitive-ruvector`, `cognate-cognitive-rvf`, `cognate-domainforge`,
  `cognate-realitytrace`, `cognate-mcp`: subagent B, with per-package honesty requirements
  (ruvector persistence/filtering constraints; domainforge external pin; realitytrace external
  tool prerequisites).
- `cognate-proto`, `cognate-protocol-connect(-bun)`, `cognate-a2a`, `cognate-ag-ui`,
  `cognate-react`, `cognate-ui-astryx`, `cognate-execution(-ssh/-wsl)`: subagent C.
- `cognate-profile-copilot`, `cognate-profile-harness`: subagent C, with the harness reference
  configuration security warning preserved.

## Version reconciliation (discovered during this mission)

Release Please's umbrella release PR (#21) silently reverted all 35 non-umbrella
`package.json` versions from 0.1.1 to 0.1.0 on main (linked-versions forced the group to the
umbrella's 0.1.0 while its packages-map entry was misconfigured — fixed earlier in #20/#21).
npm reality: 35 packages at 0.1.1, umbrella at 0.1.0 (verified via `npm view` per package).
The documentation-release branch reconciles tree and manifest back to the published state
(35 × 0.1.1 + umbrella 0.1.0) before the release commit, and the release itself is forced to
**0.1.2 × 36** with a `Release-As: 0.1.2` footer so the whole group lands in lockstep —
including pulling the umbrella from 0.1.0 straight to 0.1.2.
