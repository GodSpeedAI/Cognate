# `@ruvector/rvf` 0.3.4 — API notes (Bun 1.4.0)

Verified against installed `node_modules/@ruvector/rvf/dist/*.d.ts` and manual
Bun execution in this directory. Do not `bun install`/`bun test` from the
repo root for this package — see `package.json` here (isolated, exact pin).

## Package shape

- `@ruvector/rvf@0.3.4` — pure TS wrapper, CJS (`dist/index.js`, no `"type"` field).
  - dependency (required): `@ruvector/rvf-node@^0.2.3` (native N-API addon).
  - optionalDependencies: `@ruvector/rvf-wasm@^0.1.7`, `@ruvector/rvf-solver@^0.1.0`.
- `dist/index.js` does an **unconditional** `require("@ruvector/rvf-solver")`
  even though it is only an optional dependency. Under `bun install` (default,
  no `--production`/`--omit=optional`), it installs fine (resolved 0.1.8 here).
  An environment that skips optional deps would hit `MODULE_NOT_FOUND` at
  import time under Node; Bun's resolver did not reproduce that failure even
  after the local `node_modules/@ruvector/rvf-solver` directory was removed
  (it appears to resolve packages via its own install cache independent of
  `node_modules`) — do not rely on this; treat the coupling as fragile.
- `@ruvector/rvf-node@0.2.3` ships prebuilt platform binaries as separate
  optional packages (`@ruvector/rvf-node-linux-x64-gnu@0.2.2`, darwin/win32
  variants). `bun install` resolved and installed the matching native binary
  for this host (linux-x64-gnu) automatically.

## Bun compatibility (spec §6, §37/Phase 0)

The npm README's compatibility table lists **Bun: Native (N-API), Experimental**
— WASM is only listed for Deno/Browser/Cloudflare Workers, not as a
documented Bun fallback. `resolveBackend('auto')` and `resolveBackend('node')`
both returned a working `NodeBackend` under Bun 1.4.0 in this environment;
`create`/`ingestBatch`/`query`/`close` all succeeded through the native addon.
No Bun-specific crash or shim was needed. This is empirical evidence for one
platform (linux x64 glibc, WSL2); it is not a general compatibility claim.

## Imports

```ts
import {
  RvfDatabase,      // main class; static create/open/openReadonly/openBytes/fromBackend
  RvfError, RvfErrorCode,
  NodeBackend, WasmBackend, resolveBackend, // type BackendType = 'node'|'wasm'|'auto'
} from "@ruvector/rvf";
```

`RvfSolver` is also re-exported from `@ruvector/rvf` (proxied from
`@ruvector/rvf-solver`) — unrelated to the store; not exercised here.

## Core API used

```ts
RvfDatabase.create(path: string, options: RvfOptions, backend?: BackendType): Promise<RvfDatabase>
RvfDatabase.open(path: string, backend?: BackendType): Promise<RvfDatabase>
RvfDatabase.openReadonly(path, backend?): Promise<RvfDatabase>
RvfDatabase.openBytes(bytes: Uint8Array, backend?): Promise<RvfDatabase>  // WASM-only in practice
db.ingestBatch(entries: {id, vector, metadata?}[]): Promise<{accepted, rejected, epoch}>
db.query(vector: Float32Array|number[], k: number, options?): Promise<{id, distance}[]>
db.status(): Promise<{totalVectors, totalSegments, fileSizeBytes, epoch, profileId, compactionState, deadSpaceRatio, readOnly}>
db.fileId() / db.parentId(): Promise<string>       // hex UUID; parentId all-zero for root
db.lineageDepth(): Promise<number>
db.derive(childPath, options?): Promise<RvfDatabase>  // COW derive, new options allowed
db.branch(childPath): Promise<RvfDatabase>            // COW branch, inherits parent options
db.freeze(): Promise<number>                          // freeze generation before branching
db.embedKernel(arch, kernelType, flags, image: Uint8Array, apiPort, cmdline?): Promise<number> // segment id
db.extractKernel(): Promise<{header, image} | null>
db.embedEbpf(programType, attachType, maxDimension, bytecode, btf?): Promise<number>
db.extractEbpf(): Promise<RvfEbpfData | null>
db.segments(): Promise<{id, offset, payloadLength, segType}[]>
db.exportBytes(): Promise<Uint8Array>   // throws BackendNotFound on NodeBackend
db.close(): Promise<void>
```

`RvfOptions` requires `dimensions: number`.

## Verified snippets

```ts
// COW branch: isolation confirmed both directions.
const parent = await RvfDatabase.create(path, { dimensions: 3 });
await parent.ingestBatch([{ id: "p1", vector: new Float32Array([1, 0, 0]) }]);
const child = await parent.branch(childPath);
await child.ingestBatch([{ id: "c1", vector: new Float32Array([0, 1, 0]) }]);
// parent.query(...) never returns "c1"; child.query(...) returns "c1"+"p1".
```

## File format facts (from README + `RvfErrorCode`)

- Segmented binary format; unknown segments preserved by tools. Relevant
  segment types seen: `manifest`, `vec`, `witness`, `kernel`.
- Error codes exist for `InvalidMagic (256)`, `InvalidVersion (257)`,
  `InvalidChecksum (258)`, `InvalidSignature (259)`, `TruncatedSegment (260)`,
  `InvalidManifest (261)`, `ManifestNotFound (262)` — but **only
  `ManifestNotFound` was observed to trigger** in manual corruption testing
  (empty file / truncated below the first manifest scan point). Truncating a
  well-formed file to 50% of its length, or flipping a single byte anywhere
  (including byte 0, the magic header), opened successfully with silent data
  loss (`status().totalVectors === 0`) or silently-served stale data — no
  checksum verification occurs on the default `open()` path. See `rvf.test.ts`
  section (6) for exact repro.
- Per-vector `metadata` is **not implemented**: `ingestBatch` throws
  `RvfErrorCode.MetadataNotSupported (65284)` for any entry with a non-empty
  `metadata` object (source comment cites upstream issue #704).
- String IDs are not stored inside the `.rvf` file itself on the node
  backend: `NodeBackend` persists a string↔numeric-label sidecar JSON file
  next to the `.rvf` path. Copying only the `.rvf` bytes elsewhere loses the
  string ID mapping (observed: an id fell back to a numeric label `"1"`
  after the sidecar was not copied alongside a corrupted-file test file).
- `embedKernel`/`extractKernel` round-trip is not byte-clean when `cmdline`
  is supplied: the extracted `image` had the cmdline's UTF-8 bytes appended
  after the original image bytes (observed with `cmdline: "quiet"`).
- No boot/execute call exists anywhere in this SDK version for kernel/eBPF
  segments — `embedKernel`/`extractKernel`/`embedEbpf`/`extractEbpf` only
  move bytes. Whether the native Rust CLI or an external hypervisor executes
  such a segment is out of scope for this package and untested here.

## Open questions

- Does a stricter Bun install mode (`bun install --production`) actually
  break on the unconditional `@ruvector/rvf-solver` require, or does Bun's
  cache-based resolution mask it there too? Untested.
- Is checksum verification available behind an explicit flag/mode not
  exposed by the TS SDK (e.g. only in the Rust CLI's `rvf verify`)? Untested
  here — no such flag exists in `RvfOptions`/`open()` per the `.d.ts`.
- Behavior on `aarch64-unknown-linux-gnu`/macOS/Windows native binaries is
  unverified; only linux-x64-gnu was exercised.
