/**
 * macos uses cmd where other platforms use ctrl and draws its own window controls
 */
export const isMac = navigator.userAgent.includes("Mac");

/**
 * windows gets a tray icon, as macos gets a menu bar item
 */
export const isWindows = navigator.userAgent.includes("Windows");
