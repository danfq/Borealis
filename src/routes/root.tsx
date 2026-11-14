import { Outlet } from "react-router";
import { AccountRail } from "@/components/shell/account-rail";
import { PermissionPrompt } from "@/components/shell/permission-prompt";
import { Titlebar } from "@/components/shell/titlebar";
import { useOpenAccountEvent } from "@/lib/accounts";
import { useQuitShortcut } from "@/lib/app";
import { useSettings } from "@/lib/settings";
import { useSidebarShortcut } from "@/lib/sidebar";
import { cn } from "@/lib/utils";

/**
 * root layout shared by every route
 */
export default function Root() {
  const { rail } = useSettings();

  useQuitShortcut();
  useSidebarShortcut(rail === "sidebar");
  useOpenAccountEvent();

  return (
    <>
      <div className="flex h-full flex-col bg-background">
        <Titlebar />

        {/* the topbar sits under the titlebar, the sidebar next to the page */}
        <div
          className={cn("flex min-h-0 flex-1", rail === "topbar" && "flex-col")}
        >
          <AccountRail />

          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Outlet />
          </main>
        </div>
      </div>

      {/* requests can come from sessions in the background */}
      <PermissionPrompt />
    </>
  );
}
