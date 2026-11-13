import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import {
  EllipsisVerticalIcon,
  PencilIcon,
  QrCodeIcon,
  TrashIcon,
} from "lucide-react";
import { AccountDialog } from "@/components/shell/account-dialog";
import { PageHeader } from "@/components/shell/page-header";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { initials, removeAccount, useAccount } from "@/lib/accounts";

/**
 * view for a single account and its whatsapp session
 */
export default function Account() {
  const { id } = useParams();
  const account = useAccount(id);
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);

  if (!account) return <Navigate to="/" replace />;

  /**
   * remove the account and fall back to the landing route
   */
  function remove() {
    removeAccount(account!.id);
    navigate("/", { replace: true });
  }

  return (
    <>
      <PageHeader
        actions={
          <DropdownMenu>
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
        <div className="grid min-w-0 leading-tight">
          <span className="truncate text-sm font-medium">{account.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            Not linked
          </span>
        </div>
      </PageHeader>

      {/* the whatsapp web session for this account mounts here */}
      <section data-slot="session" className="flex min-h-0 flex-1">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <QrCodeIcon />
            </EmptyMedia>
            <EmptyTitle>Link this account</EmptyTitle>
            <EmptyDescription>
              The WhatsApp Web session for {account.name} will appear here once
              it's connected.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>

      <AccountDialog
        open={renaming}
        onOpenChange={setRenaming}
        account={account}
      />
    </>
  );
}
