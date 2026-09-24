import { expect, test } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Button, Card, TextInput, Theme } from "@astryxdesign/core";
import { neutralTheme } from "@astryxdesign/theme-neutral";

// --- 1. React 19 renderToString under Bun --------------------------------

test("React 19 renderToString works under Bun", () => {
  const html = renderToString(<div className="probe">hello {1 + 1}</div>);
  // observed: React 19 renderToString inserts an empty comment marker
  // (`<!-- -->`) between adjacent text and an interpolated expression, so
  // the string is not a byte-for-byte template match.
  expect(html).toBe('<div class="probe">hello <!-- -->2</div>');
});

// --- 2. Astryx components render under SSR in Bun ------------------------
//
// Needed CSS/theme setup (observed): the Theme provider from
// @astryxdesign/core wraps the tree and takes a theme object (here
// neutralTheme from @astryxdesign/theme-neutral); it emits
// data-astryx-theme="neutral" plus atomic class names that come from
// StyleX compiled AT PUBLISH TIME into the package's dist/ output. No
// StyleX compiler step is required at our build or runtime -- the classes
// are already static strings in dist/*.js. The corresponding CSS rules
// ship as static stylesheets (dist/astryx.css from @astryxdesign/core,
// dist/theme.css from @astryxdesign/theme-neutral) that a consuming app
// must link/import itself; SSR output is correct without them, but a
// browser needs the stylesheet linked to render the components visually.

test("Astryx Button/Card/TextInput render under SSR with Theme + neutral theme", () => {
  const html = renderToString(
    <Theme theme={neutralTheme}>
      <Card>
        <TextInput label="Name" />
        <Button>Click me</Button>
      </Card>
    </Theme>,
  );
  expect(html).toContain('data-astryx-theme="neutral"');
  expect(html).toContain("astryx-card");
  expect(html).toContain("astryx-text-input");
  expect(html).toContain("astryx-button");
  expect(html).toContain("Click me");
  expect(html).toContain(">Name<");
});

test("Astryx prebuilt stylesheets exist as static files (no runtime StyleX compiler needed)", async () => {
  const coreCss = Bun.file(
    new URL("./node_modules/@astryxdesign/core/dist/astryx.css", import.meta.url),
  );
  const themeCss = Bun.file(
    new URL("./node_modules/@astryxdesign/theme-neutral/dist/theme.css", import.meta.url),
  );
  expect(await coreCss.exists()).toBe(true);
  expect(await themeCss.exists()).toBe(true);
  expect((await coreCss.text()).length).toBeGreaterThan(0);
  expect((await themeCss.text()).length).toBeGreaterThan(0);
});

// --- 3. Bun.build bundles a client entry that uses Astryx for the browser -

test("Bun.build bundles client-entry.tsx (React + Astryx) for the browser", async () => {
  const result = await Bun.build({
    entrypoints: [new URL("./client-entry.tsx", import.meta.url).pathname],
    target: "browser",
    minify: true,
  });
  expect(result.success).toBe(true);
  expect(result.outputs.length).toBe(1);
  const bytes = await result.outputs[0]!.arrayBuffer();
  // observed: minified browser bundle of React 19 + ReactDOM client +
  // @astryxdesign/core + @astryxdesign/theme-neutral is 703,842 bytes
  // (0.70 MB, 641 modules) measured via `bun build --minify`.
  expect(bytes.byteLength).toBeGreaterThan(100_000);
  expect(bytes.byteLength).toBeLessThan(2_000_000);
});
