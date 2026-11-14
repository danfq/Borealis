import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { router } from "./router";
import { syncTheme } from "./lib/theme";
import { guardWebview } from "./lib/security/guard";
import { settingsReady } from "./lib/settings";
import "./styles/app.css";

syncTheme();
guardWebview();

// the layout depends on the settings
void settingsReady.then(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  ),
);
