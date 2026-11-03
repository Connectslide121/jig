import { Plus, Settings2 } from "lucide-react";
import { Button } from "../../ui";
import { SettingRow, SettingsSection } from "../settings/parts";
import { needsSignIn, statusText, TenantAvatar } from "./parts";
import { openAddTenant, openManageTenants, useTenants } from "./store";

/** Settings → Azure: the tenant in use, and the same add and manage modals as the top bar chip. */
export function AzureSettings() {
  const state = useTenants((s) => s.state);
  const active = state?.tenants.find((t) => t.key === state.active);
  const added = (state?.tenants.length ?? 1) - 1;
  return (
    <SettingsSection
      title="Azure tenants"
      description="Which Azure and Azure DevOps sign-in Jig's views and the az it runs use. Each tenant you add signs in with the Azure CLI in a folder of its own; switch between them from the top bar."
    >
      <SettingRow
        label="In use"
        description={
          active
            ? [active.user, active.domain, needsSignIn(active) && statusText(active)]
                .filter(Boolean)
                .join(" · ") || "The Azure CLI as you left it"
            : " "
        }
      >
        <span className="flex w-48 min-w-0 items-center gap-2">
          <TenantAvatar tenant={active} />
          <span className="truncate">{active?.label ?? ""}</span>
        </span>
      </SettingRow>
      <SettingRow
        label="Tenants"
        description={
          added ? `${added} added in Jig, besides your own az login.` : "Only your own az login so far."
        }
      >
        <Button icon={Plus} onClick={openAddTenant} data-testid="settings-tenant-add">
          Add tenant…
        </Button>
        <Button icon={Settings2} onClick={openManageTenants} data-testid="settings-tenant-manage">
          Manage tenants…
        </Button>
      </SettingRow>
    </SettingsSection>
  );
}
