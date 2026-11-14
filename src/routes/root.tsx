import { Outlet } from "react-router";
import { AccountRail } from "@/components/shell/account-rail";
import { PermissionPrompt } from "@/components/shell/permission-prompt";
import { Titlebar } from "@/components/shell/titlebar";
import { useOpenAccountEvent } from "@/lib/accounts";
import { useQuitShortcut } from "@/lib/app";
import { useSidebarShortcut } from "@/lib/sidebar";

/**
 * root layout shared by every route
 */
export default function Root() {
  useQuitShortcut();
  useSidebarShortcut();
  useOpenAccountEvent();

  return (
    <>
      <div className="flex h-full flex-col bg-background">
        <Titlebar />

        <div className="flex min-h-0 flex-1">
          <AccountRail />

          <main className="flex min-w-0 flex-1 flex-col">
            <Outlet />
          </main>
        </div>
      </div>

      {/* requests can come from sessions in the background */}
      <PermissionPrompt />
    </>
  );
}
