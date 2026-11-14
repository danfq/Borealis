import { useEffect, useSyncExternalStore } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isMac } from "@/lib/extras/platform";

/**
 * localStorage key holding whether the sidebar is collapsed
 */
const STORAGE_KEY = "borealis.sidebar.collapsed";

/**
 * event sent by the backend when the shortcut is pressed inside a session
 */
const TOGGLE_EVENT = "toggle-sidebar";

/**
 * shortcut label shown next to the toggle
 */
export const SIDEBAR_SHORTCUT = isMac ? "⇧⌘S" : "Ctrl+Shift+S";

/**
 * whether the sidebar shows labels next to the icons
 */
let expanded = localStorage.getItem(STORAGE_KEY) !== "true";

/**
 * subscribers notified when the sidebar collapses or expands
 */
const listeners = new Set<() => void>();

/**
 * register a change listener
 *
 * @param listener callback fired on change
 *
 * @returns {() => void} unsubscribe
 */
function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

/**
 * collapse or expand the sidebar and remember it
 */
export function toggleSidebar() {
  expanded = !expanded;
  localStorage.setItem(STORAGE_KEY, String(!expanded));
  listeners.forEach((listener) => listener());
}

/**
 * reactive sidebar state
 *
 * @returns {boolean} true when the sidebar is expanded
 */
export function useSidebar(): boolean {
  return useSyncExternalStore(subscribe, () => expanded);
}

/**
 * toggle the sidebar on ctrl shift s, cmd shift s on macos
 *
 * whatsapp keeps ctrl b for bold, and sessions swallow keys while focused
 * so the backend reports the shortcut from there on linux
 */
export function useSidebarShortcut() {
  useEffect(() => {
    /**
     * toggle when the shortcut is pressed
     *
     * @param event keyboard event
     */
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = isMac ? event.metaKey : event.ctrlKey;

      if (!modifier || !event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== "s") return;

      event.preventDefault();
      toggleSidebar();
    };

    window.addEventListener("keydown", onKeyDown);

    const unlisten = isTauri()
      ? listen(TOGGLE_EVENT, toggleSidebar)
      : Promise.resolve(() => {});

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      void unlisten.then((unlisten) => unlisten());
    };
  }, []);
}
