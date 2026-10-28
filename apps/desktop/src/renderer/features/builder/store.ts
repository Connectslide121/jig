import { create } from "zustand";
import type { BuildJob } from "../../../shared/builds";

export const useBuilds = create<{ jobs: BuildJob[] }>(() => ({ jobs: [] }));

export const STATUS_TEXT: Record<BuildJob["status"], string> = {
  working: "Building…",
  needs_you: "Needs you",
  preview: "Ready to review",
  accepted: "Accepted",
  discarded: "Discarded",
  failed: "Failed",
};

export const STATUS_TONE: Record<
  BuildJob["status"],
  "info" | "warning" | "accent" | "success" | "neutral" | "danger"
> = {
  working: "info",
  needs_you: "warning",
  preview: "accent",
  accepted: "success",
  discarded: "neutral",
  failed: "danger",
};

export const KIND_TEXT: Record<NonNullable<BuildJob["kind"]>, string> = {
  layout: "Layout change",
  settings: "Settings change",
  "change-addon": "Changes an add-on",
  "new-addon": "New add-on",
  app: "Needs a new extension point",
  nothing: "Nothing to build",
};
