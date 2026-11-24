import type { Platform } from "./release";

/**
 * how an installer is presented on the site
 */
export type PlatformInfo = {
  platform: Platform;
  name: string;
  brand: "apple" | "windows" | "linux" | "arch";

  /**
   * kind of file, shown next to the size
   */
  file: string;

  /**
   * who the installer is for
   */
  requires: string;

  /**
   * how to install it, may contain inline html
   */
  install: string;
};

/**
 * every installer, in the order they're listed
 */
export const PLATFORMS: PlatformInfo[] = [
  {
    platform: "macos",
    name: "macOS",
    brand: "apple",
    file: "Disk image",
    requires: "macOS 14 or later, Apple silicon and Intel",
    install: "Open it and drag Borealis into your Applications folder.",
  },
  {
    platform: "windows",
    name: "Windows",
    brand: "windows",
    file: "Installer",
    requires: "Windows 10 or later, 64-bit",
    install:
      "Run the installer. If Windows warns you about it, choose <strong>More info</strong>, then <strong>Run anyway</strong>.",
  },
  {
    platform: "linux",
    name: "Linux",
    brand: "linux",
    file: "AppImage",
    requires: "Most 64-bit distributions",
    install:
      "Make it executable with <code>chmod +x Borealis*.AppImage</code>, then open it.",
  },
  {
    platform: "arch",
    name: "Arch Linux",
    brand: "arch",
    file: "pacman package",
    requires: "Arch and Arch-based distributions, 64-bit",
    install:
      "Install it with <code>sudo pacman -U borealis-*.pkg.tar.zst</code>.",
  },
];
