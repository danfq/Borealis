import { useEffect } from "react";
import { useNavigate } from "react-router";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isMac } from "@/lib/extras/platform";

/**
 * quit the app, closing the window may only minimize it
 */
export function quit() {
  if (!isTauri()) return;

  invoke("quit").catch((error) => console.error("quit", error));
}

/**
 * event sent by the backend from the settings menu item or a session
 */
const SETTINGS_EVENT = "open-settings";

/**
 * open the settings on cmd comma, ctrl comma on other platforms
 *
 * macos has the shortcut in its app menu and linux reports it from a focused
 * session, both send the event instead
 */
export function useSettingsShortcut() {
  const navigate = useNavigate();

  useEffect(() => {
    const open = () => navigate("/settings");

    /**
     * open when the shortcut is pressed in the app webview
     *
     * @param event keyboard event
     */
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = isMac ? event.metaKey : event.ctrlKey;

      if (!modifier || event.shiftKey || event.altKey || event.key !== ",")
        return;

      event.preventDefault();
      open();
    };

    window.addEventListener("keydown", onKeyDown);

    const unlisten = isTauri()
      ? listen(SETTINGS_EVENT, open)
      : Promise.resolve(() => {});

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      void unlisten.then((unlisten) => unlisten());
    };
  }, [navigate]);
}

/**
 * quit on ctrl q, macos already has cmd q in its app menu
 */
export function useQuitShortcut() {
  useEffect(() => {
    if (isMac) return;

    /**
     * quit when the shortcut is pressed
     *
     * @param event keyboard event
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.key.toLowerCase() !== "q")
        return;

      event.preventDefault();
      quit();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
