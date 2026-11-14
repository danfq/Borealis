import type { ComponentProps } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * search field shown in the titlebar
 *
 * filtering is wired up once there is something to search
 */
export function SearchField({ className, ...props }: ComponentProps<"input">) {
  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search for people, messages or files..."
        aria-label="Search"
        autoComplete="off"
        className="h-8 pl-9"
        {...props}
      />
    </div>
  );
}
