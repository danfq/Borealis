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
import { addAccount } from "@/lib/accounts";
import { useOverlay } from "@/lib/session";

type AccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * dialog used to add an account
 */
export function AccountDialog({ open, onOpenChange }: AccountDialogProps) {
  useOverlay(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* mounted per open so the form always starts fresh */}
        <AccountForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type AccountFormProps = {
  onDone: () => void;
};

/**
 * name form shown inside the account dialog
 */
function AccountForm({ onDone }: AccountFormProps) {
  const navigate = useNavigate();
  const [name, setName] = useState("");

  /**
   * add the account, open it and close the dialog
   *
   * @param event form submit event
   */
  function submit(event: FormEvent) {
    event.preventDefault();

    if (!name.trim()) return;

    navigate(`/accounts/${addAccount(name).id}`);
    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <DialogHeader>
        <DialogTitle>Add account</DialogTitle>
        <DialogDescription>
          Give the account a name. You'll link it to WhatsApp next.
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
          Add account
        </Button>
      </DialogFooter>
    </form>
  );
}
