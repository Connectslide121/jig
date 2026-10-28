import { AlertTriangle, Eye, ShieldAlert, X as XIcon } from "lucide-react";
import { useState } from "react";
import { undoLastAppChange } from "../features/builder";
import { useConfig } from "../stores/config";
import { Button, IconButton } from "../ui";

/**
 * Tells you how this Jig was started when it isn't the normal way: a preview instance of a level-3
 * change, safe mode, or a fallback after a change to Jig failed to start (docs/reference/self-modification.md).
 */
export function StartupBanner() {
  const info = useConfig((s) => s.info);
  const [hidden, setHidden] = useState(false);
  if (!info || hidden) return null;
  let icon = Eye;
  let text = "";
  let tone = "text-accent";
  if (info.preview) {
    text =
      "Preview instance: this is the changed Jig, running with a copy of your Jig home. Close it when you've tried it, then accept or discard the change in your Jig.";
  } else if (info.safeMode) {
    icon = ShieldAlert;
    tone = "text-danger";
    text = "Safe mode: the last change to Jig didn't start, so your own add-ons are off.";
  } else if (info.startedAfterFailure) {
    icon = AlertTriangle;
    tone = "text-warning";
    text = "The last change to Jig didn't start, so Jig started its previous build.";
  } else return null;
  const Icon = icon;
  return (
    <div
      className="flex items-center gap-2 border-b border-line bg-raised px-3 py-1.5 text-sm"
      data-testid="startup-banner"
    >
      <Icon className={`size-4 shrink-0 ${tone}`} />
      <span className="min-w-0 flex-1">{text}</span>
      {!info.preview && (
        <Button size="sm" onClick={() => void undoLastAppChange()} data-testid="banner-undo">
          Undo the last change to Jig
        </Button>
      )}
      <IconButton icon={XIcon} label="Hide" size="sm" onClick={() => setHidden(true)} />
    </div>
  );
}
