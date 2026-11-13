import { Outlet } from "react-router";
import { AccountRail } from "@/components/shell/account-rail";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * root layout shared by every route
 */
export default function Root() {
  return (
    <TooltipProvider>
      <div className="flex h-full bg-background">
        <AccountRail />

        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  );
}
