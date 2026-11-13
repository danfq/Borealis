import { Outlet } from "react-router";
import { AccountRail } from "@/components/shell/account-rail";
import { Titlebar } from "@/components/shell/titlebar";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * root layout shared by every route
 */
export default function Root() {
  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-background">
        <Titlebar />

        <div className="flex min-h-0 flex-1">
          <AccountRail />

          <main className="flex min-w-0 flex-1 flex-col">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
