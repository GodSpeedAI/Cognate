# How to run the screenshot capture and pixel diff

The visual-parity machinery. **Read this first:** as of 2026-09-27 the *visual* parity target was
retired by operator decision in favour of an independent design system (`cognate/DESIGN.md`,
`cognate/PRODUCT.md`). The scripts still work and the existing diffs are retained as a historical
record, but new visual divergence is expected and is no longer a defect. See
[../explanation/parity-method.md](../explanation/parity-method.md#the-status-change-and-what-it-means-for-the-harness).

Run this when you need before/after evidence of your own UI change, or when you are checking a change
against the pinned reference's structure — not as a routine gate.

## Prerequisites

- The mock model server running on `127.0.0.1:4010` (the capture scripts do not start it).
- Playwright's Chromium available. `tests/package.json` pins `@playwright/test` 1.63.0.
- The app buildable and startable.
- For the reference side: the pinned checkout at the path in `reference-manifest.json`, with its
  dependencies installed. **The Cognate side needs none of that.**

## Capture the reconstruction

```bash
cd validation/reconstructions/deepseek-harness
bun fixtures/mock-model/server.ts &      # must be listening on 4010

cd tests
bun run capture/cognate.capture.ts desktop 1440 900 /tmp/cg-home-desktop 3182 /tmp/cg-ws-desktop
bun run capture/cognate.capture.ts laptop  1024 768 /tmp/cg-home-laptop  3183 /tmp/cg-ws-laptop
```

Arguments: `<viewport> <width> <height> <homeDir> <port> <workspaceDir>`.

The script starts its own app instance on the given port with the given home and workspace, walks the
28 named checkpoints, disables animations, and writes:

- `cognate/screenshots/<viewport>/NN-name.png`
- `cognate/observations/aria/*.txt` — the accessibility tree per state

The four viewports/directories in use are `desktop` (1440×900), `laptop` (1024×768), plus two older
sets, `dev` and `smoke`, from earlier passes.

## Capture the reference

```bash
cd <the reference clone>          # the path from reference-manifest.json
DSH_HOME=<isolated-dir> pnpm dsh web --no-open --port 3080
# it prints exactly one line containing ?token=…
```

Then, from `tests/`:

```bash
bun run capture/reference.capture.ts desktop 1440 900 <isolated-home> 3080 <workspace> <token>
bun run capture/reference.capture-workdetails.ts …
bun run capture/reference.capture-tools.ts …
```

Three scripts because the reference's work-details and tool checkpoints needed extra steps that did
not fit the main script. They write to `reference/screenshots/` and `reference/observations/aria/`.

## Compare

```bash
bun run visual/compare.ts
```

Writes, for every checkpoint present in **both** sides:

- `diffs/<viewport>/NN-name.png` — a triptych: reference | cognate | pixel diff
- `diffs/summary.md` — a per-checkpoint table with the differing-pixel percentage, both image
  dimensions, and a note

**This is evidence, not a gate.** `compare.ts`'s own header says there is no similarity threshold, and
that a human has to look at the images and decide what is a real regression versus expected content,
timestamp, or antialiasing drift. In the last recorded run, checkpoints from
`04-workspace-selected` onward sat at 1.5–6% differing pixels, with timestamps, static stats, and font
metrics accounting for the rest; the `01`/`03` dialog and `02*` model-settings families sat far higher
because the content is intentionally different (Cognate's own copy, a short provider preset list).

## Before you trust a number

**A percentage without a triptych is not evidence.** Open the image. Specifically:

- **Verify a checkpoint is settled on both sides.** The last run recorded that the reference's
  `16`/`17`/`18` captures never reached a settled state, because the reference's capture wait (15s) is
  shorter than its own internal retry backoff. Those images are structurally comparable but temporally
  unfair, and each carries a "Reference not settled at capture" note.
- **Expect a race on fast-local states.** `08-tool-running`, `13-plan-active`, and
  `14-subagent-active` capture frames that require something to still be in flight. This app's tools
  resolve in under a millisecond, so the capture can land on an already-completed frame. Each of
  those is catalogued in `cognate/DEVIATIONS.md`; none is a missing feature. The genuinely blocking
  state — a pending approval — is stably reproducible.
- **Check the viewport.** A right-hand pane this app does not have makes the reference's image wider,
  which shows up as a large diff that is not a rendering difference at all.

## A portability defect to be aware of

`tests/visual/compare.ts:17` hardcodes its root:

```ts
const ROOT = "/home/sprime01/projects/cognate/validation/reconstructions/deepseek-harness";
```

The capture scripts and drivers resolve paths relative to their own location; this file does not. On a
checkout at a different path, `compare.ts` **silently writes nothing** — the `existsSync` guard skips
both viewports rather than failing. If you get an empty `diffs/` directory, that is why. Fix it by
deriving `ROOT` from `import.meta.dir` the way the other scripts do.

## A cheaper alternative for most changes

For "did my change break the interface", the journey suite is usually the right tool and much faster:

```bash
cd tests && bun run journeys:cognate
```

It asserts behaviour through the interface and needs no reference, no screenshots, and no pixel
arithmetic. Reach for capture/compare when the question is specifically about appearance or about
structural equivalence with the reference.

## Cleanup

```bash
rm -rf /tmp/cg-home-desktop /tmp/cg-home-laptop /tmp/cg-ws-desktop /tmp/cg-ws-laptop
kill %1        # the mock model server
```

The app instances the capture script starts are stopped by the script.

## Related

- [../subsystems/validation-harness.md](../subsystems/validation-harness.md) — the capture and compare machinery
- [../operations/testing.md](../operations/testing.md) — the four suites compared
- [../reference/deviations.md](../reference/deviations.md) — the capture-timing entries
- `reference-behavior-matrix.md` — what each checkpoint is supposed to show
- `cognate/DEVIATIONS.md` — per-checkpoint dispositions
- `cognate/DESIGN.md` — the current visual system, which the diffs no longer target
