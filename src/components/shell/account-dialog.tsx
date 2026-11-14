import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addAccount, renameAccount, type Account } from "@/lib/accounts";
import { useOverlay } from "@/lib/session";

type AccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /**
   * account to rename, omit to add a new one
   */
  account?: Account;
};

/**
 * dialog used to add or rename an account
 */
export function AccountDialog({
  open,
  onOpenChange,
  account,
}: AccountDialogProps) {
  useOverlay(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* mounted per open so the form always starts fresh */}
        <AccountForm account={account} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type AccountFormProps = {
  account?: Account;
  onDone: () => void;
};

/**
 * name form shown inside the account dialog
 */
function AccountForm({ account, onDone }: AccountFormProps) {
  const navigate = useNavigate();
  const [name, setName] = useState(account?.name ?? "");

  /**
   * save the account and close the dialog
   *
   * @param event form submit event
   */
  function submit(event: FormEvent) {
    event.preventDefault();

    if (!name.trim()) return;

    if (account) {
      renameAccount(account.id, name);
    } else {
      navigate(`/accounts/${addAccount(name).id}`);
    }

    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <DialogHeader>
        <DialogTitle>{account ? "Rename account" : "Add account"}</DialogTitle>
        <DialogDescription>
          {account
            ? "Choose a new name for this account."
            : "Give the account a name. You'll link it to WhatsApp next."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="account-name">Name</Label>
        <Input
          id="account-name"
          autoFocus
          autoComplete="off"
          placeholder="Personal"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </div>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!name.trim()}>
          {account ? "Save" : "Add account"}
        </Button>
      </DialogFooter>
    </form>
  );
}
