import { useState, type ReactNode } from "react";
import { Link, useMatch } from "react-router";
import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { AccountDialog } from "@/components/shell/account-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { initials, useAccounts } from "@/lib/accounts";
import { SIDEBAR_SHORTCUT, toggleSidebar, useSidebar } from "@/lib/sidebar";
import { cn } from "@/lib/utils";

/**
 * shared look of every sidebar entry, icons keep their place when collapsing
 */
const ITEM =
  "flex h-10 w-full items-center gap-3 rounded-full text-left transition-opacity outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

/**
 * collapsible sidebar used to switch between accounts
 */
export function AccountRail() {
  const accounts = useAccounts();
  const expanded = useSidebar();
  const [adding, setAdding] = useState(false);

  return (
    <nav
      data-expanded={expanded}
      className={cn(
        "flex shrink-0 flex-col gap-3 border-r bg-sidebar py-3 text-sidebar-foreground",
        expanded ? "w-60" : "w-16",
      )}
    >
      <div className="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-y-auto">
        {accounts.map((account) => (
          <RailItem
            key={account.id}
            to={`/accounts/${account.id}`}
            label={account.name}
            expanded={expanded}
          >
            <Avatar size="lg">
              <AvatarFallback>{initials(account.name)}</AvatarFallback>
            </Avatar>
          </RailItem>
        ))}

        <RailButton
          label="Add account"
          expanded={expanded}
          onClick={() => setAdding(true)}
        >
          <PlusIcon className="size-5" />
        </RailButton>
      </div>

      <div className="px-3">
        <Separator />
      </div>

      <RailItem to="/settings" label="Settings" expanded={expanded}>
        <SettingsIcon className="size-5" />
      </RailItem>

      <RailButton
        label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        hint={SIDEBAR_SHORTCUT}
        expanded={expanded}
        onClick={toggleSidebar}
      >
        {expanded ? (
          <PanelLeftCloseIcon className="size-5" />
        ) : (
          <PanelLeftOpenIcon className="size-5" />
        )}
      </RailButton>

      <AccountDialog open={adding} onOpenChange={setAdding} />
    </nav>
  );
}

type EntryProps = {
  label: string;
  expanded: boolean;
  children: ReactNode;
};

/**
 * icon slot and the label shown while expanded
 */
function Entry({ label, expanded, children }: EntryProps) {
  return (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center">
        {children}
      </span>
      {expanded && (
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {label}
        </span>
      )}
    </>
  );
}

type RailItemProps = EntryProps & {
  to: string;
};

/**
 * sidebar link with an active indicator
 */
function RailItem({ to, label, expanded, children }: RailItemProps) {
  const active = useMatch(to) !== null;

  return (
    <div className="relative flex w-full shrink-0 px-3">
      <span
        data-active={active}
        className="absolute top-1/2 left-0 h-6 w-1 -translate-y-1/2 scale-y-0 rounded-r-full bg-sidebar-foreground transition-transform data-[active=true]:scale-y-100"
      />

      <Link
        to={to}
        aria-label={expanded ? undefined : label}
        aria-current={active ? "page" : undefined}
        className={cn(
          ITEM,
          active ? "opacity-100" : "opacity-60 hover:opacity-100",
        )}
      >
        <Entry label={label} expanded={expanded}>
          {children}
        </Entry>
      </Link>
    </div>
  );
}

type RailButtonProps = EntryProps & {
  /**
   * shortcut shown at the end while expanded
   */
  hint?: string;
  onClick: () => void;
};

/**
 * sidebar action styled like the links
 */
function RailButton({
  label,
  hint,
  expanded,
  onClick,
  children,
}: RailButtonProps) {
  return (
    <div className="flex w-full shrink-0 px-3">
      <button
        type="button"
        aria-label={expanded ? undefined : label}
        onClick={onClick}
        className={cn(ITEM, "opacity-60 hover:opacity-100")}
      >
        <Entry label={label} expanded={expanded}>
          {children}
        </Entry>
        {expanded && hint && (
          <span className="pr-3 text-xs text-muted-foreground">{hint}</span>
        )}
      </button>
    </div>
  );
}
