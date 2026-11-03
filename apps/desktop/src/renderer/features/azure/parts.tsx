import { Check, CircleAlert } from "lucide-react";
import { type TenantView, tenantInitials } from "../../../shared/azure";
import { cn } from "../../ui";

/** Whether a tenant's sign-in needs doing again (`az login`). */
export const needsSignIn = (t: TenantView) => t.status === "expired" || t.status === "signedOut";

export function statusText(t: TenantView): string {
  if (t.status === "expired") return "Sign-in expired";
  if (t.status === "signedOut") return "Signed out";
  if (t.status === "unknown") return "Not checked yet";
  return "Signed in";
}

/** A tenant's initials in a round avatar, the same in the top bar, its menu and the manage modal. */
export function TenantAvatar({ tenant, className }: { tenant: TenantView | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent",
        className,
      )}
    >
      {tenant ? tenantInitials(tenant) : ""}
    </span>
  );
}

/**
 * The far-right status mark: a warning when the sign-in must be done again, else a check on the
 * active tenant. One column, so the marks form one line however long the names are.
 */
export function TenantMark({ tenant, active }: { tenant: TenantView; active: boolean }) {
  if (needsSignIn(tenant))
    return (
      <span title={`${statusText(tenant)}${active ? " (in use)" : ""}`} className="flex">
        <CircleAlert className="size-3.5 text-warning" aria-label={statusText(tenant)} />
      </span>
    );
  if (active) return <Check className="size-3.5 text-accent" aria-label="In use" />;
  return null;
}
