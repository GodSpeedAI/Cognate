
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@cognate/client";
import { CognateProvider } from "@cognate/react";
import { connectTransport, devToken } from "@cognate/protocol-connect-bun";
import { createRemoteRuntimeService } from "@cognate/protocol-connect";
import { App } from "../src/ui/App.tsx";

const caller = { tenant: "tenant-a", actor: { id: "operator", kind: "user" } };
const transport = connectTransport(window.location.origin);
const service = createRemoteRuntimeService(transport, () => devToken(caller));
const client = createClient({ service, caller });

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(createElement(CognateProvider, { client }, createElement(App)));
}
