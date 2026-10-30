# landing/src/layouts — document shell

## Overview
`Base.astro` is the single document shell every route wraps in. It owns the head metadata, the font and stylesheet imports, and the `<slot />` that pages fill. Canonical and social URLs are computed from `Astro.site`, so they stay absolute regardless of route.

## Interface
- `Base.astro` — `Props` of `title`, `description`, optional `noindex` and `ogImage` `[landing/src/layouts/Base.astro:Props]`
- Default props: `noindex = false`, `ogImage = '/og.png'` `[landing/src/layouts/Base.astro:Astro.props]`

## Invariants
- Canonical and OG URLs must be absolute, so both are built with `new URL(..., Astro.site)` `[landing/src/layouts/Base.astro:canonical]`
- `noindex` flips the robots meta to `noindex`; otherwise the page is `index, follow` `[landing/src/layouts/Base.astro:noindex]`
- The OG image is declared at 1200x630 `[landing/src/layouts/Base.astro:ogImageUrl]`
- Stylesheet order is tokens, base, exploded, page, imported before any page markup `[landing/src/layouts/Base.astro:../styles/tokens.css]`

## Side Effects
- Disk read at build time: imports the four `@fontsource*` packages and four CSS files `[landing/src/layouts/Base.astro:@fontsource-variable/josefin-sans]`
- Inline script adds a `js` class to the document element so no-JS styling can branch `[landing/src/layouts/Base.astro:document.documentElement]`

## Verification
- Run: `cd landing && bun test`
