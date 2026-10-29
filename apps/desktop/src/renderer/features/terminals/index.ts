import { KeyRound, SquareTerminal } from "lucide-react";
import { useEffect } from "react";
import { call, useHostEvent } from "../../lib/host";
import { registerAction, registerStatusItem, registerView } from "../../workbench/registry";
import { notify } from "../../workbench/toasts";
import { RunningScripts } from "../scripts/RunningScripts";
import { claudeLogin, newTerminal, showTerminal } from "./actions";
import { askClaudeAboutTerminal, newlyFailed } from "./askClaude";
import { routeTerminalData, setTerminals, useTerminals } from "./store";
import { TerminalsHeaderActions, TerminalsView } from "./TerminalsView";

export function registerTerminals(): void {
  registerView({
    id: "jig.terminals",
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
          { label: "Ask Claude", run: () => void askClaudeAboutTerminal(t) },
          { label: "Show output", run: () => showTerminal(t.id) },
        ],
      });
  });
  useHostEvent("terminals.data", ({ id, data }) => routeTerminalData(id, data));
  useHostEvent("terminals.reveal", ({ id }) => showTerminal(id));
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
  );
}
