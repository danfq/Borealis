import { useNavigate } from "react-router";
import { FileIcon, LoaderCircleIcon, SearchIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { initials, useAccounts } from "@/lib/accounts";
import {
  openSearchResult,
  useSearch,
  type SearchKind,
  type SearchResult,
} from "@/lib/search";

/**
 * sections of the results, in the order they are shown
 */
const GROUPS: { label: string; kinds: SearchKind[] }[] = [
  { label: "Chats", kinds: ["chat", "contact"] },
  { label: "Messages", kinds: ["message"] },
  { label: "Files", kinds: ["file"] },
];

/**
 * results of the search across every session, shown in place of the page
 * since the sessions would cover anything drawn above them
 */
export function SearchResults() {
  const { query, results, pending } = useSearch();
  const accounts = useAccounts();
  const navigate = useNavigate();

  // only worth telling accounts apart when there are several
  const names =
    accounts.length > 1
      ? new Map(accounts.map((account) => [account.id, account.name]))
      : null;

  const groups = GROUPS.map((group) => ({
    ...group,
    results: results
      .filter((result) => group.kinds.includes(result.kind))
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)),
  })).filter((group) => group.results.length > 0);

  /**
   * switch to the account and open the result there
   *
   * @param result picked result
   */
  function open(result: SearchResult) {
    navigate(`/accounts/${result.account}`);
    openSearchResult(result);
  }

  if (groups.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {pending ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <SearchIcon />
            )}
          </EmptyMedia>
          <EmptyTitle>{pending ? "Searching" : "No results"}</EmptyTitle>
          <EmptyDescription>
            {pending
              ? "Looking through the chats of every account."
              : `Nothing matches “${query.trim()}” in any account.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        {groups.map((group) => (
          <section key={group.label} className="flex flex-col gap-1">
            <h2 className="px-3 pb-1 text-xs font-medium text-muted-foreground">
              {group.label}
            </h2>

            {group.results.map((result) => (
              <ResultRow
                key={`${result.account}:${result.id}`}
                result={result}
                account={names?.get(result.account)}
                onOpen={() => open(result)}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

type ResultRowProps = {
  result: SearchResult;

  /**
   * name of the account it came from, when there are several
   */
  account?: string;
  onOpen: () => void;
};

/**
 * single result with its chat, snippet, account and time
 */
function ResultRow({ result, account, onOpen }: ResultRowProps) {
  const meta = [
    account,
    result.timestamp != null ? formatTime(result.timestamp) : null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left outline-none hover:bg-muted"
    >
      <Avatar>
        <AvatarFallback>{initials(result.title)}</AvatarFallback>
      </Avatar>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{result.title}</span>
        {result.subtitle && (
          <span className="flex items-center gap-1 truncate text-sm text-muted-foreground">
            {result.kind === "file" && (
              <FileIcon className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{result.subtitle}</span>
          </span>
        )}
      </span>

      {meta.length > 0 && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {meta.join(" · ")}
        </span>
      )}
    </button>
  );
}

/**
 * short time for a result, the hour today and the date otherwise
 *
 * @param seconds unix seconds
 *
 * @returns {string} formatted time
 */
function formatTime(seconds: number): string {
  const date = new Date(seconds * 1000);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}
