import type { ComponentProps } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { clearSearch, setSearchQuery, useSearch } from "@/lib/search";
import { cn } from "@/lib/utils";

/**
 * search field shown in the titlebar, searching every session's chats
 *
 * escape empties it, every field shares the same search
 */
export function SearchField({
  className,
  onKeyDown,
  ...props
}: ComponentProps<"input">) {
  const { query } = useSearch();

  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search for people, messages or files..."
        aria-label="Search"
        autoComplete="off"
        spellCheck={false}
        className="h-8 pl-9"
        value={query}
        onChange={(event) => setSearchQuery(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") clearSearch();
          onKeyDown?.(event);
        }}
        {...props}
      />
    </div>
  );
}
