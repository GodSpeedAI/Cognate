# dist-client — built browser bundle

## Overview
Build output, not source. It contains one minified file, `client-entry.js`, produced
from `../client-entry.tsx` by `bun build --target browser --minify`. The SSR server
serves it as the hydration script; nothing in the directory is hand-edited.

## Interface
- `client-entry.js` — the single minified browser bundle `[compatibility/phase0/ui/dist-client/client-entry.js:client-entry]`

## Invariants
- The file is build output: the recorded producer is `bun build ./client-entry.tsx --outdir ./dist-client --target browser --minify` `[compatibility/phase0/ui/API_NOTES.md:bun build]`.
- The SSR page loads it as a module script at `/client-entry.js`, so its filename is load-bearing for hydration `[compatibility/phase0/ui/playwright-server.tsx:client-entry.js]`.
- Its content matches the hydrating entry: the tail calls `hydrateRoot` on the `root` element with the Astryx `Theme`/`Card`/`Button` tree `[compatibility/phase0/ui/dist-client/client-entry.js:hydrateRoot]`.
- The recorded build is 703,842 bytes from 641 modules; the test only asserts a 100,000–2,000,000 byte band `[compatibility/phase0/ui/ui.test.tsx:Bun.build]`.
- No `package.json` script in this directory builds it; the command is recorded in prose and in the bundle test, which uses `Bun.build` without pinning an `outdir` `[compatibility/phase0/ui/ui.test.tsx:Bun.build]`.

## Side Effects
- None at rest; the file is only read.

## Verification
- Rebuild: `cd compatibility/phase0/ui && bun build ./client-entry.tsx --outdir ./dist-client --target browser --minify`
- Run: `cd compatibility/phase0/ui && bun x playwright test --reporter=list`
