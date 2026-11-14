import type { ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import icon from "../../../src-tauri/icons/128x128.png";
import { SearchField } from "@/components/shell/search";
import { WindowControls } from "@/components/shell/window-controls";
import { isMac } from "@/lib/extras/platform";
import { cn } from "@/lib/utils";

type TitlebarProps = {
  /**
   * fills the bar in place of the centered search, used by the topbar
   */
  children?: ReactNode;
};

/**
 * header bar drawn in place of the system title bar
 *
 * empty space drags the window and double click toggles maximize
 */
export function Titlebar({ children }: TitlebarProps) {
  // macos keeps its native traffic lights and the browser has no window
  const controls = isTauri() && !isMac;

  return (
    <header
      data-tauri-drag-region="deep"
      className={cn(
        "h-12 shrink-0 items-center gap-3 border-b bg-sidebar px-3 text-sidebar-foreground",
        children ? "flex" : "grid grid-cols-[1fr_minmax(0,36rem)_1fr]",
      )}
    >
      {/* macos titlebars carry no app icon, just room for the traffic lights */}
      <div className={cn("flex shrink-0 items-center", isMac && "pl-18")}>
        {!isMac && (
          <img src={icon} alt="" draggable={false} className="size-6" />
        )}
      </div>

      {children ?? <SearchField />}

      {(controls || !children) && (
        <div className="flex items-center justify-end gap-3">
          {controls && <WindowControls />}
        </div>
      )}
    </header>
  );
}
