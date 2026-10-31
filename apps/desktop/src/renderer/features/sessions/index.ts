import { MessageSquare, MessageSquarePlus, MessagesSquare, SquareKanban } from "lucide-react";
import { useEffect } from "react";
import { useHostEvent } from "../../lib/host";
import { useProjects } from "../../workbench/projects";
import { registerAction, registerTabType, registerView } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { newSession } from "./actions";
import { ChatsBoard } from "./ChatsBoard";
import { ChatTab } from "./ChatTab";
import { SessionsHeaderActions, SessionsView } from "./SessionsView";
import { applySessionUpdates, loadSessions, useSeenTurns, useSessions } from "./store";

export function registerSessions(): void {
  registerView({
    id: "jig.sessions",
    title: "Chats",
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
    useStatus: (params) => {
      const id = String(params.sessionId);
      const meta = useSessions((s) => s.metas[id]);
      const seen = useSeenTurns((s) => s[id]);
      if (!meta) return undefined;
      if (meta.status === "needs_you") return "attention";
      if (meta.status === "working" || meta.status === "starting") return "working";
      if (meta.status === "error") return "error";
      return seen !== undefined && meta.turns > seen ? "unread" : undefined;
    },
    component: ChatTab,
    owner: "core",
  });
  registerTabType({
    type: "jig.chatsBoard",
    title: () => "Chats board",
    icon: SquareKanban,
    component: ChatsBoard,
    singleton: true,
    owner: "core",
  });
  registerAction({
    id: "jig.chatsBoard",
    title: "Chats board",
    group: "Chats",
    icon: SquareKanban,
    keywords: ["all chats", "overview", "kanban", "status"],
    run: () => {
      workbench.openTab("jig.chatsBoard", {});
    },
  });
  registerAction({
    id: "jig.newSession",
    title: "New chat",
    group: "Chats",
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
  useHostEvent("sessions.reveal", ({ sessionId }) => workbench.openTab("jig.chat", { sessionId }));
}
