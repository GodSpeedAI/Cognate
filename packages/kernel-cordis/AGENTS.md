# kernel-cordis

Only package allowed to `import "cordis"`. Never let a Cordis type escape an exported signature.
The conformance suites in `@godspeedai/cognate-kernel-api/conformance` are the spec — do not edit them; if a
suite seems wrong, report it instead of changing it. Run
`bun test ./packages/kernel-cordis` (expect 36 passing, 3x for flakiness) and
`./node_modules/.bin/tsc -p tsconfig.json` before considering a change done.
