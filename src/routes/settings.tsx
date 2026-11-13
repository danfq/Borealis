import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { quit } from "@/lib/app";
import { isMac } from "@/lib/extras/platform";
import {
  PERMISSIONS,
  setPolicy,
  updateSettings,
  useSettings,
  type Permission,
  type Policy,
} from "@/lib/settings";

/**
 * choices offered for every permission
 */
const POLICIES: { value: Policy; label: string }[] = [
  { value: "ask", label: "Ask" },
  { value: "allow", label: "Allow" },
  { value: "deny", label: "Deny" },
];

/**
 * app wide settings
 */
export default function Settings() {
  const settings = useSettings();

  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-medium">Settings</h1>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <FieldGroup className="mx-auto max-w-2xl p-6">
          <FieldSet>
            <FieldLegend>General</FieldLegend>

            <FieldGroup>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="minimize-on-close">
                    Minimize on close
                  </FieldLabel>
                  <FieldDescription>
                    Keep Borealis running when the window is closed so you still
                    get notifications.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="minimize-on-close"
                  checked={settings.minimizeOnClose}
                  onCheckedChange={(minimizeOnClose) =>
                    updateSettings({ minimizeOnClose })
                  }
                />
              </Field>

              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Quit Borealis</FieldTitle>
                  <FieldDescription>
                    Close every session and exit. You can also press{" "}
                    {isMac ? "⌘Q" : "Ctrl+Q"}.
                  </FieldDescription>
                </FieldContent>
                <Button variant="outline" onClick={quit}>
                  Quit
                </Button>
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSeparator />

          <FieldSet>
            <FieldLegend>Permissions</FieldLegend>
            <FieldDescription>
              Choose what WhatsApp can use. Ask shows a prompt whenever it
              requests access.
            </FieldDescription>

            <FieldGroup>
              {(Object.keys(PERMISSIONS) as Permission[]).map((permission) => (
                <PolicyField
                  key={permission}
                  permission={permission}
                  policy={settings.permissions[permission]}
                />
              ))}
            </FieldGroup>
          </FieldSet>

          <FieldSeparator />

          <FieldSet>
            <FieldLegend>Downloads</FieldLegend>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="ask-download-location">
                  Ask where to save
                </FieldLabel>
                <FieldDescription>
                  Choose a location for every download. When off, files go to
                  your Downloads folder.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="ask-download-location"
                checked={settings.askDownloadLocation}
                onCheckedChange={(askDownloadLocation) =>
                  updateSettings({ askDownloadLocation })
                }
              />
            </Field>
          </FieldSet>
        </FieldGroup>
      </div>
    </>
  );
}

type PolicyFieldProps = {
  permission: Permission;
  policy: Policy;
};

/**
 * row picking the policy of a single permission
 */
function PolicyField({ permission, policy }: PolicyFieldProps) {
  const { label, description, icon: Icon } = PERMISSIONS[permission];
  const id = `permission-${permission}`;

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>
          <Icon className="size-4 text-muted-foreground" />
          {label}
        </FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Select
        items={POLICIES}
        value={policy}
        onValueChange={(value) => value && setPolicy(permission, value)}
      >
        <SelectTrigger id={id} className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {POLICIES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
