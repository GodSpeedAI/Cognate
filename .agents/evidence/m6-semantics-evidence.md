# M6 semantic and evidence adapters — observed gates

Environment: Bun 1.4.0, @godspeedai/domainforge 0.16.0, sxr @ f7fb1c3 (local build). Commands run by the orchestrator from the repository root.

| Date | Command | Result | Scope |
| --- | --- | --- | --- |
| 2026-09-24 | `bun test ./packages/domainforge` ×3 | 12 pass, 0 fail each run | CG-SEM-001: projection provenance (uri + sha256 digest, pinned binding), mapping table for all 13 kinds with Policy never a capability, deterministic serialization, manifest-only capability binding. CG-SEM-002: derived stable Flow identity (DEBT-001 mitigation), rename/namespace change = new identity, typed unresolved results by pinned digest, explicit reviewed aliases that do not change resolution, typed syntax/unresolved errors classified by message (DEBT-002). |
