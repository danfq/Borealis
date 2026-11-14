import { Outlet } from "react-router";
import { AccountRail } from "@/components/shell/account-rail";
import { PermissionPrompt } from "@/components/shell/permission-prompt";
import { SearchResults } from "@/components/shell/search-results";
import { Titlebar } from "@/components/shell/titlebar";
import { useAccountShortcuts, useOpenAccountEvent } from "@/lib/accounts";
import { useQuitShortcut, useSettingsShortcut } from "@/lib/app";
import { useSearch, useSearchShortcut } from "@/lib/search";
import { useStartSessions } from "@/lib/session";
import { useSettings } from "@/lib/settings";
import { useSidebarShortcut } from "@/lib/sidebar";

/**
 * root layout shared by every route
 */
export default function Root() {
  const { rail } = useSettings();
  const topbar = rail === "topbar";
  const searching = useSearch().query.trim() !== "";

  useQuitShortcut();
  useSidebarShortcut(!topbar);
  useOpenAccountEvent();
  useAccountShortcuts();
  useSearchShortcut();
  useSettingsShortcut();
  useStartSessions();

  return (
    <>
      <div className="flex h-full flex-col bg-background">
        {/* the topbar lives in the titlebar, the sidebar next to the page */}
        {topbar ? (
          <Titlebar>
            <AccountRail />
          </Titlebar>
        ) : (
          <Titlebar />
        )}

        <div className="flex min-h-0 flex-1">
          {!topbar && <AccountRail />}

          {/* results take the page's place, the session would cover them */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            {searching ? <SearchResults /> : <Outlet />}
          </main>
        </div>
      </div>

      {/* requests can come from sessions in the background */}
      <PermissionPrompt />
    </>
  );
}
