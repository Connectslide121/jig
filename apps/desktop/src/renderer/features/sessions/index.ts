import { MessageSquare, MessageSquarePlus, MessagesSquare } from "lucide-react";
import { useEffect } from "react";
import { useHostEvent } from "../../lib/host";
import { useProjects } from "../../workbench/projects";
import { registerAction, registerTabType, registerView } from "../../workbench/registry";
import { newSession } from "./actions";
import { ChatTab } from "./ChatTab";
import { SessionsHeaderActions, SessionsView } from "./SessionsView";
import { applySessionUpdates, loadSessions, useSessions } from "./store";

export function registerSessions(): void {
  registerView({
    id: "jig.sessions",
    title: "Sessions",
    icon: MessagesSquare,
    defaultRegion: "left",
    component: SessionsView,
    headerActions: SessionsHeaderActions,
    owner: "core",
  });
  registerTabType({
    type: "jig.chat",
    title: () => "Chat",
    useTitle: (params) => useSessions((s) => s.metas[String(params.sessionId)]?.title ?? ""),
    icon: MessageSquare,
    component: ChatTab,
    owner: "core",
  });
  registerAction({
    id: "jig.newSession",
    title: "New session",
    group: "Sessions",
    icon: MessageSquarePlus,
    shortcut: "Mod+N",
    visible: () => Boolean(useProjects.getState().activeId),
    run: () => void newSession(),
  });
}

/** Mounted once: loads sessions and applies live updates. */
export function useSessionsSync(): void {
  useEffect(() => {
    void loadSessions();
  }, []);
  useHostEvent("sessions.update", ({ sessionId, updates }) => applySessionUpdates(sessionId, updates));
}
