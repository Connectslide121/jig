import {
  MessageSquare,
  MessageSquarePlus,
  MessageSquareShare,
  MessagesSquare,
  SquareKanban,
} from "lucide-react";
import { useEffect } from "react";
import { useHostEvent } from "../../lib/host";
import { useProjects } from "../../workbench/projects";
import { registerAction, registerTabType, registerView } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { newSession } from "./actions";
import { ChatsBoard } from "./ChatsBoard";
import { ChatTab } from "./ChatTab";
import { openSavedChatsDialog } from "./SavedChatsDialog";
import { SessionsHeaderActions, SessionsView, sessionsHeaderMenu } from "./SessionsView";
import { ChatIconById } from "./status";
import { applySessionUpdates, loadSessions, useSessions } from "./store";

export function registerSessions(): void {
  registerAction({
    id: "jig.openSavedChat",
    title: "Open a saved chat…",
    group: "Chats",
    icon: MessageSquareShare,
    run: openSavedChatsDialog,
  });
  registerView({
    id: "jig.sessions",
    title: "Chats",
    icon: MessagesSquare,
    defaultRegion: "left",
    component: SessionsView,
    headerActions: SessionsHeaderActions,
    headerMenu: sessionsHeaderMenu,
    owner: "core",
  });
  registerTabType({
    type: "jig.chat",
    title: () => "Chat",
    useTitle: (params) => useSessions((s) => s.metas[String(params.sessionId)]?.title ?? ""),
    icon: MessageSquare,
    // Its project's colour and its state, the same mark as in the Chats list (D-416).
    IconView: ChatIconById,
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
