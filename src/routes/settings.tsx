import { SettingsIcon } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * app wide settings
 */
export default function Settings() {
  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-medium">Settings</h1>
      </PageHeader>

      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SettingsIcon />
          </EmptyMedia>
          <EmptyTitle>Nothing to configure yet</EmptyTitle>
          <EmptyDescription>
            App preferences will show up here as they're added.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}
