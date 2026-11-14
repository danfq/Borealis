import { useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { isMac } from "@/lib/extras/platform";

/**
 * quit the app, closing the window may only minimize it
 */
export function quit() {
  if (!isTauri()) return;

  invoke("quit").catch((error) => console.error("quit", error));
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
