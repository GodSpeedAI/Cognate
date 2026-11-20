# Current status

**Status revision:** 79

**Summary:** Add an assigned-start RPC that verifies the authenticated delegate and exact SEA link before durable Cognate admission.

**Verified:**

- 98 focused Connect and assignment tests passed, including JSON and binary Socket conformance, the older-server downgrade regression, verified link persistence, and the expiry boundary.
- Protobuf regeneration matched the checked-in output for both changed files. Type checking and all 81 requirement source identity checks passed.
- Pre-push: PR branch tree byte-identical across the rewrite; 0 residual path/username commits across all refs in the apply clone; main subject diff exactly the one became-empty commit
- Post-push fresh clone: 0 residual /home/<user>/ and 0 residual username across all reachable history; heads=5 and tags=1189 matching pre-rewrite; Gitleaks 12 findings all the known synthetic fixture files
- Ruleset: original JSON snapshotted to the audit workspace; after the bypass window the live ruleset diffs identical to the snapshot
- PR #74 after rewrite: state OPEN, mergeable MERGEABLE, head 1b50702; CI running on rewritten main with package already passing
- Locally: refs reset to rewritten history; symlink resolves to the repo-root node_modules; substrate check passes (81/81) and a 54-test harness suite passes

**Limits:**

- The local full gate requires separately installed Phase 0 package trees and the pinned RealityTrace 0.4.0 CLI. The assigned-start path has no production authority provider.
- The assigned-start expiry check excludes the exact expiration instant. The existing resume contract permits equality.
- Downstream clones and the second local worktree still hold pre-rewrite history and must re-clone or fetch+reset
- GitHub's cached PR refs and any forks retain pre-rewrite objects outside this repository's control
- The pre-rewrite objects remain recoverable locally (original store un-gc'd; audit workspace clones); purging them is an operator decision
- The Protect Main bypass window existed for under a minute and the restore was diff-verified, but the window itself is recorded here rather than hidden

**Next:** Run the hosted full gate. Configure production admission only after trusted assignment issuance and a SEA reservation connect the current link decision to durable run admission.
