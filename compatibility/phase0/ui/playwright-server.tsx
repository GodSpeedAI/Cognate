// Minimal Bun.serve harness for the Playwright fixture: SSR the page on
// GET /, serve the client bundle at /client-entry.js, and hydrate in the
// browser. Run standalone: `bun run playwright-server.ts`.
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Button, Card, Theme } from "@astryxdesign/core";
import { neutralTheme } from "@astryxdesign/theme-neutral";

function App() {
  return (
    <Theme theme={neutralTheme}>
      <Card>
        <Button id="probe-button">Click me</Button>
      </Card>
    </Theme>
  );
}

export function startServer(port = 0) {
  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/") {
        const appHtml = renderToString(<App />);
        const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="/astryx.css" />
    <link rel="stylesheet" href="/theme.css" />
  </head>
  <body>
    <div id="root">${appHtml}</div>
    <script type="module" src="/client-entry.js"></script>
  </body>
</html>`;
        return new Response(html, { headers: { "content-type": "text/html" } });
      }
      if (url.pathname === "/client-entry.js") {
        const file = Bun.file(new URL("./dist-client/client-entry.js", import.meta.url));
        return new Response(file, { headers: { "content-type": "application/javascript" } });
      }
      if (url.pathname === "/astryx.css") {
        const file = Bun.file(
          new URL("./node_modules/@astryxdesign/core/dist/astryx.css", import.meta.url),
        );
        return new Response(file, { headers: { "content-type": "text/css" } });
      }
      if (url.pathname === "/theme.css") {
        const file = Bun.file(
          new URL("./node_modules/@astryxdesign/theme-neutral/dist/theme.css", import.meta.url),
        );
        return new Response(file, { headers: { "content-type": "text/css" } });
      }
      return new Response("not found", { status: 404 });
    },
  });
}

if (import.meta.main) {
  const server = startServer(3311);
  console.log(`listening on ${server.url}`);
}
