import { useState, type ReactNode } from "react";
import { Link, useMatch } from "react-router";
import { PlusIcon, SettingsIcon } from "lucide-react";
import { AccountDialog } from "@/components/shell/account-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { initials, useAccounts } from "@/lib/accounts";
import { cn } from "@/lib/utils";

/**
 * vertical rail used to switch between accounts
 */
export function AccountRail() {
  const accounts = useAccounts();
  const [adding, setAdding] = useState(false);

  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-3 border-r bg-sidebar py-3 text-sidebar-foreground">
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto">
        {accounts.map((account) => (
          <RailItem
            key={account.id}
            to={`/accounts/${account.id}`}
            label={account.name}
          >
            <Avatar size="lg">
              <AvatarFallback>{initials(account.name)}</AvatarFallback>
            </Avatar>
          </RailItem>
        ))}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label="Add account"
                onClick={() => setAdding(true)}
              />
            }
          >
            <PlusIcon />
          </TooltipTrigger>
          <TooltipContent side="right">Add account</TooltipContent>
        </Tooltip>
      </div>

      <Separator className="w-8!" />

      <RailItem to="/settings" label="Settings">
        <SettingsIcon className="size-5" />
      </RailItem>

      <AccountDialog open={adding} onOpenChange={setAdding} />
    </nav>
  );
}

type RailItemProps = {
  to: string;
  label: string;
  children: ReactNode;
};

/**
 * rail link with an active indicator and tooltip
 */
function RailItem({ to, label, children }: RailItemProps) {
  const active = useMatch(to) !== null;

  return (
    <div className="relative flex w-full shrink-0 justify-center">
      <span
        data-active={active}
        className="absolute top-1/2 left-0 h-6 w-1 -translate-y-1/2 scale-y-0 rounded-r-full bg-sidebar-foreground transition-transform data-[active=true]:scale-y-100"
      />

      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              to={to}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex size-10 items-center justify-center rounded-full transition-opacity outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                active ? "opacity-100" : "opacity-60 hover:opacity-100",
              )}
            />
          }
        >
          {children}
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </div>
  );
}
