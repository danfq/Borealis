import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isMac } from "@/lib/extras/platform";

/**
 * event sent by the backend when the shortcut is pressed inside a session
 */
const SEARCH_EVENT = "focus-search";

/**
 * search fields waiting to be focused
 */
const listeners = new Set<() => void>();

/**
 * focus the search, wherever it is shown
 */
export function focusSearch() {
  // a focused session keeps the keyboard otherwise
  if (isTauri()) {
    getCurrentWebview()
      .setFocus()
      .catch((error) => console.error("setFocus", error));
  }

  listeners.forEach((listener) => listener());
}

/**
 * run a callback whenever the search should take focus
 *
 * @param callback focuses the field
 */
export function useSearchFocus(callback: () => void) {
  useEffect(() => {
    listeners.add(callback);

    return () => void listeners.delete(callback);
  }, [callback]);
}

/**
 * focus the search on cmd f, ctrl f on other platforms
 *
 * whatsapp keeps the shifted shortcut for searching inside a chat, and
 * sessions swallow keys while focused so the backend reports it from there
 * on macos and linux
 */
export function useSearchShortcut() {
  useEffect(() => {
    /**
     * focus when the shortcut is pressed in the app webview
     *
     * @param event keyboard event
     */
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = isMac ? event.metaKey : event.ctrlKey;

      if (!modifier || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== "f") return;

      event.preventDefault();
      focusSearch();
    };

    window.addEventListener("keydown", onKeyDown);

    const unlisten = isTauri()
      ? listen(SEARCH_EVENT, focusSearch)
      : Promise.resolve(() => {});

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      void unlisten.then((unlisten) => unlisten());
    };
  }, []);
}
