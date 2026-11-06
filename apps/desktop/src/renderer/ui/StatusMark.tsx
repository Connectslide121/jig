import { BellRing, CircleAlert } from "lucide-react";
import { cn } from "./cn";

export type MarkStatus = "working" | "attention" | "error";

const TITLE: Record<MarkStatus, string> = {
  working: "Jig is working",
  attention: "Needs you",
  error: "Stopped with an error",
};

/**
 * What something running wants you to see, in an icon's 14 px slot (D-416): three dots bouncing in
 * turn while it works (in the current text colour, so `className` can colour them), a bell that rings
 * now and then when it needs you, an alert after an error. Same size as the icon it stands in for.
 */
export function StatusMark({ status, className }: { status: MarkStatus; className?: string }) {
  const mark = { title: TITLE[status], "data-testid": "status-mark", "data-status": status };
  if (status === "working")
    return (
      <span {...mark} className={cn("jig-typing flex size-3.5 shrink-0 items-center gap-px", className)}>
        <span className="size-1 rounded-full bg-current" />
        <span className="size-1 rounded-full bg-current" />
        <span className="size-1 rounded-full bg-current" />
      </span>
    );
  return (
    <span {...mark} className="flex shrink-0">
      {status === "attention" ? (
        <BellRing className="jig-ring size-3.5 text-warning" />
      ) : (
        <CircleAlert className="size-3.5 text-danger" />
      )}
    </span>
  );
}
