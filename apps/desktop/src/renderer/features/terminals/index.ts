import { KeyRound, SquareTerminal } from "lucide-react";
import { useEffect } from "react";
import { viewVisible } from "../../../shared/layout";
import { call, useHostEvent } from "../../lib/host";
import { registerAction, registerStatusItem, registerView } from "../../workbench/registry";
import { revealView, useClearViewBadge } from "../../workbench/revealView";
import { useWorkbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { RunningScripts } from "../scripts/RunningScripts";
import { claudeLogin, codexLogin, newTerminal, showTerminal, TERMINALS_VIEW } from "./actions";
import { askClaudeAboutTerminal, newlyFailed } from "./askClaude";
import { loadShells } from "./shells";
import { routeTerminalData, setTerminals, useTerminals } from "./store";
import { TerminalsHeaderActions, TerminalsView } from "./TerminalsView";

export function registerTerminals(): void {
  registerView({
    id: TERMINALS_VIEW,
    title: "Terminals",
    icon: SquareTerminal,
    defaultRegion: "bottom",
    component: TerminalsView,
    headerActions: TerminalsHeaderActions,
    owner: "core",
  });
  registerAction({
    id: "jig.newTerminal",
    title: "New terminal",
    group: "Terminals",
    icon: SquareTerminal,
    shortcut: "Mod+`",
    run: () => void newTerminal(),
  });
  registerAction({
    id: "jig.claudeLogin",
    title: "Sign in to Claude Code…",
    group: "Chats",
    icon: KeyRound,
    keywords: ["login", "account"],
    run: () => void claudeLogin(),
  });
  registerAction({
    id: "jig.codexLogin",
    title: "Sign in to ChatGPT (Codex)…",
    group: "Chats",
    icon: KeyRound,
    keywords: ["login", "account", "openai", "chatgpt", "codex"],
    run: () => void codexLogin(),
  });
  registerStatusItem({
    id: "jig.runningScripts",
    side: "left",
    order: 10,
    component: RunningScripts,
    owner: "core",
  });
}

/** Mounted once: terminal list and output from the host. */
export function useTerminalsSync(): void {
  useEffect(() => {
    void call("terminals.list").then(setTerminals);
    void loadShells();
  }, []);
  useHostEvent("terminals.changed", (list) => {
    const failed = newlyFailed(useTerminals.getState().terminals, list);
    setTerminals(list);
    for (const t of failed)
      notify({
        title: `${t.title} failed`,
        message: `Exit code ${t.exitCode}.`,
        tone: "danger",
        actions: [
          { label: "Ask Jig", run: () => void askClaudeAboutTerminal(t) },
          { label: "Show output", run: () => showTerminal(t.id) },
        ],
      });
  });
  useHostEvent("terminals.data", ({ id, data }) => routeTerminalData(id, data));
  // A chat started a terminal (jig_terminal_run): it shows itself, or badges the Terminals tab while
  // you work on another tab of its panel (D-349); the new terminal is the one you see when you look.
  useHostEvent("terminals.reveal", ({ id }) => {
    useTerminals.setState({ activeId: id });
    revealView(TERMINALS_VIEW, id);
  });
  useClearViewBadge(TERMINALS_VIEW);
  // The host closes finished Claude terminals, but never the one you are looking at (D-373).
  const visible = useWorkbench((s) => (s.layout ? viewVisible(s.layout, TERMINALS_VIEW) : false));
  const activeId = useTerminals((s) => s.activeId);
  const watching = visible ? activeId : undefined;
  useEffect(() => {
    void call("terminals.watching", { id: watching }).catch(() => {});
  }, [watching]);
  // Claude Code's sign-in ended: say whether it worked (the host closed its terminal if it did).
  useHostEvent("claude.signIn", ({ loggedIn, method }) =>
    notify(
      loggedIn
        ? {
            title: "Signed in to Claude Code",
            message: `${method ? `With ${method}. ` : ""}Jig's chats use this login; the sign-in terminal is closed.`,
            tone: "success",
          }
        : {
            title: "Not signed in yet",
            message: "The sign-in ended before you were signed in.",
            tone: "warning",
            actions: [{ label: "Try again", run: () => void claudeLogin() }],
          },
    ),
  ); // The Codex sign-in ended: the same, for ChatGPT.
  useHostEvent("codex.signIn", ({ loggedIn, method }) =>
    notify(
      loggedIn
        ? {
            title: "Signed in to ChatGPT",
            message: `${method ? `With ${method}. ` : ""}The sign-in terminal is closed.`,
            tone: "success",
          }
        : {
            title: "Not signed in to ChatGPT yet",
            message: "The sign-in ended before you were signed in.",
            tone: "warning",
            actions: [{ label: "Try again", run: () => void codexLogin() }],
          },
    ),
  );
}
