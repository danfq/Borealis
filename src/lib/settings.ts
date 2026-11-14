import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { BellIcon, CameraIcon, MicIcon, type LucideIcon } from "lucide-react";

/**
 * what happens when whatsapp asks for a permission
 */
export type Policy = "ask" | "allow" | "deny";

/**
 * permissions governed by the settings
 */
export type Permission = "notifications" | "microphone" | "camera";

/**
 * how each permission is presented
 */
export const PERMISSIONS: Record<
  Permission,
  { label: string; description: string; icon: LucideIcon }
> = {
  notifications: {
    label: "Notifications",
    description: "Show new messages on your desktop.",
    icon: BellIcon,
  },
  microphone: {
    label: "Microphone",
    description: "Record voice messages.",
    icon: MicIcon,
  },
  camera: {
    label: "Camera",
    description: "Take photos and videos.",
    icon: CameraIcon,
  },
};

/**
 * app settings, persisted by the backend
 */
export type Settings = {
  /**
   * closing the window minimizes it so sessions keep running
   */
  minimizeOnClose: boolean;

  /**
   * pick a location for every download
   */
  askDownloadLocation: boolean;

  permissions: Record<Permission, Policy>;

  /**
   * where the account rail sits
   */
  rail: Rail;
};

/**
 * where the account rail sits, the topbar can't collapse
 */
export type Rail = "sidebar" | "topbar";

/**
 * used until the backend answers and outside of tauri
 */
const DEFAULTS: Settings = {
  minimizeOnClose: true,
  askDownloadLocation: true,
  permissions: { notifications: "ask", microphone: "ask", camera: "ask" },
  rail: "sidebar",
};

/**
 * subscribers notified on every change
 */
const listeners = new Set<() => void>();

/**
 * in-memory snapshot kept stable between renders
 */
let settings: Settings = DEFAULTS;

/**
 * replace the snapshot and notify subscribers
 *
 * @param next new settings
 */
function commit(next: Settings) {
  settings = next;
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
 * settles once the stored settings are loaded, so the layout doesn't jump
 */
export const settingsReady: Promise<void> = isTauri()
  ? invoke<Settings>("get_settings")
      .then(commit)
      .catch((error) => console.error("get_settings", error))
  : Promise.resolve();

/**
 * change some settings and persist them
 *
 * @param patch settings to change
 */
export async function updateSettings(patch: Partial<Settings>) {
  const previous = settings;

  commit({ ...settings, ...patch });

  if (!isTauri()) return;

  try {
    await invoke("set_settings", { settings });
  } catch (error) {
    // keep the ui in line with what is actually stored
    commit(previous);
    console.error("set_settings", error);
  }
}

/**
 * change the policy of a single permission
 *
 * @param permission permission to change
 * @param policy new policy
 */
export function setPolicy(permission: Permission, policy: Policy) {
  return updateSettings({
    permissions: { ...settings.permissions, [permission]: policy },
  });
}

/**
 * reactive settings
 *
 * @returns {Settings} settings
 */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, () => settings);
}
