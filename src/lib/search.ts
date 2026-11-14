import { useEffect, useSyncExternalStore } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isMac } from "@/lib/extras/platform";

/**
 * event sent by the backend when the shortcut is pressed inside a session
 */
const SEARCH_EVENT = "focus-search";

/**
 * event carrying the results of a session
 */
const RESULTS_EVENT = "search-results";

/**
 * wait after the last keystroke before searching
 */
const DEBOUNCE = 200;

/**
 * give up on sessions that never answer
 */
const TIMEOUT = 5000;

/**
 * what a result points at
 */
export type SearchKind = "chat" | "contact" | "message" | "file";

/**
 * single match found in a session
 */
export type SearchResult = {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;

  /**
   * unix seconds, only for messages and files
   */
  timestamp: number | null;

  /**
   * account whose session found it
   */
  account: string;
};

/**
 * current search, kept stable between renders
 */
export type Search = {
  query: string;
  results: SearchResult[];

  /**
   * sessions are still answering
   */
  pending: boolean;
};

/**
 * results of a session as sent by the backend
 */
type Found = {
  token: number;
  account: string;
  results: Omit<SearchResult, "account">[];
};

/**
 * search fields waiting to be focused
 */
const focusListeners = new Set<() => void>();

/**
 * subscribers notified whenever the search changes
 */
const listeners = new Set<() => void>();

/**
 * in-memory snapshot kept stable between renders
 */
let state: Search = { query: "", results: [], pending: false };

/**
 * id of the running search, answers for older ones are dropped
 */
let token = 0;

/**
 * sessions asked and answered for the running search
 */
let asked: number | undefined;
let answered = 0;

/**
 * pending debounce of the next search
 */
let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * replace the snapshot and notify subscribers
 *
 * @param next new search
 */
function commit(next: Partial<Search>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

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
 * ask every running session, results come in through the results event
 *
 * @param query search text
 */
async function run(query: string) {
  const current = ++token;

  asked = undefined;
  answered = 0;

  if (!isTauri()) return commit({ results: [], pending: false });

  try {
    asked = await invoke<number>("search", { token: current, query });
  } catch (error) {
    console.error("search", error);
    asked = 0;
  }

  if (current === token && answered >= asked) commit({ pending: false });

  setTimeout(() => current === token && commit({ pending: false }), TIMEOUT);
}

if (isTauri()) {
  listen<Found>(RESULTS_EVENT, ({ payload }) => {
    if (payload.token !== token) return;

    const results = payload.results.map((result) => ({
      ...result,
      account: payload.account,
    }));

    // the first answer replaces the previous search, so results never blink
    answered++;
    commit({
      results: answered === 1 ? results : [...state.results, ...results],
      pending: asked === undefined || answered < asked,
    });
  }).catch((error) => console.error("listen", RESULTS_EVENT, error));
}

/**
 * change the search text, searching once typing settles
 *
 * @param query search text
 */
export function setSearchQuery(query: string) {
  clearTimeout(timer);

  if (!query.trim()) {
    // drops answers still on their way
    token++;
    return commit({ query, results: [], pending: false });
  }

  commit({ query, pending: true });
  timer = setTimeout(() => void run(query), DEBOUNCE);
}

/**
 * empty the search
 */
export function clearSearch() {
  setSearchQuery("");
}

/**
 * open a result in its account and leave the search
 *
 * @param result result to open
 */
export function openSearchResult({ account, id }: SearchResult) {
  clearSearch();

  if (!isTauri()) return;

  invoke("open_search_result", { account, id }).catch((error) =>
    console.error("open_search_result", error),
  );
}

/**
 * reactive search
 *
 * @returns {Search} current search
 */
export function useSearch(): Search {
  return useSyncExternalStore(subscribe, () => state);
}

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

  focusListeners.forEach((listener) => listener());
}

/**
 * run a callback whenever the search should take focus
 *
 * @param callback focuses the field
 */
export function useSearchFocus(callback: () => void) {
  useEffect(() => {
    focusListeners.add(callback);

    return () => void focusListeners.delete(callback);
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
