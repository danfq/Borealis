import type { ReactNode } from "react";

type PageHeaderProps = {
  children: ReactNode;

  /**
   * trailing actions aligned to the right
   */
  actions?: ReactNode;
};

/**
 * top bar shown above every page
 */
export function PageHeader({ children, actions }: PageHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </header>
  );
}
