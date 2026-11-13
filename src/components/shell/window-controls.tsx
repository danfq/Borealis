import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CopyIcon, MinusIcon, SquareIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * minimize, maximize and close buttons for the undecorated window
 */
export function WindowControls() {
  const maximized = useMaximized();
  const appWindow = getCurrentWindow();

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="secondary"
        size="icon-xs"
        aria-label="Minimize"
        onClick={() => appWindow.minimize()}
      >
        <MinusIcon />
      </Button>

      <Button
        variant="secondary"
        size="icon-xs"
        aria-label={maximized ? "Restore" : "Maximize"}
        onClick={() => appWindow.toggleMaximize()}
      >
        {maximized ? (
          <CopyIcon className="size-2.5" />
        ) : (
          <SquareIcon className="size-2.5" />
        )}
      </Button>

      <Button
        variant="secondary"
        size="icon-xs"
        aria-label="Close"
        onClick={() => appWindow.close()}
      >
        <XIcon />
      </Button>
    </div>
  );
}

/**
 * track whether the window is maximized
 *
 * @returns {boolean} maximized state
 */
function useMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();

    /**
     * read the current state from the window
     */
    const sync = () => appWindow.isMaximized().then(setMaximized);

    sync();
    const unlisten = appWindow.onResized(sync);

    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);

  return maximized;
}
