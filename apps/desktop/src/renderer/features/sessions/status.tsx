import type { SessionStatus } from "../../../shared/engine";
import { cn } from "../../ui";

export const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: "Idle",
  starting: "Starting",
  working: "Working",
  needs_you: "Needs you",
  error: "Error",
};

/** A small coloured dot (pulsing while Claude works). */
export function StatusDot({ status, className }: { status: SessionStatus; className?: string }) {
  return (
    <span
      title={STATUS_LABEL[status]}
      data-status={status}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        status === "idle" && "bg-hint",
        (status === "working" || status === "starting") && "animate-pulse bg-info",
        status === "needs_you" && "bg-warning",
        status === "error" && "bg-danger",
        className,
      )}
    />
  );
}
