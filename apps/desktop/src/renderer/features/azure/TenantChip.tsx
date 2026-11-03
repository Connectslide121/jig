import { Plus, Settings2 } from "lucide-react";
import { useEffect } from "react";
import { DEFAULT_TENANT_LABEL } from "../../../shared/azure";
import { errorMessage } from "../../lib/host";
import { type MenuEntry, openMenuAt, switchMenuAt, Tooltip } from "../../ui";
import { useActiveProject } from "../../workbench/projects";
import { AddTenantDialog, ManageTenantsDialog } from "./dialogs";
import { needsSignIn, statusText, TenantAvatar, TenantMark } from "./parts";
import { openAddTenant, openManageTenants, startTenants, switchTenant, useTenants } from "./store";

function tenantMenu(): MenuEntry[] {
  const state = useTenants.getState().state;
  return [
    { heading: "Azure tenant" },
    ...(state?.tenants ?? []).map(
      (t): MenuEntry => ({
        label: t.label,
        avatar: <TenantAvatar tenant={t} />,
        columns: [t.user ?? "", t.domain ?? ""],
        mark: <TenantMark tenant={t} active={t.key === state?.active} />,
        testId: `tenant-item-${t.key}`,
        onSelect: () => void switchTenant(t.key).catch((e) => console.warn(errorMessage(e))),
      }),
    ),
    { separator: true },
    { label: "Add tenant…", icon: Plus, testId: "tenant-add", onSelect: openAddTenant },
    { label: "Manage tenants…", icon: Settings2, testId: "tenant-manage", onSelect: openManageTenants },
  ];
}

/**
 * The tenant switch at the far right of the top bar (D-283): which Azure / Azure DevOps sign-in
 * Jig's views and `az` use, as the tenant's initials in an avatar of a fixed size (the name, user and
 * domain are in its tooltip), so nothing moves when the tenants load or another one is picked. It
 * hosts the add and manage modals.
 */
export function TenantChip({ menuBar }: { menuBar: string }) {
  const state = useTenants((s) => s.state);
  useEffect(startTenants, []);
  const active = state?.tenants.find((t) => t.key === state.active);
  // The active project pinned this tenant (D-286): switching to it switched here.
  const project = useActiveProject();
  const pinnedBy = project?.azureTenant && project.azureTenant === active?.key ? project.name : undefined;
  const open = (el: HTMLElement) => openMenuAt(el, tenantMenu(), true, menuBar);
  const tip = active && (
    <div className="flex flex-col gap-0.5 py-0.5">
      <span className="font-medium">{active.label}</span>
      <span className="text-muted">
        {active.user ?? (active.isDefault ? "The Azure CLI as you left it" : "")}
      </span>
      {active.domain && <span className="text-muted">{active.domain}</span>}
      {pinnedBy && <span className="text-muted">Pinned by the project {pinnedBy}</span>}
      {needsSignIn(active) && <span className="text-warning">{statusText(active)}: sign in again</span>}
    </div>
  );
  return (
    <>
      <Tooltip content={tip ?? "Azure tenant"}>
        <span className="no-drag flex shrink-0">
          <button
            type="button"
            data-testid="tenant-switcher"
            aria-haspopup="menu"
            aria-label={`Azure tenant: ${active?.label ?? DEFAULT_TENANT_LABEL}`}
            className="relative flex size-8 items-center justify-center rounded-full hover:bg-hover"
            onClick={(e) => open(e.currentTarget)}
            onMouseEnter={(e) => switchMenuAt(e.currentTarget, tenantMenu(), menuBar, true)}
          >
            <TenantAvatar tenant={active} className="size-6" />
            {active && needsSignIn(active) && (
              <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-warning ring-2 ring-titlebar" />
            )}
          </button>
        </span>
      </Tooltip>
      <AddTenantDialog />
      <ManageTenantsDialog />
    </>
  );
}
