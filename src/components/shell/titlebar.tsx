import { isTauri } from "@tauri-apps/api/core";
import { SearchIcon } from "lucide-react";
import icon from "../../../src-tauri/icons/128x128.png";
import { WindowControls } from "@/components/shell/window-controls";
import { Input } from "@/components/ui/input";
import { isMac } from "@/lib/extras/platform";
import { cn } from "@/lib/utils";

/**
 * header bar drawn in place of the system title bar
 *
 * empty space drags the window and double click toggles maximize
 */
export function Titlebar() {
  // macos keeps its native traffic lights and the browser has no window
  const controls = isTauri() && !isMac;

  return (
    <header
      data-tauri-drag-region="deep"
      className="grid h-12 shrink-0 grid-cols-[1fr_minmax(0,36rem)_1fr] items-center gap-3 border-b bg-sidebar px-3 text-sidebar-foreground"
    >
      {/* leave room for the traffic lights on macos */}
      <div className={cn("flex items-center", isMac && "pl-18")}>
        <img src={icon} alt="" draggable={false} className="size-6" />
      </div>

      {/* filtering is wired up once there is something to search */}
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search for people, messages or files..."
          aria-label="Search"
          autoComplete="off"
          className="h-8 pl-9"
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        {controls && <WindowControls />}
      </div>
    </header>
  );
}
