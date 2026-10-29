import { create } from "zustand";
import type { BuildJob } from "../../../shared/builds";
import { useAddons } from "../../addons/loader";

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

/** What the build does, naming the add-on it changes or makes ("Changes Releases"). */
/** An add-on's name for a build's label: the installed one's, else its preview's, else its id. */
export function useAddonName(id: string | undefined): string | undefined {
  return useAddons((s) => {
    const all = s.addons.filter((a) => a.id === id);
    return (all.find((a) => !a.preview) ?? all[0])?.name;
  });
}

export function kindText(job: Pick<BuildJob, "kind" | "addonId">, addonName?: string): string {
  if (!job.kind) return "";
  const name = addonName ?? job.addonId;
  if (job.kind === "change-addon" && name) return `Changes ${name}`;
  if (job.kind === "new-addon" && name) return `New add-on: ${name}`;
  return KIND_TEXT[job.kind];
}

export const KIND_TEXT: Record<NonNullable<BuildJob["kind"]>, string> = {
  layout: "Layout change",
  settings: "Settings change",
  "change-addon": "Changes an add-on",
  "new-addon": "New add-on",
  app: "Development request",
  nothing: "Nothing to build",
};
