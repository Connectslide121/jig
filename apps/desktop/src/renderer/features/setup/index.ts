import { CircleCheckBig, Download } from "lucide-react";
import { useEffect } from "react";
import { useHostEvent } from "../../lib/host";
import { useConfig } from "../../stores/config";
import { registerAction, registerTabType } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { applyUpdate, SetupTab } from "./SetupTab";

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

const announced = new Set<string>();
/** Each update notice shows once per run. */
const announce = (key: string) => !announced.has(key) && Boolean(announced.add(key));

/** An installed Jig opens Get started on its first start, and tells about updates with a toast. */
export function useFirstRun(ready: boolean): void {
  useHostEvent("updates.state", (state) => {
    if (state.mode !== "release" || !state.latest) return;
    if (state.download === "ready") {
      if (!announce(`ready:${state.latest}`)) return;
      notify({
        title: `Jig ${state.latest} is ready`,
        message: "Install the update when you're ready to restart. The installer shows its progress.",
        tone: "success",
        timeout: 0,
        actions: [{ label: "Install and restart", run: () => void applyUpdate(state) }],
      });
    } else if (state.available && !state.download) {
      // Found by the check when Jig opens (or Check again): the user decides when to download.
      if (workbench.activeTab()?.type === "jig.setup" || !announce(`available:${state.latest}`)) return;
      notify({
        title: `Jig ${state.latest} is available`,
        message: `You have ${state.current}.`,
        tone: "info",
        timeout: 0,
        actions: [
          { label: "Download", run: () => void applyUpdate(state) },
          { label: "Details", run: () => void workbench.openTab("jig.setup") },
        ],
      });
    }
  });
  const info = useConfig((s) => s.info);
  const done = useConfig((s) => s.config?.setup.firstRunDone);
  useEffect(() => {
    if (ready && info?.packaged && done === false) workbench.openTab("jig.setup");
  }, [ready, info, done]);
}
