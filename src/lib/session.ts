import { useEffect, useSyncExternalStore } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * session area in css pixels relative to the window
 */
export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * pending session call, commands run concurrently so they are chained
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * run a session command after the previous one settles
 *
 * @param command command name
 * @param args command arguments
 */
function enqueue(command: string, args?: Record<string, unknown>) {
  if (!isTauri()) return;

  const run = () =>
    invoke(command, args).catch((error) => console.error(command, error));

  queue = queue.then(run, run);
}

/**
 * show the whatsapp session of an account in the given area
 *
 * @param id account id
 * @param bounds session area
 */
export function showSession(id: string, bounds: Bounds) {
  enqueue("show_session", { id, bounds });
}

/**
 * hide the visible session, it keeps running in the background
 */
export function hideSession() {
  enqueue("hide_session");
}

/**
 * close the session of an account and wipe its data
 *
 * @param id account id
 */
export function removeSession(id: string) {
  enqueue("remove_session", { id });
}

/**
 * number of open overlays, sessions are native views drawn above the page
 */
let overlays = 0;

/**
 * subscribers notified when overlays open or close
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
 * hide the session while a dialog or menu is open so it isn't covered
 *
 * @param open whether the overlay is open
 */
export function useOverlay(open: boolean) {
  useEffect(() => {
    if (!open) return;

    overlays++;
    listeners.forEach((listener) => listener());

    return () => {
      overlays--;
      listeners.forEach((listener) => listener());
    };
  }, [open]);
}

/**
 * reactive check for open overlays
 *
 * @returns {boolean} true when the session should stay hidden
 */
export function useObscured(): boolean {
  return useSyncExternalStore(subscribe, () => overlays > 0);
}
