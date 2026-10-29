import type { ProjectColor } from "../../../shared/projects";
import { cn } from "../../ui/cn";

/** Project colours are token names; these map them to (static, so Tailwind sees them) utilities. */
const dot: Record<ProjectColor, string> = {
  accent: "bg-accent",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  muted: "bg-muted",
};
const text: Record<ProjectColor, string> = {
  accent: "text-accent",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-muted",
};

export const projectDotClass = (color: ProjectColor) => dot[color];
export const projectTextClass = (color: ProjectColor) => text[color];
export const projectColorLabel: Record<ProjectColor, string> = {
  accent: "Accent",
  info: "Blue",
  success: "Green",
  warning: "Yellow",
  danger: "Red",
  muted: "Grey",
};

/**
 * A project's mark: a small rounded square in its colour. Chats have round status dots, so a
 * project never reads as a chat (lists, the top bar, the project picker).
 */
export function ProjectSwatch({ color, className }: { color: ProjectColor; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-xs", dot[color], className)} />;
}
