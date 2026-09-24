import * as React from "react";
import { hydrateRoot } from "react-dom/client";
import { useState } from "react";
import { Button, Card, Theme } from "@astryxdesign/core";
import { neutralTheme } from "@astryxdesign/theme-neutral";

function App() {
  const [label, setLabel] = useState("Click me");
  return (
    <Theme theme={neutralTheme}>
      <Card>
        <Button id="probe-button" onClick={() => setLabel("Clicked")}>
          {label}
        </Button>
      </Card>
    </Theme>
  );
}

const root = document.getElementById("root");
if (root) hydrateRoot(root, <App />);
