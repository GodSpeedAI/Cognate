# Package README standard (published npm packages)

Every README under `packages/*` and `profiles/*` is the landing page a developer sees on
npmjs.com with no other context about Cognate. It must stand alone: accurate, runnable, and
free of internal engineering history. `scripts/check-readmes.mjs` enforces the mechanical
rules; humans enforce the rest in review.

## Structure (guidelines, not mandatory headings)

1. H1 title — exactly the package's npm name (e.g. `# @godspeedai/cognate-store-sqlite`), then
   a one-sentence value proposition.
2. What it does and when to install *this* package instead of a sibling.
3. Installation with the exact published name (`bun add @godspeedai/cognate-<module>`).
4. Runtime requirements — Bun (`>= 1.4.0`) and required companion packages; never claim Node,
   browser, or Deno support.
5. A minimal, complete, working quick start — real exports, real option names, real error
   types. Prefer one honest example over prose.
6. Common usage patterns and public API surface (only what is actually exported).
7. Limitations, persistence behavior, and security constraints in plain language.
8. Related packages (their exact npm names) and where the umbrella `@godspeedai/cognate` fits.
9. License: Apache-2.0.

Adapt depth to the package: a contract package needs a page; the runtime, CLI, client, and
protocol adapters need working examples.

## Hard rules (checked mechanically by `scripts/check-readmes.mjs`)

- H1 must equal the npm package name.
- No internal identifiers: `DEBT-\d+`, `CG-[A-Z]{3}-\d{3}`, `spec §`.
- No stale publication claims: "not published", "not yet on npm", "unreleased", "private
  package".
- Relative Markdown links must resolve to files that ship in the tarball (LICENSE is fine);
  repository-only docs links do not work on npm.
- Every `@godspeedai/*` package name mentioned in an install/`bunx` command must exist.

## API-example verification

Examples must be derived from the package's actual exports and tests — never invented. The
registry clean-room in `.github/workflows/package.yml` executes representative examples
(umbrella, client/runtime, persistence, CLI) against the published packages; when you change a
quick start, keep it consistent with what that smoke actually runs, or extend the smoke.
