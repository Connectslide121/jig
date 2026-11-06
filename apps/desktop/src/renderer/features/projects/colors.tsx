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
/** A filled icon (stroke and fill) in the colour. */
const filled: Record<ProjectColor, string> = {
  accent: "fill-accent text-accent",
  info: "fill-info text-info",
  success: "fill-success text-success",
  warning: "fill-warning text-warning",
  danger: "fill-danger text-danger",
  muted: "fill-muted text-muted",
};

export const projectDotClass = (color: ProjectColor) => dot[color];
export const projectTextClass = (color: ProjectColor) => text[color];
export const projectFillClass = (color: ProjectColor) => filled[color];
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
export function ProjectSwatch({ color, className }: { color?: ProjectColor | string; className?: string }) {
  const tone = dot[color as ProjectColor] ?? dot.accent;
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-xs", tone, className)} />;
}
