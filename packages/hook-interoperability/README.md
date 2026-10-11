# @godspeedai/cognate-hook-interoperability

Canonical, evidence-preserving hook IR and a **governed** dispatch interface for agent harnesses. Native hook semantics are never silently assumed equivalent. Claude, Codex, Gemini and Cline declarative settings can be normalized; OpenCode and Pi plugin/runtime hooks require runtime/plugin inspection and are reported as unknown until observed.

`resolveEffectiveHooks(layers)` merges scoped inventories (highest precedence first) into one effective view. Declarative hook scopes are additive, so merging is a union deduplicated by hook id; layers with unresolved sources keep the merged inventory explicitly `partial` — runtime registrations that could not be observed are never reported as absent.

A parsed hook is not an authorized hook. Execution is impossible without both (1) explicit fingerprint-level authorization and (2) a caller-supplied executor. There is no builtin command, network, or shell executor. Approximate event mappings cannot run without a separately validated semantic adapter. This protects project-controlled settings from becoming arbitrary code execution.

Conformance: `bun test packages/hook-interoperability/test`. This package provides the interoperability core, not proof of end-to-end hook parity in every CLI.

License: Apache-2.0.
