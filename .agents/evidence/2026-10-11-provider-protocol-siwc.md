# Provider protocol selection, wire conformance, and SIWC — 2026-10-11

Branch `feat/provider-and-hook-interoperability`, commits `4266894` and `24d79ca` (on top of `95a4750`).

## What was verified (all commands run locally, this date)

- `just typecheck` — clean (whole workspace, including the new `packages/provider-openai-oauth`).
- `just verify` — **81/81 gates pass** (substrate check 81 requirements, README gate 46 published packages, dependency-direction gate re-run after declaring `@godspeedai/cognate-events` in provider-typesafe).
- Package conformance suites: `bun test packages/provider-wire packages/provider-openai-responses packages/provider-anthropic-compatible packages/provider-auth packages/provider-typesafe packages/provider-openai-oauth` — **48 pass / 0 fail** (wire SSE framing/cancellation 9, Responses 11, Anthropic 10, auth 6, typesafe 12 incl. the new ranker suite).
- `bun test packages/agent-discovery packages/hook-interoperability` — **14 pass / 0 fail** (MCP inspection fixtures, Claude plugin-cache hooks, allowlisted version probes, effective-hook layering).
- DeepSeek harness: `bun test test/J-CFG-model-provider.test.ts test/providerRegistry.test.ts test/J-SET-settings.test.ts test/J-B-basic-session.test.ts test/J-AIM-aimock.test.ts` — **13 pass / 0 fail**, including the two new J-CFG protocol-workflow journeys and the hot-swap rollback unit.

## What changed, in one paragraph each

**Settings → Models protocol workflow.** The wizard previously submitted `openai-compatible`
regardless of the selected API protocol (create, edit-prefill, and row re-key all hardcoded it).
The display-name select now maps to wire values (`openai-completions`, `openai-responses`,
`anthropic-messages`), Edit prefills the provider's actual protocol, re-keying preserves it,
presets carry protocol defaults (OpenAI → Responses, Anthropic → Messages, gateways → Chat
Completions), the configured card shows the protocol, and an unsupported protocol is rejected by
`model.configure` before any event is recorded (J-CFG asserts zero `model.configured` events on
rejection). `ProviderRegistry.swap` now disposes a replacement that fails before activation, so a
bad reconfigure cannot take `model.generate` down (unit-tested with the real streaming component;
the old provider stays mounted and invocable).

**Wire/provider conformance (Level 2).** `provider-wire` gained its first suite: SSE frames
parsed across single-byte chunk boundaries, CRLF, multi-line data, UTF-8 codepoint splits;
caller abort during a stream maps to `cancelled` (not retryable `unavailable`); HTTP status
classification never echoes upstream bodies. The Responses adapter: tool-call round trip
(function_call/function_call_output), settlement only on `status:"completed"`/`response.completed`,
`response.failed|error|response.incomplete` and the `[DONE]` sentinel never settle, 401/429
mapping, abort, malformed JSON. The Anthropic adapter: `input_json_delta` tool streams across
byte boundaries with typed start/args/end deltas, `message_stop` required for settlement,
`refusal → content_filter` (honest stop-reason mapping), structured-output refusal matches its
declared `structured_output:false` feature flag, orphan tool results rejected pre-payable.

**SIWC (Sign in with ChatGPT).** New package `@godspeedai/cognate-provider-openai-oauth`,
implemented against the official docs fetched this date (`developers.openai.com/siwc`,
`.../token-sharing-open-source/{overview,sign-in,token-reference,profiles-and-sessions,errors-and-recovery,preview-limitations}`):
dynamic client registration (`dynamic_agent_client` → issued id retained per account; a differing
id on reauth is rejected), stable per-host `ext_agent_host_id` (urn:uuid, persisted 0600), PKCE
S256 + fresh state/nonce per attempt, loopback listener on `127.0.0.1` with the fixed
`/auth/callback` path (only the port varies), `access_denied` handled without exchange, token
exchange and refresh as form-encoded public-client grants, ID-token validation against the
discovery JWKS (RS256/ES256 only; iss/aud/exp/nbf/nonce, `sub` as identity; reauth identity must
match the selected account before overwrite), atomic 0600 per-client credential records with
rotation replacing the whole token set under a single-flight lock, terminal refresh codes
(`invalid_grant`, `refresh_token_reused`, …) clearing tokens while keeping the registration,
revocation on sign-out (empty 200 = confirmed; unconfirmed revocation is reported, never silent),
and a secret-free, separately-stored automation-consent record enforced by
`assertSubscriptionUse` before any payable request. The plan-backed Responses provider enforces
the SIWC preview constraints on every request: `store:false`, `stream:true` (`generate()` is
served through the stream), system text moved to `instructions` (additive `ModelRequest.instructions`
field), `temperature`/`max_output_tokens` stripped. The 12-test suite runs a deterministic fake
issuer with real RSA-2048-signed tokens (state mismatch, nonce mismatch, foreign-key signature,
wrong audience, expiry, missing plan scope, rotation + concurrency, replay-is-terminal, revocation,
automation refusal, preview-constraint body assertions, token-leak checks). No paid API and no
live OpenAI endpoint is involved.

**Discovery and hooks.** agent-discovery: passive MCP definition inspection per harness (Claude
`.claude.json`/`.mcp.json`/plugin caches, Codex `config.toml` via a minimal TOML reader, Gemini
settings, OpenCode config, Cline global settings) recorded as inert evidence; Claude plugin-cache
hook discovery carrying `pluginId`/plugin scope and never trusted-by-default; a managed-settings
hook layer; and `probeVersion` — the only executable probe, allowlisted per harness to exactly
`--version`, no shell, failure recorded as evidence. hook-interoperability:
`resolveEffectiveHooks(layers)` merges scoped inventories additively (union, dedupe by id,
highest layer first) and reports `partial` while any source remains uninspected — unobservable
runtime registrations are never reported as absent.

**TypeSafe/System One as a Ranker.** `typeSafeRanker` (tournament: repeated small-group
eliminations, then one final judgment over the shortlist) and `typeSafeDirectRanker`
(per-candidate fit scores) bridge `JudgmentProvider` into the selector's existing guarded
`Ranker` boundary: out-of-set, abstaining, or malformed answers produce no ranking; eliminated
candidates can never be reintroduced; judge failure falls back to deterministic selection
(proven end-to-end through `createSelector`). Empty and single-candidate sets never call the judge.

## Honest limits

- **No live SIWC sign-in has been performed.** Everything above is Level-2 evidence against a
  fake issuer. The remaining live gate needs an operator: a real ChatGPT account, the system
  browser, and OpenAI's current eligibility/terms for this distribution context. The compliant
  boundary is implemented (plan scope required, automation gated, preview constraints enforced),
  but **plan-backed inference against the production endpoint is unproven**.
- The harness Settings → Models wizard is covered by server-level journeys + unit tests; a
  browser-level (Playwright) test driving the protocol dropdown is not written yet.
- Effective hook state is configuration evidence only: runtime-observed hook activation
  (Claude plugin runtime registration, OpenCode/Pi dynamic hooks) remains explicitly unresolved.
- MCP inspection is static evidence; no server is ever dialed, so reachability/auth is unverified.
- Anthropic `pause_turn` maps to `finishReason:"error"` (we cannot honor its continuation
  semantics); the Responses adapter settles streaming tool calls at `response.completed` rather
  than incrementally.
