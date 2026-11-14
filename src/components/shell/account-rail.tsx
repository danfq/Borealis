import {
  useCallback,
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
  SearchIcon,
  SettingsIcon,
} from "lucide-react";
import { AccountDialog } from "@/components/shell/account-dialog";
import { SearchField } from "@/components/shell/search";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  initials,
  removeAccount,
  renameAccount,
  useAccounts,
  type Account,
} from "@/lib/accounts";
import { clearSearch, useSearch, useSearchFocus } from "@/lib/search";
import { removeSession } from "@/lib/session";
import { useSettings, type Rail } from "@/lib/settings";
import { SIDEBAR_SHORTCUT, toggleSidebar, useSidebar } from "@/lib/sidebar";
import { useUnread } from "@/lib/unread";
import { cn } from "@/lib/utils";

/**
 * shared look of every rail entry, icons keep their place when collapsing
 */
const ITEM =
  "group/item flex shrink-0 items-center gap-3 rounded-full text-left outline-none";

/**
 * dims entry contents until hovered or active, badges stay at full strength
 */
const DIM =
  "opacity-60 transition-opacity group-hover/item:opacity-100 group-data-[active=true]/item:opacity-100";

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

  // sits inside the titlebar, which draws the background and border
  if (rail === "topbar") {
    return (
      <nav className="flex h-full min-w-0 flex-1 items-center gap-2">
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

        <TopbarSearch />

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

  /**
   * count shown in a badge, hidden at 0
   */
  badge?: number;
  children: ReactNode;
};

/**
 * icon slot, the label shown next to it and an optional count badge
 */
function Entry({ label, layout, labelled, badge = 0, children }: EntryProps) {
  const count = badge > 0 && (
    <Badge
      aria-label={`${badge} unread`}
      className={cn(
        labelled
          ? layout === "sidebar" && "mr-3"
          : "absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[0.625rem] ring-2 ring-sidebar",
      )}
    >
      {badge > 99 ? "99+" : badge}
    </Badge>
  );

  return (
    <>
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center",
          SLOT[layout],
        )}
      >
        <span className={cn("flex items-center justify-center", DIM)}>
          {children}
        </span>
        {!labelled && count}
      </span>
      {labelled && (
        <span
          className={cn(
            "min-w-0 truncate text-sm font-medium",
            layout === "sidebar" ? "flex-1" : "max-w-40",
            DIM,
          )}
        >
          {label}
        </span>
      )}
      {labelled && count}
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
  const unread = useUnread(account.id);
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
      badge={unread}
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

/**
 * search tucked behind a button, the field slides open next to it
 */
function TopbarSearch() {
  const { query } = useSearch();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  /**
   * empty the field and slide it shut
   */
  function close() {
    clearSearch();
    setOpen(false);
  }

  /**
   * slide the field open, or shut when it already is
   */
  function toggle() {
    if (open) return close();

    setOpen(true);
    ref.current?.focus();
  }

  useSearchFocus(
    useCallback(() => {
      setOpen(true);
      ref.current?.focus();
      ref.current?.select();
    }, []),
  );

  // picking a result empties the search from elsewhere, so slide shut too
  useEffect(() => {
    if (!query && document.activeElement !== ref.current) setOpen(false);
  }, [query]);

  return (
    <div className="flex shrink-0 items-center">
      <div
        data-open={open}
        className="w-0 overflow-hidden opacity-0 transition-[width,opacity] duration-200 ease-out data-[open=true]:w-96 data-[open=true]:opacity-100"
      >
        <SearchField
          ref={ref}
          tabIndex={open ? undefined : -1}
          className="w-96 pr-2"
          onBlur={(event) => !event.currentTarget.value && close()}
          onKeyDown={(event) => event.key === "Escape" && close()}
        />
      </div>

      <RailButton
        label="Search"
        layout="topbar"
        labelled={false}
        pressed={open}
        onClick={toggle}
      >
        <SearchIcon className="size-5" />
      </RailButton>
    </div>
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
  badge,
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
        data-active={active}
        onContextMenu={onContextMenu}
        className={cn(
          ITEM,
          SIZE[layout],
          layout === "topbar" && labelled && "pr-3",
        )}
      >
        <Entry label={label} layout={layout} labelled={labelled} badge={badge}>
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

  /**
   * toggle state, shown at full opacity while pressed
   */
  pressed?: boolean;
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
  pressed,
  onClick,
  children,
}: RailButtonProps) {
  return (
    <div className={WRAPPER[layout]}>
      <button
        type="button"
        aria-label={labelled ? undefined : label}
        aria-pressed={pressed}
        data-active={pressed}
        onClick={onClick}
        // focus stays put, so the search field doesn't blur shut before its toggle runs
        onMouseDown={(event) => event.preventDefault()}
        className={cn(ITEM, SIZE[layout])}
      >
        <Entry label={label} layout={layout} labelled={labelled}>
          {children}
        </Entry>
        {labelled && hint && (
          <span className={cn("pr-3 text-xs text-muted-foreground", DIM)}>
            {hint}
          </span>
        )}
      </button>
    </div>
  );
}
