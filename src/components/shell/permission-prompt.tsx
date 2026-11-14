import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAccounts } from "@/lib/accounts";
import { useOverlay } from "@/lib/session";
import { PERMISSIONS, setPolicy, type Permission } from "@/lib/settings";

/**
 * permission request held by the backend until it is answered
 */
type Request = {
  id: number;
  account: string;
  permissions: Permission[];
};

/**
 * asks the user about permissions set to ask in the settings
 *
 * linux routes every request here and macos its notifications, other
 * requests are prompted natively
 */
export function PermissionPrompt() {
  const accounts = useAccounts();
  const [requests, setRequests] = useState<Request[]>([]);
  const [remember, setRemember] = useState(false);

  // one request at a time, oldest first
  const request = requests[0];
  const account = accounts.find((account) => account.id === request?.account);

  useOverlay(request !== undefined);

  useEffect(() => {
    if (!isTauri()) return;

    const unlisten = listen<Request>("permission-request", (event) =>
      setRequests((requests) => [...requests, event.payload]),
    );

    return () => void unlisten.then((unlisten) => unlisten());
  }, []);

  /**
   * answer the current request and move on to the next one
   *
   * @param allow whether the permissions are granted
   */
  function answer(allow: boolean) {
    if (!request) return;

    if (remember) {
      for (const permission of request.permissions) {
        setPolicy(permission, allow ? "allow" : "deny");
      }
    }

    invoke("answer_permission", { id: request.id, allow }).catch((error) =>
      console.error("answer_permission", error),
    );

    setRemember(false);
    setRequests((requests) => requests.slice(1));
  }

  return (
    <Dialog
      open={request !== undefined}
      onOpenChange={(open) => !open && answer(false)}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Allow access?</DialogTitle>
          <DialogDescription>
            WhatsApp
            {account ? ` in ${account.name}` : ""} is asking to use the
            following.
          </DialogDescription>
        </DialogHeader>

        <ul className="grid gap-2">
          {request?.permissions.map((permission) => {
            const { label, icon: Icon } = PERMISSIONS[permission];

            return (
              <li key={permission} className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-muted">
                  <Icon className="size-4" />
                </span>
                <span className="font-medium">{label}</span>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-2">
          <Checkbox
            id="permission-remember"
            checked={remember}
            onCheckedChange={setRemember}
          />
          <Label htmlFor="permission-remember">Remember for all accounts</Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => answer(false)}>
            Deny
          </Button>
          <Button onClick={() => answer(true)}>Allow</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
