import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { EllipsisVerticalIcon, PencilIcon, TrashIcon } from "lucide-react";
import { AccountDialog } from "@/components/shell/account-dialog";
import { PageHeader } from "@/components/shell/page-header";
import { Session } from "@/components/shell/session";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  initials,
  rememberAccount,
  removeAccount,
  useAccount,
} from "@/lib/accounts";
import { removeSession, useOverlay } from "@/lib/session";

/**
 * view for a single account and its whatsapp session
 */
export default function Account() {
  const { id } = useParams();
  const account = useAccount(id);
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState(false);

  useOverlay(menu);

  useEffect(() => {
    if (account) rememberAccount(account.id);
  }, [account]);

  if (!account) return <Navigate to="/" replace />;

  /**
   * remove the account and fall back to the landing route
   */
  function remove() {
    removeSession(account!.id);
    removeAccount(account!.id);
    navigate("/", { replace: true });
  }

  return (
    <>
      <PageHeader
        actions={
          <DropdownMenu open={menu} onOpenChange={setMenu}>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Account options"
                />
              }
            >
              <EllipsisVerticalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setRenaming(true)}>
                <PencilIcon />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={remove}>
                <TrashIcon />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <Avatar>
          <AvatarFallback>{initials(account.name)}</AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-medium">{account.name}</span>
      </PageHeader>

      <Session id={account.id} />

      <AccountDialog
        open={renaming}
        onOpenChange={setRenaming}
        account={account}
      />
    </>
  );
}
