import { useEffect } from "react";
import { Navigate, useParams } from "react-router";
import { Session } from "@/components/shell/session";
import { rememberAccount, useAccount } from "@/lib/accounts";

/**
 * view for a single account and its whatsapp session
 */
export default function Account() {
  const { id } = useParams();
  const account = useAccount(id);

  useEffect(() => {
    if (account) rememberAccount(account.id);
  }, [account]);

  if (!account) return <Navigate to="/" replace />;

  return <Session id={account.id} />;
}
