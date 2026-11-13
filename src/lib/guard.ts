/**
 * macos uses cmd where other platforms use ctrl
 */
const isMac = navigator.userAgent.includes("Mac");

/**
 * keys that trigger browser features on their own
 */
const BARE_KEYS = new Set([
  "F3",
  "F5",
  "F7",
  "BrowserBack",
  "BrowserForward",
  "BrowserRefresh",
  "BrowserSearch",
  "BrowserHome",
]);

/**
 * letters that trigger browser features with the platform modifier
 *
 * reload, print, find, view source, save, open and downloads
 */
const MOD_KEYS = new Set(["r", "p", "f", "g", "u", "s", "o", "j"]);

/**
 * check whether a key press would trigger a browser feature
 *
 * @param event keyboard event
 *
 * @returns {boolean} true when it should be blocked
 */
function isBrowserShortcut(event: KeyboardEvent): boolean {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  // ctrl on macos is used for text navigation so only cmd counts there
  const mod = isMac ? event.metaKey : event.ctrlKey;

  if (BARE_KEYS.has(key)) return true;

  // devtools stay reachable while developing
  if (!import.meta.env.DEV) {
    if (key === "F12") return true;
    if (mod && (isMac ? event.altKey : event.shiftKey) && "ijc".includes(key))
      return true;
  }

  if (mod && MOD_KEYS.has(key)) return true;

  // history navigation, option arrows move by word on macos so leave them
  if (isMac) return event.metaKey && (key === "[" || key === "]");

  return event.altKey && (key === "ArrowLeft" || key === "ArrowRight");
}

/**
 * strip browser behaviour from the webview so it feels native
 *
 * blocks the context menu, browser shortcuts and mouse history buttons
 */
export function guardWebview() {
  const block = (event: Event) => event.preventDefault();

  window.addEventListener("contextmenu", block, { capture: true });

  window.addEventListener(
    "keydown",
    (event) => isBrowserShortcut(event) && block(event),
    { capture: true },
  );

  // mouse back and forward buttons
  window.addEventListener(
    "mouseup",
    (event) => (event.button === 3 || event.button === 4) && block(event),
    { capture: true },
  );
}
