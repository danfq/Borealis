import { useState } from "react";
import { Navigate } from "react-router";
import { MessageCircleIcon, PlusIcon } from "lucide-react";
import { AccountDialog } from "@/components/shell/account-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useAccounts } from "@/lib/accounts";

/**
 * landing route, opens the first account or prompts to add one
 */
export default function Home() {
  const accounts = useAccounts();
  const [adding, setAdding] = useState(false);

  if (accounts[0])
    return <Navigate to={`/accounts/${accounts[0].id}`} replace />;

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessageCircleIcon />
        </EmptyMedia>
        <EmptyTitle>No accounts yet</EmptyTitle>
        <EmptyDescription>
          Add a WhatsApp account to get started. You can add as many as you need
          and switch between them from the sidebar.
        </EmptyDescription>
      </EmptyHeader>

      <EmptyContent>
        <Button onClick={() => setAdding(true)}>
          <PlusIcon data-icon="inline-start" />
          Add account
        </Button>
      </EmptyContent>

      <AccountDialog open={adding} onOpenChange={setAdding} />
    </Empty>
  );
}
