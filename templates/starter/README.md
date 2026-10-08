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

`cognate create` then vendors the `@godspeedai/*` packages the profile needs
(`bun pm pack` from `--source` into `.cognate/vendor/`) and pins them in
`package.json` via `file:` dependencies and `overrides` (DEBT-016).

Keep this template small: it is the first thing a user reads and edits.
