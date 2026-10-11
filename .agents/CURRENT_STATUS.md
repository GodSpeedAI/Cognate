# Current status

**Status revision:** 48

**Stage:** Provider protocols end to end, SIWC OAuth adapter, discovery/hook depth, and the guarded TypeSafe ranker (PR #32 branch)

**Summary:** Settings -> Models now submits the actually selected wire protocol (create, edit, re-key, presets, hot-swap rollback with the old provider kept usable), proven by two new J-CFG journeys plus a ProviderRegistry rollback unit. provider-wire gained byte-boundary SSE/cancellation conformance; the Responses and Anthropic adapters settle only on response.completed / message_stop, classify failures without echoing upstream text, and map stop reasons honestly (refusal -> content_filter). New packages/provider-openai-oauth implements SIWC per the official docs fetched 2026-10-11: dynamic client registration, PKCE S256, loopback callback on 127.0.0.1 with state/nonce validation, RS256/ES256 ID-token validation against discovery JWKS, atomic 0600 credential records with single-flight rotating refresh, terminal-refresh recovery, revocation, secret-free automation consent, and a plan-backed Responses provider enforcing the SIWC preview constraints (store:false, stream:true, instructions instead of system items) — 12 fake-issuer conformance tests, no live sign-in yet. agent-discovery inspects MCP definitions per harness and Claude plugin-cache hooks inertly and gains an allowlisted --version probe; hook-interoperability resolves effective hook configuration across scoped layers without ever reporting uninspected runtime hooks as absent. TypeSafe/System One bridges into the selector's Ranker boundary via a guarded tournament shortlist that can order but never widen the eligible set.

**Verified:**
- just verify: 81/81 gates (dependency gate re-run after declaring cognate-events in provider-typesafe); just typecheck clean
- provider suites: wire 9 + Responses 11 + Anthropic 10 + auth 6 + typesafe 12 = 48/48
- packages/provider-openai-oauth: 12/12 fake-issuer conformance (state/nonce mismatch, foreign signature, wrong audience, expiry, missing plan scope, rotation + concurrency, replay terminal, revocation, automation gate, preview constraints, leak checks)
- packages/agent-discovery + packages/hook-interoperability: 14/14 (MCP fixtures, plugin hooks, version probes, effective layering)
- harness: J-CFG 3/3 (protocol persist/reload/re-key, unsupported-protocol rejection), providerRegistry 3/3, J-SET/J-B/J-AIM green
- CI verify.yml conformance step extended to provider-wire + provider-openai-oauth and the harness registry unit

**Limits:**
- SIWC is Level-2 evidence only: no live ChatGPT sign-in; plan-backed production inference unproven pending an operator-driven, eligibility-gated live sign-in
- Settings → Models wizard lacks a browser-level (Playwright) protocol-selection test; server journeys + units cover it
- Effective hook state remains configuration evidence; runtime-observed activation (Claude plugin runtime, OpenCode/Pi dynamic) explicitly unresolved
- MCP inspection is static evidence only; servers are never dialed, so reachability/auth is unverified
- Anthropic `pause_turn` maps to finishReason `error`; streaming tool calls settle at `response.completed`, not incrementally

**Next:** Optional: browser-level wizard test; live SIWC operator gate; then PR #32 review/merge. Do not publish or merge without operator authorization.

**Evidence:**
- .agents/evidence/2026-10-11-provider-protocol-siwc.md
- .agents/evidence/2026-10-09-postgres-migration.md (prior stage, revision 47)
