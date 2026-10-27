import { KeyRound, SquareTerminal } from "lucide-react";
import { createElement, useEffect } from "react";
import { call, useHostEvent } from "../../lib/host";
import { registerAction, registerStatusItem, registerView } from "../../workbench/registry";
import { registerDashboardWidget } from "../projects/widgets";
import { RunningScripts } from "../scripts/RunningScripts";
import { ScriptsPanel } from "../scripts/ScriptsPanel";
import { claudeLogin, newTerminal } from "./actions";
import { routeTerminalData, setTerminals } from "./store";
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
    group: "Sessions",
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
  registerDashboardWidget({
    id: "jig.scripts",
    order: 0,
    owner: "core",
    render: (project) => createElement(ScriptsPanel, { project }),
  });
}

/** Mounted once: terminal list and output from the host. */
export function useTerminalsSync(): void {
  useEffect(() => {
    void call("terminals.list").then(setTerminals);
  }, []);
  useHostEvent("terminals.changed", setTerminals);
  useHostEvent("terminals.data", ({ id, data }) => routeTerminalData(id, data));
}
