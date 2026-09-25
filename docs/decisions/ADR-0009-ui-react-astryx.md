# ADR-0009: React 19 + Astryx as the reference UI, with pre-compiled StyleX

<!-- Index: [decisions/README.md](README.md). The Status line below is historical; the current implementation status is in [requirements/ledger.yaml](../../requirements/ledger.yaml).
-->
## Status

Accepted (Phase 0 characterization complete; no `packages/react` /
`packages/ui-astryx` code built yet).

## Context

Spec §3.8 ("UI implementation is replaceable"): "React and Astryx are the
reference UI implementation. Framework concepts MUST remain usable
without React or Astryx. Astryx is currently a React 19+ design system
and remains beta, so its APIs MUST NOT leak into the headless client
contract." Spec §25 defines the three-layer split (`packages/client` →
`packages/react` → `packages/ui-astryx`), and §40.F requires Astryx to be
replaceable without breaking the headless/React layers.

Before pinning Astryx as the reference design system, we needed to prove
it actually renders under Bun's SSR path and bundles for the browser,
since Astryx is explicitly called out as beta and its Bun compatibility
was unverified (`.agents/plans/build-v0.md` Phase 0 discipline).

## Decision

Adopt `react@19.3.0`, `react-dom@19.3.0`, `@astryxdesign/core@0.6.3`, and
`@astryxdesign/theme-neutral@0.6.3` as the pinned reference UI stack,
based on the passing fixture at `compatibility/phase0/ui/` (evidence:
`.agents/evidence/phase0-ui.md`).

Key findings that inform `packages/ui-astryx` design:

1. **No StyleX compiler dependency at build or runtime.** Astryx ships
   pre-compiled: component modules already contain static atomic class
   names, and the matching CSS ships as static files
   (`@astryxdesign/core/dist/astryx.css`,
   `@astryxdesign/theme-neutral/dist/theme.css`). `packages/ui-astryx`
   does not need to add a StyleX babel/swc transform to its own build
   pipeline to *consume* Astryx components — only to *author new*
   StyleX-styled components would that become necessary (out of scope
   for Phase 0; tracked as an open question).
2. **`@stylexjs/stylex` is a required peer regardless.** Some Astryx
   internals import it directly at module-load time even when the
   consuming app never touches StyleX APIs. It must be a declared
   dependency, not assumed transitive.
3. **Theme setup is mandatory, not optional.** `<Theme theme={...}>` from
   `@astryxdesign/core`, given a theme object from a theme package (here
   `neutralTheme`), is required for correct `data-astryx-theme` and CSS
   variable scoping. `packages/ui-astryx` should wrap its own
   `ThemeProvider`/dark-mode surface (spec §25.3) around Astryx's `Theme`
   rather than exposing Astryx's `Theme` directly, to satisfy §3.8 (no
   Astryx types leaking past the React bindings layer) and §40.F (Astryx
   replaceable).
4. **Consuming apps must link Astryx's CSS themselves.** SSR HTML output
   is correct without the stylesheets; nothing is visually styled without
   them. The starter template / CLI (`Phase 10`) needs to either inline
   these into the app's own asset pipeline or document the two `<link>`
   tags as a required step.
5. **Bundle size is acceptable for a reference profile.** A minimal
   Button+Card client bundle (React 19 + ReactDOM client + Astryx core +
   theme-neutral) is 703,842 bytes minified via plain `Bun.build`, with no
   further tuning attempted. Real applications will pull in more Astryx
   surface area; tree-shaking behavior across the full 499-export surface
   was not characterized here and should be revisited once
   `packages/ui-astryx` picks a concrete component set.

## Consequences

- `packages/react` (headless-to-React bindings, spec §25.2) can proceed
  without depending on Astryx at all, preserving replaceability.
- `packages/ui-astryx` (spec §25.3) can proceed against the verified
  0.6.3 export inventory (recorded in
  `compatibility/phase0/ui/API_NOTES.md`): `AppShell`/`SideNav`/`TopNav`
  for the shell, `Chat*` for chat/agent surfaces, `Card`/`ClickableCard`
  for artifact cards, `Dialog`/`AlertDialog`/`CommandPalette`/
  `ContextMenu`/`DropdownMenu` for continuation/approval surfaces,
  `Table*` for state inspection tables, `CodeBlock`/`Code`/`SyntaxTheme`
  for code surfaces (no dedicated diff viewer exists — would need to be
  composed), and `Theme`/`ThemeContext`/`useTheme`/`MediaTheme` for
  theme/dark-mode.
- Astryx's beta status is accepted as a risk with a documented mitigation:
  pin the exact version (0.6.3, per dependency maturity policy §39), and
  keep the React-bindings layer free of Astryx types so a version bump or
  a future Astryx-removal (§40.F) only touches `packages/ui-astryx`.

## Alternatives considered

- Building a from-scratch component library instead of Astryx: rejected
  per spec §6's explicit naming of React + Astryx as the reference UI,
  and because Astryx already passed its Bun-compatibility fixture with no
  blocking issues.
- Requiring a StyleX build step in the app bundler regardless: rejected
  as unnecessary complexity — Phase 0 showed it isn't needed to consume
  Astryx's pre-compiled output.
