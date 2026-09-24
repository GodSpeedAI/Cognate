# ADR-0006: Portable cognition — RVF adapter

## Status

**Blocked / unsupported** (Phase 0). Not adopted for the reference profile.
Revisit if upstream `@ruvector/rvf` addresses the integrity and metadata
gaps below, or if the Framework adds a compensating verification layer.

## Context

Spec §6 ("Cognitive container") names RVF as a planned optional adapter for
portable cognitive snapshots, lineage, branching, cognitive state
distribution, and optional witness/attestation information, and requires:

> The Bun binding, export/import fidelity, and branch isolation MUST pass
> Phase 0 fixtures before the reference profile claims RVF support. Failure
> leaves the RVF adapter unavailable while the authoritative event system
> remains usable.

Spec §18.3 (Import safety) requires that import "SHALL verify integrity,
supported format/schema, declared lineage, resource/segment limits, and
tenant scope before exposing entries," and that embedded compute-capable
segments "MUST NOT execute by default." Spec §31.4 requires that a failed
snapshot "MUST NOT corrupt the active cognitive index or event store."
Spec §37 (Phase 0) explicitly instructs: "do not assume the RVF package has
a Bun WASM fallback" and to "identify a documented fallback where one
exists."

A Phase 0 fixture was built in `compatibility/phase0/rvf/` (isolated
package.json pinning `@ruvector/rvf` EXACT `0.3.4`, own `bun.lock`,
own `node_modules`) and run under Bun 1.4.0. Full ledger:
`.agents/evidence/phase0-rvf.md`. API surface: `compatibility/phase0/rvf/API_NOTES.md`.

## Decision

Treat the RVF adapter as **blocked/unsupported** for now. It is optional per
spec (§6, §37: "RVF... are optional capabilities and SHALL NOT block a
minimal kernel/event runtime"), so this decision does not block Phase 1+
work on the authoritative event system.

## Evidence summary (7/7 required behaviours characterized)

| # | Behaviour | Result |
| --- | --- | --- |
| 1 | Load under Bun | PASS — native N-API backend works; Bun listed "Experimental" by upstream, confirmed working here on linux-x64-gnu; no documented Bun→WASM fallback exists (only Deno/Browser/Cloudflare are documented WASM targets) |
| 2 | Create store, write vectors + metadata | PARTIAL — vectors PASS, metadata FAILS (`MetadataNotSupported`, upstream issue #704) |
| 3 | Export/import fidelity | PARTIAL — file-path create/open round-trip PASSES; the documented `exportBytes()`/`openBytes()` in-memory snapshot API FAILS on the node backend (`BackendNotFound`) |
| 4 | COW branch isolation (both directions) | PASS |
| 5 | Lineage/parent metadata on branch | PASS |
| 6 | Integrity check on corrupted/truncated import | **FAIL** — only empty/near-empty files are rejected (typed `ManifestNotFound`); 50%-truncation and single-byte corruption (including the magic header) open successfully with silent data loss or silently-served stale data |
| 7 | Compute-capable segments execute on load? | PASS (characterization) — no boot/execute API exists in this SDK version; embed/extract only move opaque bytes (a separate byte-fidelity bug was found: `cmdline` bytes leak into the extracted image) |

The blocking finding is #6: the SDK's default `open()` path does not verify
integrity as spec §18.3 requires. A corrupted or maliciously truncated
`.rvf` file is silently accepted, sometimes serving stale results from
before the corruption. This is the opposite of "fail closed," and combined
with #2 (no metadata) and #3 (no byte-level snapshot on the backend Bun
actually uses), the adapter does not meet the Phase 0 bar.

## Consequences

- The reference profile MUST NOT claim RVF support. No application code
  should depend on `@ruvector/rvf` for portable cognitive snapshots,
  lineage export, or branch isolation until this ADR is revised.
- The authoritative event store and SQLite-backed cognitive index remain
  the source of truth (spec §3.5); nothing here changes that.
- If RVF is revisited: any adapter built on top of it MUST add an
  independent integrity envelope (e.g. a signed/checksummed wrapper checked
  before `RvfDatabase.open()` is trusted) rather than relying on the
  package's own format checks, since those checks do not fire on ordinary
  byte corruption.
- Per-vector metadata cannot be used until upstream issue #704 lands;
  any lineage/witness metadata the Framework wants recorded on a snapshot
  (spec §18.2) would need a side-channel (e.g. a manifest segment written
  by the Framework itself, unverified by this ADR).
- Re-run `compatibility/phase0/rvf/rvf.test.ts` against any future
  `@ruvector/rvf` version pin before revisiting this status; do not assume
  a patch release fixes the integrity gap without re-testing behaviour #6
  specifically (byte-flip and partial-truncation cases, not just
  empty-file rejection).

## Open questions

- Does `bun install --production` (optional deps skipped) break the
  unconditional `@ruvector/rvf-solver` require that `dist/index.js`
  performs? Bun's cache-based resolution masked this in ad hoc local
  testing; not verified against a clean/production install or under Node.
- Is there a Rust-CLI-only (`rvf verify`) integrity check outside the
  TypeScript SDK's surface that a Framework adapter could shell out to
  instead of trusting `RvfDatabase.open()`?
- Behavior on macOS/Windows/aarch64 native binaries is unverified (only
  linux-x64-gnu was exercised for this ADR).
