import { AlertTriangle, ShieldAlert, X as XIcon } from "lucide-react";
import { useState } from "react";
import { useConfig } from "../stores/config";
import { IconButton } from "../ui";

/**
 * Says so when the launcher had to fall back after an update (Pull, build and restart) didn't start:
 * Jig runs its previous build, or — if that failed too — the new one in safe mode (docs/reference/setup.md).
 */
export function StartupBanner() {
  const info = useConfig((s) => s.info);
  const [hidden, setHidden] = useState(false);
  if (!info || hidden || (!info.safeMode && !info.startedAfterFailure)) return null;
  const Icon = info.safeMode ? ShieldAlert : AlertTriangle;
  const text = info.safeMode
    ? "Safe mode: the update didn't start, so your own add-ons are off. Check Jig's log, fix or revert the update in your clone, and restart."
    : "The update didn't start, so Jig started its previous build. Check Jig's log, fix or revert the update in your clone, and restart.";
  return (
    <div
      className="flex items-center gap-2 border-b border-line bg-raised px-3 py-1.5 text-sm"
      data-testid="startup-banner"
    >
      <Icon className={`size-4 shrink-0 ${info.safeMode ? "text-danger" : "text-warning"}`} />
      <span className="min-w-0 flex-1">{text}</span>
      <IconButton icon={XIcon} label="Hide" size="sm" onClick={() => setHidden(true)} />
    </div>
  );
}
