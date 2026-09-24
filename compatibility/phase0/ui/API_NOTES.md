# UI Phase 0 notes (React 19 + Astryx + Playwright)

Environment: Bun 1.4.0, `react@19.3.0`, `react-dom@19.3.0`,
`@astryxdesign/core@0.6.3`, `@astryxdesign/theme-neutral@0.6.3`,
`@stylexjs/stylex@0.19.1` (peer, auto-installed), `@playwright/test@1.63.0`,
Chromium 153.0.8010.12 (Playwright build v1243) installed via
`bun x playwright install chromium`. Node v26.8.2 also present (used only
to run the Playwright test runner — see below).

Commands run from `compatibility/phase0/ui/`:

```
bun install                                  # exit 0
bun test ui.test.tsx                          # exit 0, 4 pass / 0 fail, 15 expect() calls
bun build ./client-entry.tsx --outdir ./dist-client --target browser --minify
                                               # exit 0, 641 modules, 703,842 bytes
bun x playwright install chromium             # exit 0 (real download; ~300MB cache)
bun x playwright test --reporter=list         # exit 0, 1 passed
node node_modules/.bin/playwright test        # exit 0, 1 passed (equivalent)
```

## 1. React 19 `renderToString` under Bun

Works with no special configuration. One caveat worth recording: React 19
inserts an empty `<!-- -->` comment marker between adjacent static text
and an interpolated expression child (`<div>hello {1+1}</div>` renders as
`hello <!-- -->2`, not `hello 2`) — a byte-for-byte string comparison
needs to account for this; a substring/`toContain` check does not.

## 2. Astryx under SSR in Bun

`@astryxdesign/core` and `@astryxdesign/theme-neutral` render correctly
under `react-dom/server`'s `renderToString` with **no build step and no
StyleX compiler invoked at runtime or in our build**. This works because
Astryx ships its components already compiled: StyleX ran once at Astryx's
own publish time, so `dist/*.js` contains plain static class-name strings
(e.g. `"astryx-card default none x2kkz0m x153u1i6 ..."`), and the
matching CSS rules ship as plain static stylesheets:

- `@astryxdesign/core/dist/astryx.css` (171,157 bytes)
- `@astryxdesign/theme-neutral/dist/theme.css` (27,227 bytes)

Needed setup:

1. Import components directly from `@astryxdesign/core` (e.g. `Button`,
   `Card`, `TextInput`, `Theme`).
2. Wrap the tree in `<Theme theme={neutralTheme}>` where `neutralTheme`
   comes from `@astryxdesign/theme-neutral`. This is what stamps
   `data-astryx-theme="neutral"` on the DOM and scopes the CSS variables
   the static stylesheet defines.
3. A consuming app must **link both stylesheets** itself (`<link
   rel="stylesheet" href="...astryx.css">` and `...theme.css`) — SSR
   output (the HTML/class names) is correct without them, but nothing
   will be visually styled in a browser until they're present. This
   fixture's `playwright-server.tsx` serves both at `/astryx.css` and
   `/theme.css`.
4. `@stylexjs/stylex` (`^0.19.0` peer range, resolved to `0.19.1`) must be
   installed alongside — some Astryx internals (e.g.
   `dist/Field/InputClearButton.js`, `dist/VisuallyHidden/VisuallyHidden.js`)
   `require`/`import` it directly at module-load time even though nothing
   in this fixture calls StyleX APIs itself.

**Gotcha (environment, not Astryx):** running a script that imports
`@astryxdesign/core` from *outside* the project directory (e.g. a file
under `/tmp`) fails with `Cannot find module '@stylexjs/stylex'`, because
Bun cannot find a `node_modules` root to resolve from and falls back to
its global module cache, which does not carry the project's hoisted peer
dependency. Running the same file *inside* the project directory (where
`bun install` created `node_modules/`) resolves fine. This is worth
knowing for anyone probing these fixtures ad hoc — the entry point files
in this directory (`ui.test.tsx`, `client-entry.tsx`, etc.) are placed
inside `compatibility/phase0/ui/` for exactly this reason.

## 3. `Bun.build` bundling a client entry

`bun build ./client-entry.tsx --outdir ./dist-client --target browser
--minify` bundles React 19 + `react-dom/client` + `@astryxdesign/core` +
`@astryxdesign/theme-neutral` into a single 703,842-byte (0.70 MB, 641
modules) minified browser bundle in ~80ms. No plugin or StyleX babel/swc
transform was required — again because Astryx ships pre-compiled.

## 4. Playwright: chromium install, and the runtime split (Bun vs. Node)

`bun x playwright install chromium` (v1.63.0, matching the pinned version)
downloaded and installed a real Chromium (153.0.8010.12) — this is a real
network call the harness is expected to allow ("it downloads to the user
cache").

**Playwright's test runner executes under Node, not Bun.** Concretely:

- `bun x playwright test` and `node node_modules/.bin/playwright test`
  both work and are equivalent — `bun x` just resolves and forks the same
  Node-targeted CLI entry point rather than running it as a Bun script.
- Inside a Playwright test file (or anything it `import`s), the global
  `Bun` is `undefined`. A first attempt at this fixture had the SSR
  server's startup code (`Bun.serve(...)`) live in a module imported
  directly by the spec file; that failed immediately with
  `ReferenceError: Bun is not defined`, because Playwright's worker
  process is a plain Node process.
- Fix: the Bun.serve page must run in a **separate `bun run ...` child
  process**, not inside the Playwright test process. See
  `playwright-server.tsx` (a standalone script with an
  `if (import.meta.main)` entry point) and `pw-global-setup.ts` (spawns
  it via Node's `child_process.spawn`).

**Environment-specific gotcha (recorded, not an Astryx/Playwright bug):**
Playwright's built-in `webServer` config option was tried first
(`{ command: "bun run playwright-server.tsx", url: "http://localhost:3311" }`)
and hung indefinitely — no output, no spawned process, full test timeout
consumed. Root cause: `webServer`'s readiness check does a raw TCP
connect to the target port before spawning the command, on the assumption
that connecting to an unbound port fails fast (`ECONNREFUSED`). In this
sandbox's WSL2 network stack, a TCP connect to a genuinely unbound
loopback port does **not** refuse — it hangs until an OS-level timeout
(confirmed independently with a bare `curl --max-time 5
http://localhost:3311/` against a port nothing was listening on: it timed
out rather than refusing). Playwright's probe hits the same wall and
never gets far enough to spawn the command. Worked around by replacing
`webServer` with a hand-rolled `globalSetup`/teardown
(`pw-global-setup.ts`) that spawns the Bun process directly via
`child_process.spawn` and treats the child's own stdout ("listening on
...") as the readiness signal, never touching the socket to check
readiness.

With that workaround, `hydration.spec.ts` passes: it loads the SSR'd page
(Astryx `Button` inside a `Card`, wrapped in `Theme`), asserts the initial
server-rendered text ("Click me"), clicks the button, and asserts the
client-side React state update took effect after hydration ("Clicked").

## Astryx exported component/API inventory (0.6.3), by area the task asked about

(`Object.keys(require("@astryxdesign/core"))` — 499 total exports)

- **App shell:** `AppShell`, `AppShellMobileContext`, `SideNav`,
  `SideNavCollapseButton`, `SideNavHeading`, `SideNavItem`,
  `SideNavRenderContext`, `SideNavSection`, `TopNav`, `TopNavHeading`,
  `TopNavItem`, `TopNavMegaMenu`, `TopNavMegaMenuFeaturedCard`,
  `TopNavMegaMenuItem`, `TopNavMenu`, `TopNavRenderContext`.
- **Chat:** `ChatComposer`, `ChatComposerDrawer`, `ChatComposerInput`,
  `ChatComposerTokenElement`, `ChatDictationButton`, `ChatLayout`,
  `ChatLayoutScrollButton`, `ChatMessage`, `ChatMessageBubble`,
  `ChatMessageList`, `ChatMessageMetadata`, `ChatSendButton`,
  `ChatSystemMessage`, `ChatTokenizedText`, `ChatToolCalls`.
- **Cards:** `Card`, `ClickableCard`, `HoverCard`, `SelectableCard`,
  `TopNavMegaMenuFeaturedCard`, `useHoverCard`.
- **Forms / inputs:** `TextInput`, `NumberInput`, `DateInput`,
  `DateRangeInput`, `DateTimeInput`, `TimeInput`, `FileInput`,
  `CheckboxInput`, `CheckboxIndicator`, `CheckboxList`,
  `CheckboxListItem`, `RadioIndicator`, `RadioList`, `RadioListItem`,
  `ToggleButton`, `ToggleButtonGroup`, `Selector`, `SelectorOption`,
  `MultiSelector`, `ComplexSelector`, `Typeahead`, `BaseTypeahead`,
  `TypeaheadItem`, `Field`, `FieldLabel`, `FieldStatus`, `InputGroup`,
  `InputGroupText`, `InputClearButton`.
- **Buttons:** `Button`, `IconButton`, `ButtonGroup`,
  `useButtonGroup`, plus specialized buttons (`ChatSendButton`,
  `ChatDictationButton`, `SideNavCollapseButton`, `ToggleButton`).
- **Dialogs (and dialog-family surfaces):** `Dialog`, `DialogHeader`,
  `AlertDialog`, `useImperativeDialog`, `useImperativeAlertDialog`,
  `BottomSheet`, `BottomSheetSwitcher`, `CommandPalette` (+
  `CommandPaletteInput`/`Item`/`Group`/`Footer`/`Empty`/`List`),
  `ContextMenu` (+ `Item`/`CheckboxItem`/`RadioGroup`/`RadioItem`/
  `SubMenu`/`Divider`), `DropdownMenu` (same sub-item family), `Popover`,
  `usePopover`, `HoverCard`.
- **Tables:** `Table`, `TableHeader`, `TableHeaderCell`, `TableBody`,
  `TableRow`, `TableCell`, `TableFooter`, `TableContext`, plus a large
  hook surface (`useTableSortable(State)`, `useTableFiltering`,
  `useTablePagination`, `useTableSelection(State)`,
  `useTableColumnResize`, `useTableColumnSettings(State)`,
  `useTableGroupedRows`, `useTableRowExpansion`, `useTableRowIndex`,
  `useTableRowStatus`, `useTableStickyColumns`, `useTableTreeData`,
  `useTableTreeState`, `useBaseTablePlugins`).
- **Code / diff viewers:** `Code`, `CodeBlock`, `SyntaxTheme`,
  `defineSyntaxTheme`, `useSyntaxTheme`, `Citation`. No dedicated
  side-by-side diff component was found under this name set (searched for
  "Diff" — no match); a diff view would need to be composed from
  `CodeBlock` plus application logic.
- **Theme / dark mode:** `Theme`, `ThemeContext`, `useTheme`,
  `useThemeName`, `defineTheme`, `MediaTheme` (drives light/dark via
  `prefers-color-scheme`), `generateThemeCSS`, `generateThemeRules(Split)`,
  `registerTheme`, `getRegisteredTheme(s)`, `resolveThemeToken(s)`,
  `themeDataAttributes`, `themeProps`, `isDefinedTheme`, `resetThemes`.
  `@astryxdesign/theme-neutral` itself exports `neutralTheme`,
  `neutralPalettes`, `neutralIconRegistry`.

## Open questions

- StyleX's own compiler was never invoked in this fixture (not required
  for this task's assertions); if a future package wants to author *new*
  Astryx-styled components rather than only consume shipped ones, the
  babel/swc StyleX transform and its Bun-compatibility would need a
  separate Phase 0 pass.
- No dedicated "diff viewer" component exists in `@astryxdesign/core`
  0.6.3 under an obvious name; spec §25.3's "artifact surfaces" may need
  a custom composition on top of `CodeBlock`.
- The `webServer` hang is recorded as an environment characterization,
  not necessarily present outside this sandbox's WSL2 networking setup;
  a future CI environment should re-verify whether the built-in
  `webServer` option works there before assuming the workaround is
  permanently required.
