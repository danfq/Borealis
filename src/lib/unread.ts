import { useSyncExternalStore } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * unread chats of an account, as reported by its session
 */
type Unread = {
  account: string;
  count: number;
};

/**
 * event sent by the backend whenever a session title changes
 */
const UNREAD_EVENT = "unread";

/**
 * subscribers notified on every change
 */
const listeners = new Set<() => void>();

/**
 * unread chats per account id, kept stable between renders
 */
let counts: Record<string, number> = {};

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

if (isTauri()) {
  listen<Unread>(UNREAD_EVENT, ({ payload: { account, count } }) => {
    if (counts[account] === count) return;

    counts = { ...counts, [account]: count };
    listeners.forEach((listener) => listener());
  }).catch((error) => console.error("listen", UNREAD_EVENT, error));
}

/**
 * reactive unread chats of an account
 *
 * @param id account id
 *
 * @returns {number} unread chats, 0 until its session reports them
 */
export function useUnread(id: string): number {
  return useSyncExternalStore(subscribe, () => counts[id] ?? 0);
}
