# Phase 0 RVF compatibility evidence — 2026-09-24

Scope: `@ruvector/rvf` EXACT `0.3.4` under Bun 1.4.0, per spec §6 (Cognitive
container), §18 (Branching model / RVF identity / Import safety), §31.4 (RVF
failure), and the Phase 0 gate in §37 ("test the selected RuVector Bun
native binding and identify a documented fallback where one exists; do not
assume the RVF package has a Bun WASM fallback").

Fixture location: `compatibility/phase0/rvf/` (isolated package.json, own
`bun.lock`, own `node_modules` — not a workspace member; root
`package.json`/`bun.lock`/`justfile`/ledger were not touched).

## Environment

- Bun 1.4.0 (`34cbb9a40`), Linux x86_64 (WSL2), glibc.
- `@ruvector/rvf@0.3.4` (npm dist-tag `latest`, published ~1 month before
  this run), resolved dependency tree:
  - `@ruvector/rvf-node@0.2.3` (required) → native binary
    `@ruvector/rvf-node-linux-x64-gnu@0.2.2`.
  - `@ruvector/rvf-solver@0.1.8` (declared optional, but unconditionally
    `require`d by `dist/index.js`).
  - `@ruvector/rvf-wasm@0.1.9` (declared optional; not exercised as the
    active backend in this run).

## Commands run

| Command (cwd = `compatibility/phase0/rvf/`) | Exit | Result |
| --- | --- | --- |
| `bun install` | 0 | 5 packages installed; lockfile written; optional deps (`rvf-solver`, `rvf-wasm`, native binary) all resolved without extra flags. |
| `bun test rvf.test.ts` | 0 | 13 pass, 0 fail, 31 `expect()` calls. |

## Per-behaviour ledger

| # | Behaviour | Result | Notes |
| --- | --- | --- | --- |
| 1 | Load under Bun | **PASS** | `RvfDatabase` imports; `resolveBackend('auto'\|'node')` returns a working `NodeBackend`; create/ingest/query round-trips through the native N-API addon under Bun. README lists Bun native support as "Experimental" (confirmed, not contradicted) with no documented Bun→WASM fallback row; only Deno/Browser/Cloudflare are documented WASM targets. |
| 2 | Create store, write vectors + metadata | **PARTIAL — metadata FAILS** | Vector-only `ingestBatch` succeeds. Any entry carrying a non-empty `metadata` object throws `RvfError(code=MetadataNotSupported, 65284)` — metadata ingestion is not implemented in 0.3.4 (source cites upstream issue #704). This is a hard capability gap, kept failing (not skipped) in `rvf.test.ts`. |
| 3 | Export/snapshot to file, import into fresh handle, identical query results | **PARTIAL — path-based fidelity PASSES, byte-snapshot API FAILS** | The node backend persists directly to the file path, so `create()`+`close()`+`open()` on the same path is the de facto export/import path and produces identical query results (asserted). However the SDK's documented in-memory snapshot primitive, `exportBytes()`, throws `RvfError(code=BackendNotFound, 65280)` on the node backend with a message recommending installing a backend that is already active — it is WASM-only in practice, undocumented as such at the type level. |
| 4 | COW branch isolation (both directions) | **PASS** | Writes to a `branch()`ed child are invisible via `parent.query(...)`. Writes made to the parent *after* branching are invisible via `child.query(...)`. Verified both directions in one fixture. |
| 5 | Lineage/parent metadata on branch | **PASS** | `child.parentId()` equals `parent.fileId()`; `child.lineageDepth()` is 1 vs parent's 0. |
| 6 | Integrity check detects corrupted/truncated import | **FAIL** | Opening an empty or near-empty (8-byte) file throws a typed `RvfError(code=ManifestNotFound, isFormatError=true)` — no crash, as required. But truncating a well-formed file to 50% of its length opens successfully with silent data loss (`status()` reports `totalVectors: 0, totalSegments: 0`, no error). Flipping a single byte anywhere in a well-formed file — including byte 0, the format's magic header — opens successfully and serves data as if intact (`status().totalVectors` unchanged; `query()` still returns results). `RvfErrorCode` defines `InvalidMagic`/`InvalidChecksum`/`InvalidSignature`/`TruncatedSegment`, but none of these triggered in any tested corruption beyond outright absence of a manifest. This directly fails spec §18.3's "Import SHALL verify integrity ... before exposing entries" as a default, unconditional guarantee. |
| 7 | Compute-capable segments: existence and default-execution | **PASS (characterization)** | `embedKernel`/`extractKernel`/`embedEbpf`/`extractEbpf` exist and manipulate a `kernel`-typed segment as opaque bytes; the 0.3.4 TypeScript SDK exposes no boot/run/execute call at all, so "no default execution" holds trivially for this package. Separately observed (not a spec violation, but a correctness gap): the extracted kernel image is not byte-clean when a `cmdline` argument is supplied — the cmdline's UTF-8 bytes were appended after the image bytes on read-back. |

## Additional findings (not required behaviours, recorded per "record uncertainty as open questions")

- `@ruvector/rvf-solver` is declared as an `optionalDependency` of
  `@ruvector/rvf`, yet `dist/index.js` performs an unconditional
  `require("@ruvector/rvf-solver")`. Manual removal of the local
  `node_modules/@ruvector/rvf-solver` directory did not break import under
  Bun (it appears to resolve via Bun's own package cache independent of the
  `node_modules` tree); this fallback is not something a production install
  should rely on. Untested under `bun install --production`/Node.
- String vector IDs are not stored inside the `.rvf` file on the node
  backend — a sidecar JSON mapping file next to the `.rvf` path carries the
  string↔label map. A `.rvf` file copied/moved without its sidecar loses
  string ID resolution (observed a fallback to numeric label `"1"`).
- Only `linux-x64-gnu` was exercised (this host). `aarch64-unknown-linux-gnu`,
  macOS, and Windows native binaries are unverified.
- Whether checksum verification exists behind an unexposed flag (e.g. a
  Rust-CLI-only `rvf verify` path) is unknown — no such option exists in the
  TypeScript SDK's `RvfOptions`/`open()` signatures per the installed `.d.ts`.

## Limits of this fixture

- Single-process, single-host (WSL2/x86_64) testing only; no concurrency,
  no crash-mid-write simulation, no multi-platform native binary coverage.
- No SONA/RealityTrace/DomainForge interaction tested (out of scope here).
- "No default execution" for compute-capable segments is characterized only
  for the TypeScript SDK surface, not for the Rust CLI or any hypervisor
  that might consume a self-booting `.rvf` file.

## Decision

Two of seven required behaviours fail against the spec's expectations
(metadata ingestion; integrity verification on corrupted import), and a
third required primitive (byte-snapshot export/import) is unsupported on the
backend Bun actually uses. Per §37's Phase 0 gate, the RVF adapter is
**blocked/unsupported** for the reference profile pending either an upstream
fix or a documented Framework-side compensating control (e.g. wrapping
`.rvf` files in a checksummed/signed envelope before treating any import as
"verified"). See `docs/decisions/ADR-0006-portable-cognition-rvf.md`.
