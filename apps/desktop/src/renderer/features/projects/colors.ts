import type { ProjectColor } from "../../../shared/projects";

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
