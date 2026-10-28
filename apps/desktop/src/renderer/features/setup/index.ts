import { CircleCheckBig, Download } from "lucide-react";
import { useEffect } from "react";
import { useConfig } from "../../stores/config";
import { registerAction, registerTabType } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { SetupTab } from "./SetupTab";

export function registerSetup(): void {
  registerTabType({
    type: "jig.setup",
    title: () => "Get started",
    icon: CircleCheckBig,
    component: SetupTab,
    singleton: true,
    owner: "core",
  });
  registerAction({
    id: "jig.setup",
    title: "Check your setup…",
    group: "Jig",
    icon: CircleCheckBig,
    keywords: ["get started", "first run", "git", "az", "claude", "install"],
    run: () => void workbench.openTab("jig.setup"),
  });
  registerAction({
    id: "jig.updates",
    title: "Check for updates…",
    group: "Jig",
    icon: Download,
    keywords: ["update", "upgrade", "version", "release"],
    run: () => void workbench.openTab("jig.setup"),
  });
}

/** An installed Jig opens Get started on its first start. */
export function useFirstRun(ready: boolean): void {
  const info = useConfig((s) => s.info);
  const done = useConfig((s) => s.config?.setup.firstRunDone);
  useEffect(() => {
    if (ready && info?.packaged && done === false) workbench.openTab("jig.setup");
  }, [ready, info, done]);
}
