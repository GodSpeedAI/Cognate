# DomainForge 0.18.2 pin: observed

Environment: Bun 1.3.14 (the repo records 1.4.0), linux-x64, registry `npm view @godspeedai/domainforge versions` = `0.15.0, 0.16.0, 0.17.0, 0.18.1, 0.18.2`.

| Check | Result |
|---|---|
| `index.js` / `index.d.ts` 0.18.1 vs 0.18.2 | Byte-identical; only `domainforge-core.linux-x64-gnu.node` differs. |
| Diagnostics probe (undefined entity/resource, syntax, duplicate, empty) | Same messages and single `GenericFailure` code as 0.17.0/0.18.1. Error `line`/`column` are JS call-site positions, not SEA positions. |
| `compatibility/phase0/domainforge` ×3 | 9 pass, 0 fail each. |
| `bun test ./packages/domainforge ./tests/integration/semantic-to-observation.test.ts` | First run 19 pass / 1 fail (golden: Policy expression `ForAll(...)` → `forall ...`); after regenerating the golden through the adapter, 20/20 ×3. |
| Golden diff | Exactly two fields: `binding` and objects[16].fields.expression. |
| `bun run check`, `bun run typecheck`, `bun test ./tests/proof-routing.test.ts` | Pass. |
| `bun example:domainforge` | Passes. |
| `bun scripts/gate.ts --implemented` | 68/78; the 10 failures are identical on 0.18.1 (git stash comparison) and environmental: scoped `compatibility/phase0/*` installs absent (e.g. `cordis`) and no SXR binary at `.tmp/realitytrace/bin/realitytrace`. Not caused by the pin. |

Changed: `packages/domainforge/package.json`, `src/types.ts` (`BINDING`), the golden fixture, `compatibility/phase0/domainforge/{package.json,bun.lock}`, root `bun.lock`.
