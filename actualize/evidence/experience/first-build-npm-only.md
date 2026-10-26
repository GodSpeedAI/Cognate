# First-build verification — npm-only route (2026-10-15, ~17:49–17:58Z)

Executor: Sonnet subagent acting as a newcomer's coding agent. Workspace: scratchpad `firstbuild/app` (copied into repo as examples/refund-desk after review).
Request used (candidate first request):
> Using the building-with-cognate skill, build me a small refund-desk app with Cognate. A support agent can look up an order and propose a refund. Refunds over $50 must wait for a human to approve them. Keep a history of what happened. Show me it working and tell me how you checked.

## Result: PASS (npm-only; no source checkout, no `cognate create`, no API key)
| # | Command | Exit | Key output |
|---|---|---|---|
| 1 | `git init -q` (new dir) | 0 | |
| 2 | `npx -y skills add GodSpeedAI/Cognate --skill building-with-cognate --skill deriving-interaction-domain-models --skill domainforge-sea -a claude-code -y` | 0 | "Installed 3 skills" → `./.claude/skills/`; ~/.claude/skills and ~/.agents/skills unchanged (diff empty) |
| 3 | `bun add @godspeedai/cognate-{runtime-bun,client,runtime-api,kernel-api}@0.5.0` | 0 | 18 packages |
| 4 | `bun test` (first) | 1 | StoredEvent field is `eventType`, not `type` (fixed) |
| 5 | `bun test` | 0 | 6 pass, 0 fail, 17 expect() |
| 6 | `bun run dev` (first) | 1 | SQLITE_CANTOPEN — store does not create parent dir (fixed in app) |
| 7 | `tsc -p tsconfig.json` (first) | 2 | TS2353 `version` not in Component (skill reference stale) |
| 8 | `tsc` after fixes | 0 | |
| 9 | clean replay (no node_modules): install / typecheck / test / dev+HTTP | 0/0/0/0 | |
| 10 | restart probe: propose $60 → restart → approve | 0 | run completed, refunded (continuation survived restart) |
| 11 | restart probe: in-memory orders after restart | 0 | `refundedCents` 0 while log has `refund.issued` (domain state not durable — F-6) |

Acceptance tests (each can fail; mutation-checked — threshold moved to $100, denial still issuing, dropped approve emit → exit 1):
(a) ≤$50 completes without approval; (b) >$50 suspends with `refund-approval` continuation, no money moved; (c) approve resumes and completes; (d) deny ends with no refund; (e) event log in order: run.started, refund.proposed, refund.awaiting_approval, refund.approved, refund.issued, run.completed; (e') deny records refund.denied, never refund.issued.

## Friction found (severity) → disposition
- F-1 HIGH skill `cognate-api.md` §4 Component shape wrong for 0.5.0 → fix skill reference (D13)
- F-2 HIGH skill mandates `.sea` modelling validated by DomainForge CLI (cargo build from source) → see U10 / D13
- F-3 MED SQLite store doesn't mkdir parent → opportunity OP-3 (SDK), troubleshooting entry
- F-4 MED `Json` exported from runtime-bun, not runtime-api → skill reference note
- F-5 MED agent return typing (`Promise<Json>`) → skill reference note
- F-6 MED domain state in memory not restored on restart → fix in reference example
- F-7 MED event field `eventType` → skill reference note
- F-8 LOW Caller shape → skill reference note
- F-9 LOW deny = resume with `{approved:false}` → skill reference note
- F-10/11 LOW skills CLI output noise; summary path mismatch → troubleshooting
- F-12 LOW skill pins DomainForge 0.19.0, npm 0.21.1 → note only (adapter pins its own binding)
- F-13 LOW `bunx` absent → use `bun x`
- F-14 LOW cli.md says 0.1.x → fix to 0.5.0

## DomainForge CLI install route (U10)
`cargo install domainforge-core --version 0.21.1 --features cli --locked --root <scratch>` → exit 0, real 1m21s, `domainforge --version` = `domainforge 0.21.1` (rustc 1.98.0). Crate requires rust-version 1.89 (`cargo info domainforge-core`). PyPI `domainforge` 0.21.1 ships an sdist only (no wheel CLI found); npm `@godspeedai/domainforge` is a binding (no bin). → Skill domainforge-sea updated to the crates.io route.
