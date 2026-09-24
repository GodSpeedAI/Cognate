# M6 semantic and evidence adapters — observed gates

Environment: Bun 1.4.0, @godspeedai/domainforge 0.16.0, sxr @ f7fb1c3 (local build). Commands run by the orchestrator from the repository root.

| Date | Command | Result | Scope |
| --- | --- | --- | --- |
| 2026-09-24 | `bun test ./packages/domainforge` ×3 | 12 pass, 0 fail each run | CG-SEM-001: projection provenance (uri + sha256 digest, pinned binding), mapping table for all 13 kinds with Policy never a capability, deterministic serialization, manifest-only capability binding. CG-SEM-002: derived stable Flow identity (DEBT-001 mitigation), rename/namespace change = new identity, typed unresolved results by pinned digest, explicit reviewed aliases that do not change resolution, typed syntax/unresolved errors classified by message (DEBT-002). |
| 2026-09-24 | `bun test ./packages/realitytrace` ×3 (real `sxr` @ f7fb1c3) | 15 pass, 0 fail each run | CG-RT-001: observation intents with stable ids and correlation fields; receipts persisted; strict gate opens only on accepted/duplicate; target outage leaves events committed and retries with the same id; exhausted retries listed for reconciliation; no evidence/settlement vocabulary. CG-RT-002: live CLI sequence `repo enroll → question declare → threshold declare → run begin (snapshot:genesis) → per observation: plan create --verifier cognate.<obsId> → ingest --stdin-format json`; redelivery → `already_committed` = duplicate at the same ledger position. Correlation ids travel only inside ingested bytes SXR retains but does not interpret (DEBT-009). Isolation works via `HOME` (the binary ignores `SXR_HOME`). |

# M9 providers and profiles

| Date | Command | Result | Scope |
| --- | --- | --- | --- |
| 2026-09-24 | `bun test ./packages/provider-openai-compatible ./packages/provider-local ./packages/profile` ×3 | 10 pass, 0 fail each run | CG-PRV-001: OpenAI-compatible provider against a local Bun stub (auth header, tools, json_schema, tool-call parsing, SSE streaming, typed errors without the key, timeout), capability attributes never contain credentials; deterministic local provider. CG-PRF-001: defineProfile validation/freezing, ordered resolution, unknown/unsupported reported (never dropped), kernel-api runtime surface pinned. |
| 2026-09-24 | `bun test ./tests/integration/semantic-to-observation.test.ts ./packages/runtime-bun ./tests/integration/causality.test.ts` ×3 | 30 pass, 0 fail each run | CG-RT-003: DomainForge Flow → bound capability SemanticRef → run invocation event (semanticRef pinned to source digest) → observation intent committed atomically via the runtime `outboxFor` hook → delivered with correlation fields → `inspect` lists the observation id. Test hook first read the capability from the payload (wrong); the runtime records it in metadata. |
