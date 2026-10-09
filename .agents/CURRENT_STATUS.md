# Current status

**Status revision:** 42

**Stage:** cognate-* migration closed: all 33 superseded packages deprecated, registry state clean

**Summary:** The last open registry mutation is done: @godspeedai/realitytrace@0.1.0 is deprecated with the migration message after the operator refreshed the machine's npm auth (the shared token had been invalidated by npm's 2026 token-policy enforcement, which is also why the first attempt returned E404). npm stage list is clean (no pending stages). All 33 superseded @godspeedai/<module> packages now carry the migration message; the 36 @godspeedai/cognate-* packages are live (35 at 0.1.1 via the automated OIDC round, umbrella at 0.1.0 until the next lockstep release).

**Verified:**
- npm view deprecated confirms the migration message on all 33 superseded packages, including @godspeedai/realitytrace@0.1.0
- npm stage list: no staged packages pending
- Fresh npm auth on the shared machine (npm whoami: sprime01); CI unaffected throughout (OIDC, no user tokens)
- bun run check passes with revision 42 and a regenerated human view

**Limits:**
- Umbrella @godspeedai/cognate remains at 0.1.0 until the next release pulls it into lockstep (linked-versions)
- The design spec still describes the old package naming; a spec-revision note remains a documentation follow-up
- npm user tokens on this machine expire under the 2026 policy — manual npm operations need a fresh npm login; automated releases are unaffected (OIDC)

**Next:** Optional: exercise bunx @godspeedai/cognate-cli create from a clean machine to close DEBT-016's exit criterion; propose the spec revision for the cognate-* naming

**Evidence:**
- .agents/evidence/2026-10-08-release-0.1.0-prep.md
- docs/package-naming.md
