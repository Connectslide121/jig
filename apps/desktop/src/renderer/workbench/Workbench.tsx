import { useEffect } from "react";
import { bottomUnder, DEFAULT_BOTTOM_SPAN } from "../../shared/layout";
import { useAddonsSync } from "../addons/loader";
import { openAddonTarget } from "../addons/runtime";
import { AttemptsDialogHost } from "../features/attempts";
import { useBrowserReveal } from "../features/browser";
import { useBuildsSync } from "../features/builder";
import { BuildDialogHost } from "../features/builder/BuildDialog";
import { CopilotDialogHost } from "../features/completion/CopilotDialog";
import { StandupHost } from "../features/digest";
import { GoToHost } from "../features/goto";
import { ClaudeImportDialogHost } from "../features/knowledge/ClaudeImportDialog";
import { KnowledgeReaderHost } from "../features/knowledge/KnowledgeCard";
import { NoteEditorHost } from "../features/knowledge/Notes";
import { useLearningSync } from "../features/learning";
import { LinkDialogHost } from "../features/links/LinksView";
import { ProjectDialogHost } from "../features/projects/ProjectDialog";
import { QuitDialogHost } from "../features/quit/QuitDialog";
import { useSessionsSync } from "../features/sessions";
import { HandoverDialogHost } from "../features/sessions/HandoverDialog";
import { SavedChatsDialogHost } from "../features/sessions/SavedChatsDialog";
import { SessionDialogsHost } from "../features/sessions/SessionDialogs";
import { useFirstRun } from "../features/setup";
import { UpdateInstallingHost } from "../features/setup/UpdateInstalling";
import { VoiceDialogHost } from "../features/speech/VoiceDialog";
import { useTerminalsSync } from "../features/terminals";
import { useWorktreesSync } from "../features/worktrees";
import { call, useHostEvent } from "../lib/host";
import { useConfig } from "../stores/config";
import { useUsageSync } from "../stores/usage";
import { DialogHost, ErrorBoundary, MenuHost } from "../ui";
import { useTrackFocusedPanel } from "./focusedPanel";
import { MainArea } from "./MainArea";
import { useProjects } from "./projects";
import { Region, ViewDropEdges } from "./Region";
import { useRegistry } from "./registry";
import { StartupBanner } from "./StartupBanner";
import { StatusBar } from "./StatusBar";
import { matchesShortcut } from "./shortcuts";
import { setLayoutFromHost, useWorkbench } from "./store";
import { Topbar } from "./Topbar";
import { useTrackUserIntent } from "./takeFocus";
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
  useHostEvent("notify", (n) => {
    const { addonId } = n;
    notify({
      title: n.title,
      message: n.message,
      tone: n.tone,
      timeout: n.timeout,
      actions: addonId
        ? n.actions?.map(({ label, ...target }) => ({ label, run: () => openAddonTarget(addonId, target) }))
        : undefined,
    });
  });
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

/**
 * The sidebars, the main area and the bottom panel on one grid. How far the bottom panel reaches
 * (`bottomSpan`, D-375) only changes the grid's areas: every panel stays mounted where it is, so
 * switching keeps views, terminals and scroll positions, and every size stays as it was.
 */
function Panels() {
  const span = useWorkbench((s) => s.layout?.bottomSpan ?? DEFAULT_BOTTOM_SPAN);
  const left = bottomUnder(span, "left") ? "bottom" : "left";
  const right = bottomUnder(span, "right") ? "bottom" : "right";
  return (
    <div
      className="relative grid min-h-0 flex-1"
      data-testid="workbench-panels"
      data-bottom-span={span}
      style={{
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        gridTemplateRows: "minmax(0, 1fr) auto",
        gridTemplateAreas: `"left main right" "${left} bottom ${right}"`,
      }}
    >
      <ViewDropEdges />
      <div className="flex min-h-0" style={{ gridArea: "left" }}>
        <Region region="left" />
      </div>
      <div className="flex min-h-0 min-w-0" style={{ gridArea: "main" }}>
        <MainArea />
      </div>
      <div className="flex min-h-0" style={{ gridArea: "right" }}>
        <Region region="right" />
      </div>
      <div className="flex min-w-0 flex-col" style={{ gridArea: "bottom" }}>
        <Region region="bottom" />
      </div>
    </div>
  );
}

export function Workbench() {
  useShellState();
  useSessionsSync();
  useTerminalsSync();
  useTrackFocusedPanel();
  useTrackUserIntent();
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
      {ready && <Panels />}
      <StatusBar />
      <MenuHost />
      <GoToHost />
      <ErrorBoundary label="Dialogs">
        <BuildDialogHost />
        <AttemptsDialogHost />
        <CopilotDialogHost />
        <ClaudeImportDialogHost />
        <KnowledgeReaderHost />
        <NoteEditorHost />
        <ProjectDialogHost />
        <LinkDialogHost />
        <SessionDialogsHost />
        <HandoverDialogHost />
        <SavedChatsDialogHost />
        <VoiceDialogHost />
        <StandupHost />
        <DialogHost />
        <UpdateInstallingHost />
        <QuitDialogHost />
      </ErrorBoundary>
      <ErrorBoundary label="Notifications">
        <ToastHost />
      </ErrorBoundary>
    </div>
  );
}
