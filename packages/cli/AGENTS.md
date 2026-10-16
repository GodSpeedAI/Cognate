# AGENTS.md — @godspeedai/cognate-cli

- Without `--source`, `create` pins every `@godspeedai/*` dependency to the CLI's own version
  (the packages are published in lockstep); `--source` keeps vendoring via `bun pm pack` +
  `overrides` for unreleased checkouts.
- Starter templates live in `templates/starter` inside this package and ship in the tarball
  (`files`). Resolve them from the package directory; never read them from a checkout.
- Store the template's `.gitignore` as `_gitignore`: npm and bun drop `.gitignore` from tarballs.
- `--with` names are reported as `unsupported: <name> (<reason>)` and must
  never reach the generated app's imports or `package.json`.
- Keep `templates/starter` small; it is a template users read and edit.
