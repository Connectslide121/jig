import { Hammer, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { setBuildRequestHandler } from "../../addons/buildRequests";
import { call, useHostEvent } from "../../lib/host";
import { registerAction, registerTabType, registerView } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
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
