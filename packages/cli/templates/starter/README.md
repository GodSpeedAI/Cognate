# templates/starter

Source for `cognate create`. `common/` is copied into every generated app;
`copilot/` or `harness/` is copied on top depending on `--profile`.

Layout copied into the app:

```text
my-app/
├── domain/example.sea
├── src/{agents,capabilities,components,projections,ui}/
├── test/app.test.ts
├── cognate.config.ts
└── package.json
```

`cognate create` then pins the `@godspeedai/*` packages the profile needs to the CLI's own
version, resolved from npm. With `--source <checkout>` it instead vendors them from that checkout
(`bun pm pack` into `.cognate/vendor/`, pinned with `file:` dependencies and `overrides`).

The `.gitignore` is stored as `_gitignore` here because npm and bun drop `.gitignore` from tarballs.

Keep this template small: it is the first thing a user reads and edits.
