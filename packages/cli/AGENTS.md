# AGENTS.md — @godspeedai/cli

- Packages are not published (DEBT-016): `create` must keep vendoring via
  `bun pm pack` + `overrides`, never assume a registry install works.
- `--with` names are reported as `unsupported: <name> (<reason>)` and must
  never reach the generated app's imports or `package.json`.
- Keep `templates/starter` small; it is a template users read and edit.
