import { createBrowserRouter } from "react-router";
import Root from "./routes/root";
import Home from "./routes/home";

/**
 * app routes
 *
 * tauri falls back to index.html for unknown paths so browser history is safe
 */
export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [{ index: true, Component: Home }],
  },
]);
