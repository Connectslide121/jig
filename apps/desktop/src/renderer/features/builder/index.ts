import { Hammer, Sparkles, Undo2 } from "lucide-react";
import { useEffect } from "react";
import { setBuildRequestHandler } from "../../addons/buildRequests";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { confirmDialog } from "../../ui";
import { registerAction, registerTabType, registerView } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { openBuildDialog, startBuild } from "./BuildDialog";
import { BuildsHeaderActions, BuildsView } from "./BuildsView";
import { BuildTab } from "./BuildTab";
import { useBuilds } from "./store";

export function registerBuilder(): void {
  registerView({
    id: "jig.builds",
    title: "Builds",
    icon: Hammer,
    defaultRegion: "bottom",
    component: BuildsView,
    headerActions: BuildsHeaderActions,
    owner: "core",
  });
  registerTabType({
    type: "jig.build",
    title: () => "Build",
    useTitle: (params) =>
      useBuilds((s) => s.jobs.find((j) => j.id === params.buildId)?.goal.slice(0, 40) ?? ""),
    icon: Hammer,
    component: BuildTab,
    owner: "core",
  });
  registerAction({
    id: "jig.build",
    title: "Build something…",
    group: "Build",
    icon: Sparkles,
    shortcut: "Mod+Shift+B",
    keywords: ["new tool", "add-on", "ai", "make"],
    run: () => openBuildDialog({ goal: "", origin: "tools" }),
  });
  registerAction({
    id: "jig.builds",
    title: "Show builds",
    group: "Build",
    icon: Hammer,
    run: () => workbench.showView("jig.builds"),
  });
  registerAction({
    id: "jig.undoAppChange",
    title: "Undo the last change to Jig",
    group: "Build",
    icon: Undo2,
    keywords: ["revert", "self-modification", "level 3"],
    run: () => void undoLastAppChange(),
  });
  // "Change this with AI" / "Fix with AI" / suggestions: with a goal, start right away; without, ask.
  setBuildRequestHandler(({ goal, addonId, origin }) => {
    const from = origin ?? "addon";
    if (goal.trim()) void startBuild(goal, from, addonId);
    else openBuildDialog({ goal: "", addonId, origin: from });
  });
}

export function useBuildsSync(): void {
  useEffect(() => {
    void call("builds.list").then((jobs) => useBuilds.setState({ jobs }));
  }, []);
  useHostEvent("builds.changed", (jobs) => useBuilds.setState({ jobs }));
}

/** Reverts the last accepted change to Jig's own code (a revert commit), rebuilds and restarts. */
export async function undoLastAppChange(): Promise<void> {
  if (
    !(await confirmDialog({
      title: "Undo the last change to Jig?",
      message:
        "Jig reverts the change in its repository (as a new commit), rebuilds and restarts. Your add-ons and data are not touched.",
      confirmLabel: "Undo and restart",
      danger: true,
    }))
  )
    return;
  try {
    const { goal } = await call("app.undoLastChange");
    notify({ title: "Undone", message: goal, tone: "success" });
  } catch (error) {
    notify({ title: "Couldn't undo", message: errorMessage(error), tone: "danger" });
  }
}
