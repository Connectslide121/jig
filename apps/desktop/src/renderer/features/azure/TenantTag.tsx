import { DEFAULT_TENANT, type TenantTag, tenantInitials } from "../../../shared/azure";
import { cn } from "../../ui";
import { useTenants } from "./store";

/**
 * The tenant a chat or terminal started with, while it isn't the active one (D-285): its `az` keeps
 * that tenant's sign-in. Renders nothing otherwise, so it lives in space its row already reserves.
 */
export function useOtherTenant(tag: TenantTag | undefined) {
  const state = useTenants((s) => s.state);
  if (!tag || !state || tag.key === state.active) return undefined;
  const view = state.tenants.find((t) => t.key === tag.key);
  const active = state.tenants.find((t) => t.key === state.active);
  return {
    label: view?.label ?? tag.label,
    initials: view
      ? tenantInitials(view)
      : tenantInitials({ label: tag.label, isDefault: tag.key === DEFAULT_TENANT }),
    title: `Started with the Azure tenant ${view?.label ?? tag.label}: its az still uses that sign-in${
      active ? ` (the top bar is on ${active.label})` : ""
    }.`,
  };
}

/** Initials and the tenant's name: for a header (the chat's). */
export function TenantTagLabel({ tag, className }: { tag: TenantTag | undefined; className?: string }) {
  const other = useOtherTenant(tag);
  if (!other) return null;
  return (
    <span
      className={cn("flex min-w-0 items-center gap-1.5 text-2xs text-muted", className)}
      title={other.title}
      data-testid="tenant-tag"
    >
      <Initials text={other.initials} />
      <span className="truncate">{other.label}</span>
    </span>
  );
}

/** Just the initials: for a narrow row (a terminal tab). */
export function TenantTagMark({ tag }: { tag: TenantTag | undefined }) {
  const other = useOtherTenant(tag);
  if (!other) return null;
  return (
    <span title={other.title} className="flex shrink-0" data-testid="tenant-tag">
      <Initials text={other.initials} />
    </span>
  );
}

function Initials({ text }: { text: string }) {
  return (
    <span
      aria-hidden
      className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent"
    >
      {text}
    </span>
  );
}
