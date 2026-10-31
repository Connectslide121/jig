import { useEffect } from "react";
import { useAddonsSync } from "../addons/loader";
import { AttemptsDialogHost } from "../features/attempts";
import { useBrowserReveal } from "../features/browser";
import { useBuildsSync } from "../features/builder";
import { BuildDialogHost } from "../features/builder/BuildDialog";
import { StandupHost } from "../features/digest";
import { GoToHost } from "../features/goto";
import { useLearningSync } from "../features/learning";
import { LinkDialogHost } from "../features/links/LinksView";
import { ProjectDialogHost } from "../features/projects/ProjectDialog";
import { useSessionsSync } from "../features/sessions";
import { SavedChatsDialogHost } from "../features/sessions/SavedChatsDialog";
import { SessionDialogsHost } from "../features/sessions/SessionDialogs";
import { useFirstRun } from "../features/setup";
import { useTerminalsSync } from "../features/terminals";
import { useWorktreesSync } from "../features/worktrees";
import { call, useHostEvent } from "../lib/host";
import { useConfig } from "../stores/config";
import { useUsageSync } from "../stores/usage";
import { DialogHost, ErrorBoundary, MenuHost } from "../ui";
import { MainArea } from "./MainArea";
import { useProjects } from "./projects";
import { Region, ViewDropEdges } from "./Region";
import { useRegistry } from "./registry";
import { StartupBanner } from "./StartupBanner";
import { StatusBar } from "./StatusBar";
import { matchesShortcut } from "./shortcuts";
import { setLayoutFromHost, useWorkbench } from "./store";
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
      // Not behind a dialog (Ctrl+W must not close the tab under "Delete session?").
      if (document.querySelector('[aria-modal="true"]')) return;
      for (const action of Object.values(useRegistry.getState().actions)) {
        if (action.shortcut && matchesShortcut(action.shortcut, event)) {
          event.preventDefault();
          // Holding a key repeats only cycling through tabs, not "new chat" or "close tab".
          if (event.repeat && !/Tab$/.test(action.shortcut)) return;
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
  useBrowserReveal();
  useAddonsSync();
  useBuildsSync();
  useLearningSync();
  useWorktreesSync();
  useUsageSync();
  useShortcuts();
  const ready = useWorkbench((s) => s.layout !== undefined);
  useFirstRun(ready);
  return (
    <div className="flex h-full flex-col" data-testid="app-root">
      <Topbar />
      <StartupBanner />
      {ready && (
        <div className="relative flex min-h-0 flex-1">
          <ViewDropEdges />
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
      <GoToHost />
      <ErrorBoundary label="Dialogs">
        <BuildDialogHost />
        <AttemptsDialogHost />
        <ProjectDialogHost />
        <LinkDialogHost />
        <SessionDialogsHost />
        <SavedChatsDialogHost />
        <StandupHost />
        <DialogHost />
      </ErrorBoundary>
      <ErrorBoundary label="Notifications">
        <ToastHost />
      </ErrorBoundary>
    </div>
  );
}
