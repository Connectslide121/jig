import { useEffect } from "react";
import { useAddonsSync } from "../addons/loader";
import { useBuildsSync } from "../features/builder";
import { BuildDialogHost } from "../features/builder/BuildDialog";
import { useLearningSync } from "../features/learning";
import { useSessionsSync } from "../features/sessions";
import { useTerminalsSync } from "../features/terminals";
import { call, useHostEvent } from "../lib/host";
import { useConfig } from "../stores/config";
import { DialogHost, ErrorBoundary, MenuHost } from "../ui";
import { MainArea } from "./MainArea";
import { useProjects } from "./projects";
import { Region } from "./Region";
import { useRegistry } from "./registry";
import { StatusBar } from "./StatusBar";
import { matchesShortcut } from "./shortcuts";
import { setLayoutFromHost, useWorkbench } from "./store";
import { ToolsMenuHost } from "./ToolsMenu";
import { Topbar } from "./Topbar";
import { notify, ToastHost } from "./toasts";

/** Loads the host state the shell needs and keeps it in sync. */
function useShellState() {
  useEffect(() => {
    void call("layout.get").then(setLayoutFromHost);
    void call("projects.list").then((state) => useProjects.setState(state));
    void Promise.all([call("config.get"), call("app.info")]).then(([config, info]) => {
      useConfig.setState({ config, info });
      document.documentElement.dataset.platform = info.platform;
    });
  }, []);
  useHostEvent("layout.changed", setLayoutFromHost);
  useHostEvent("projects.changed", (state) => useProjects.setState(state));
  useHostEvent("config.changed", (config) => useConfig.setState({ config }));
  useHostEvent("notify", (n) => notify({ title: n.title, message: n.message, tone: n.tone }));
}

/** Global keyboard shortcuts: every action with a `shortcut` (and always also in a menu). */
function useShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      for (const action of Object.values(useRegistry.getState().actions)) {
        if (action.shortcut && matchesShortcut(action.shortcut, event)) {
          event.preventDefault();
          void action.run();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function Workbench() {
  useShellState();
  useSessionsSync();
  useTerminalsSync();
  useAddonsSync();
  useBuildsSync();
  useLearningSync();
  useShortcuts();
  const ready = useWorkbench((s) => s.layout !== undefined);
  return (
    <div className="flex h-full flex-col" data-testid="app-root">
      <Topbar />
      {ready && (
        <div className="flex min-h-0 flex-1">
          <Region region="left" />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              <MainArea />
              <Region region="right" />
            </div>
            <Region region="bottom" />
          </div>
        </div>
      )}
      <StatusBar />
      <MenuHost />
      <ToolsMenuHost />
      <ErrorBoundary label="Dialogs">
        <BuildDialogHost />
        <DialogHost />
      </ErrorBoundary>
      <ErrorBoundary label="Notifications">
        <ToastHost />
      </ErrorBoundary>
    </div>
  );
}
