# Cognate Provider Auth

Independent, per-request credential leases for HTTP model/decision providers. Credential contents must remain out of Cognate events, projections, logs and capability contracts. `assertSubscriptionUse` enforces an additional host policy gate for ChatGPT plan-backed requests: authenticated interactive use is separate from expressly permitted automation.

**Not an OAuth sign-in implementation.** Secure SIWC dynamic client registration, PKCE, OIDC validation, encrypted-at-rest/token-refresh storage and account UX remain a separate gated workstream. An existing correctly verified credential manager can implement `CredentialSource`; never borrow Codex or OpenCode token files or client IDs. Documentation: https://developers.openai.com/siwc/token-sharing-open-source.
