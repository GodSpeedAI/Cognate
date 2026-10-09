# ui-astryx — agent guide
Astryx components + `@godspeedai/cognate-react` hooks only; no `@godspeedai/cognate-client` internals beyond types. `screen` from `@testing-library/react` binds to `document` at import time under Bun — use render-bound queries (`view.getByRole(...)`), not the global `screen`. Test bundling entries must live inside the project tree, not `os.tmpdir()`.
