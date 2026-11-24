import { useEffect, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isMac } from "@/lib/extras/platform";

/**
 * a whatsapp account managed by the app
 */
export type Account = {
  id: string;
  name: string;
};

/**
 * local storage key for persisted accounts
 */
const STORAGE_KEY = "borealis.accounts";

/**
 * local storage key for the account opened last
 */
const LAST_KEY = "borealis.accounts.last";

/**
 * event sent by the backend to bring up an account
 */
const OPEN_EVENT = "open-account";

/**
 * event sent by the backend when an account shortcut is pressed in a session
 */
const SWITCH_EVENT = "switch-account";

/**
 * subscribers notified on every change
 */
const listeners = new Set<() => void>();

/**
 * in-memory snapshot kept stable between renders
 */
let accounts: Account[] = load();

sync();

/**
 * read persisted accounts from storage
 *
 * @returns {Account[]} accounts
 */
function load(): Account[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    return raw ? (JSON.parse(raw) as Account[]) : [];
  } catch {
    return [];
  }
}

/**
 * replace the snapshot, persist it and notify subscribers
 *
 * @param next new accounts
 */
function commit(next: Account[]) {
  accounts = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
  sync();
}

/**
 * hand the accounts to the backend, which lists them in the menu bar, the
 * tray and the plasma widget
 */
function sync() {
  if (!isTauri()) return;

  invoke("set_accounts", { accounts }).catch((error) =>
    console.error("set_accounts", error),
  );
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
 * add a new account
 *
 * @param name display name
 *
 * @returns {Account} created account
 */
export function addAccount(name: string): Account {
  const account: Account = { id: crypto.randomUUID(), name: name.trim() };

  commit([...accounts, account]);

  return account;
}

/**
 * rename an existing account
 *
 * @param id account id
 * @param name new display name
 */
export function renameAccount(id: string, name: string) {
  commit(
    accounts.map((account) =>
      account.id === id ? { ...account, name: name.trim() } : account,
    ),
  );
}

/**
 * remove an account
 *
 * @param id account id
 */
export function removeAccount(id: string) {
  commit(accounts.filter((account) => account.id !== id));
}

/**
 * remember the open account so the next launch starts on it
 *
 * @param id account id
 */
export function rememberAccount(id: string) {
  localStorage.setItem(LAST_KEY, id);
}

/**
 * account opened last, or the first one when it is gone
 *
 * @param accounts accounts to pick from
 *
 * @returns {Account | undefined} account to open
 */
export function lastAccount(accounts: Account[]): Account | undefined {
  const id = localStorage.getItem(LAST_KEY);

  return accounts.find((account) => account.id === id) ?? accounts[0];
}

/**
 * reactive list of every account
 *
 * @returns {Account[]} accounts
 */
export function useAccounts(): Account[] {
  return useSyncExternalStore(subscribe, () => accounts);
}

/**
 * reactive lookup of a single account
 *
 * @param id account id
 *
 * @returns {Account | undefined} account if it exists
 */
export function useAccount(id: string | undefined): Account | undefined {
  return useAccounts().find((account) => account.id === id);
}

/**
 * open accounts the backend asks for, like when a notification is clicked
 */
export function useOpenAccountEvent() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTauri()) return;

    const unlisten = listen<string>(OPEN_EVENT, (event) =>
      navigate(`/accounts/${event.payload}`),
    );

    return () => void unlisten.then((unlisten) => unlisten());
  }, [navigate]);
}

/**
 * switch accounts with cmd 1 to 9, ctrl on other platforms
 *
 * sessions swallow keys while focused, so the backend reports the shortcut
 * from there on macos and linux
 */
export function useAccountShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    /**
     * open the account at a position in the rail
     *
     * @param index account index
     */
    const open = (index: number) => {
      const account = accounts[index];

      if (account) navigate(`/accounts/${account.id}`);
    };

    /**
     * switch when the shortcut is pressed in the app webview
     *
     * @param event keyboard event
     */
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = isMac ? event.metaKey : event.ctrlKey;

      if (!modifier || event.shiftKey || event.altKey) return;
      if (!/^[1-9]$/.test(event.key)) return;

      event.preventDefault();
      open(Number(event.key) - 1);
    };

    window.addEventListener("keydown", onKeyDown);

    const unlisten = isTauri()
      ? listen<number>(SWITCH_EVENT, (event) => open(event.payload))
      : Promise.resolve(() => {});

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      void unlisten.then((unlisten) => unlisten());
    };
  }, [navigate]);
}

/**
 * initials shown when an account has no picture
 *
 * @param name display name
 *
 * @returns {string} up to two initials
 */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}
