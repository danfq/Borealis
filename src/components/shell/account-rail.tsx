import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Link, useMatch, useNavigate } from "react-router";
import { isTauri } from "@tauri-apps/api/core";
import { Menu } from "@tauri-apps/api/menu";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { AccountDialog } from "@/components/shell/account-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  initials,
  removeAccount,
  renameAccount,
  useAccounts,
  type Account,
} from "@/lib/accounts";
import { removeSession } from "@/lib/session";
import { useSettings, type Rail } from "@/lib/settings";
import { SIDEBAR_SHORTCUT, toggleSidebar, useSidebar } from "@/lib/sidebar";
import { cn } from "@/lib/utils";

/**
 * shared look of every rail entry, icons keep their place when collapsing
 */
const ITEM =
  "flex shrink-0 items-center gap-3 rounded-full text-left transition-opacity outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

/**
 * entry size for each layout
 */
const SIZE: Record<Rail, string> = {
  sidebar: "h-10 w-full",
  topbar: "h-9",
};

/**
 * icon slot for each layout
 */
const SLOT: Record<Rail, string> = {
  sidebar: "size-10",
  topbar: "size-9",
};

/**
 * box around an entry, holding the active indicator
 */
const WRAPPER: Record<Rail, string> = {
  sidebar: "relative flex w-full shrink-0 px-3",
  topbar: "relative flex h-full shrink-0 items-center",
};

/**
 * active indicator, on the leading edge of the sidebar and spanning the width
 * of topbar entries like a tab underline
 */
const INDICATOR: Record<Rail, string> = {
  sidebar:
    "top-1/2 left-0 h-6 w-1 -translate-y-1/2 scale-y-0 rounded-r-full data-[active=true]:scale-y-100",
  topbar:
    "inset-x-0 bottom-0 h-1 scale-x-0 rounded-t-full data-[active=true]:scale-x-100",
};

/**
 * rail used to switch between accounts, either a collapsible sidebar or a topbar
 */
export function AccountRail() {
  const accounts = useAccounts();
  const { rail } = useSettings();
  const sidebar = useSidebar();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string>();

  // names show while renaming so the field has room
  const expanded = sidebar || renaming !== undefined;

  const items = accounts.map((account) => (
    <AccountItem
      key={account.id}
      account={account}
      layout={rail}
      labelled={rail === "topbar" || expanded}
      renaming={renaming === account.id}
      onRename={() => setRenaming(account.id)}
      onRenameEnd={() => setRenaming(undefined)}
    />
  ));

  const dialog = <AccountDialog open={adding} onOpenChange={setAdding} />;

  if (rail === "topbar") {
    return (
      <nav className="flex h-12 shrink-0 items-center gap-2 border-b bg-sidebar px-3 text-sidebar-foreground">
        <div className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {items}

          <RailButton
            label="Add account"
            layout="topbar"
            labelled={false}
            onClick={() => setAdding(true)}
          >
            <PlusIcon className="size-5" />
          </RailButton>
        </div>

        <Separator orientation="vertical" className="my-3" />

        <RailItem
          to="/settings"
          label="Settings"
          layout="topbar"
          labelled={false}
        >
          <SettingsIcon className="size-5" />
        </RailItem>

        {dialog}
      </nav>
    );
  }

  return (
    <nav
      data-expanded={expanded}
      className={cn(
        "flex shrink-0 flex-col gap-3 border-r bg-sidebar py-3 text-sidebar-foreground",
        expanded ? "w-60" : "w-16",
      )}
    >
      <div className="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-y-auto">
        {items}

        <RailButton
          label="Add account"
          layout="sidebar"
          labelled={expanded}
          onClick={() => setAdding(true)}
        >
          <PlusIcon className="size-5" />
        </RailButton>
      </div>

      <div className="px-3">
        <Separator />
      </div>

      <RailItem
        to="/settings"
        label="Settings"
        layout="sidebar"
        labelled={expanded}
      >
        <SettingsIcon className="size-5" />
      </RailItem>

      <RailButton
        label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        hint={SIDEBAR_SHORTCUT}
        layout="sidebar"
        labelled={expanded}
        onClick={toggleSidebar}
      >
        {expanded ? (
          <PanelLeftCloseIcon className="size-5" />
        ) : (
          <PanelLeftOpenIcon className="size-5" />
        )}
      </RailButton>

      {dialog}
    </nav>
  );
}

type EntryProps = {
  label: string;
  layout: Rail;

  /**
   * show the label next to the icon
   */
  labelled: boolean;
  children: ReactNode;
};

/**
 * icon slot and the label shown next to it
 */
function Entry({ label, layout, labelled, children }: EntryProps) {
  return (
    <>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center",
          SLOT[layout],
        )}
      >
        {children}
      </span>
      {labelled && (
        <span
          className={cn(
            "min-w-0 truncate text-sm font-medium",
            layout === "sidebar" ? "flex-1" : "max-w-40 pr-3",
          )}
        >
          {label}
        </span>
      )}
    </>
  );
}

type AccountItemProps = {
  account: Account;
  layout: Rail;
  labelled: boolean;

  /**
   * show the rename field in place of the link
   */
  renaming: boolean;
  onRename: () => void;
  onRenameEnd: () => void;
};

/**
 * rail link to an account with its options on right click
 */
function AccountItem({
  account,
  layout,
  labelled,
  renaming,
  onRename,
  onRenameEnd,
}: AccountItemProps) {
  const to = `/accounts/${account.id}`;
  const active = useMatch(to) !== null;
  const navigate = useNavigate();
  const menu = useRef<Menu>(undefined);

  useEffect(() => () => void menu.current?.close(), []);

  /**
   * remove the account and leave its route when it is open
   */
  function remove() {
    removeSession(account.id);
    removeAccount(account.id);

    if (active) navigate("/", { replace: true });
  }

  /**
   * show the account options in a native menu, which is drawn above the
   * session so it doesn't have to be hidden
   *
   * @param event context menu event
   */
  async function openMenu(event: MouseEvent) {
    event.preventDefault();

    if (!isTauri()) return;

    // the previous menu is done once another one opens
    await menu.current?.close();

    menu.current = await Menu.new({
      items: [
        { text: "Rename", action: onRename },
        { item: "Separator" },
        { text: "Remove", action: remove },
      ],
    });

    await menu.current.popup();
  }

  const avatar = (
    <Avatar size={layout === "sidebar" ? "lg" : "default"}>
      <AvatarFallback>{initials(account.name)}</AvatarFallback>
    </Avatar>
  );

  // renamed in place, a dialog would have to hide the session
  if (renaming) {
    return (
      <div className={WRAPPER[layout]}>
        <div className={cn(ITEM, SIZE[layout])}>
          <span
            className={cn(
              "flex shrink-0 items-center justify-center",
              SLOT[layout],
            )}
          >
            {avatar}
          </span>
          <RenameField
            account={account}
            onDone={onRenameEnd}
            className={layout === "sidebar" ? "flex-1" : "w-40"}
          />
        </div>
      </div>
    );
  }

  return (
    <RailItem
      to={to}
      label={account.name}
      layout={layout}
      labelled={labelled}
      onContextMenu={openMenu}
    >
      {avatar}
    </RailItem>
  );
}

type RenameFieldProps = {
  account: Account;
  onDone: () => void;
  className?: string;
};

/**
 * inline account name field, enter or leaving it saves and escape cancels
 */
function RenameField({ account, onDone, className }: RenameFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  /**
   * leave the field, saving the name when asked to
   *
   * @param save whether to keep the new name
   */
  function finish(save: boolean) {
    if (done.current) return;
    done.current = true;

    const name = ref.current?.value.trim();

    if (save && name && name !== account.name) renameAccount(account.id, name);

    onDone();
  }

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();

    // the session may still hold the keyboard after the native menu
    if (isTauri()) {
      getCurrentWebview()
        .setFocus()
        .catch((error) => console.error("setFocus", error));
    }

    // clicking into the session only blurs the window, not the field
    const onBlur = () => finish(true);
    window.addEventListener("blur", onBlur);

    // runs once per rename, finish reads the latest name from the field
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  return (
    <Input
      ref={ref}
      aria-label="Account name"
      defaultValue={account.name}
      autoComplete="off"
      spellCheck={false}
      className={cn("h-8 px-3", className)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(true);
        if (event.key === "Escape") finish(false);
      }}
    />
  );
}

type RailItemProps = EntryProps & {
  to: string;
  onContextMenu?: (event: MouseEvent) => void;
};

/**
 * rail link with an active indicator
 */
function RailItem({
  to,
  label,
  layout,
  labelled,
  onContextMenu,
  children,
}: RailItemProps) {
  const active = useMatch(to) !== null;

  return (
    <div className={WRAPPER[layout]}>
      <span
        data-active={active}
        className={cn(
          "absolute bg-sidebar-foreground transition-transform",
          INDICATOR[layout],
        )}
      />

      <Link
        to={to}
        aria-label={labelled ? undefined : label}
        aria-current={active ? "page" : undefined}
        onContextMenu={onContextMenu}
        className={cn(
          ITEM,
          SIZE[layout],
          active ? "opacity-100" : "opacity-60 hover:opacity-100",
        )}
      >
        <Entry label={label} layout={layout} labelled={labelled}>
          {children}
        </Entry>
      </Link>
    </div>
  );
}

type RailButtonProps = EntryProps & {
  /**
   * shortcut shown at the end while labelled
   */
  hint?: string;
  onClick: () => void;
};

/**
 * rail action styled like the links
 */
function RailButton({
  label,
  hint,
  layout,
  labelled,
  onClick,
  children,
}: RailButtonProps) {
  return (
    <div className={WRAPPER[layout]}>
      <button
        type="button"
        aria-label={labelled ? undefined : label}
        onClick={onClick}
        className={cn(ITEM, SIZE[layout], "opacity-60 hover:opacity-100")}
      >
        <Entry label={label} layout={layout} labelled={labelled}>
          {children}
        </Entry>
        {labelled && hint && (
          <span className="pr-3 text-xs text-muted-foreground">{hint}</span>
        )}
      </button>
    </div>
  );
}
