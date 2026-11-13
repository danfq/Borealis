import { useSyncExternalStore } from "react";

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
 * subscribers notified on every change
 */
const listeners = new Set<() => void>();

/**
 * in-memory snapshot kept stable between renders
 */
let accounts: Account[] = load();

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
