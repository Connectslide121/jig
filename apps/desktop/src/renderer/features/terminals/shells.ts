import { Settings2 } from "lucide-react";
import { useEffect } from "react";
import { create } from "zustand";
import type { ShellChoices } from "../../../shared/terminals";
import { call, errorMessage } from "../../lib/host";
import type { MenuEntry } from "../../ui";
import { openSettings } from "../../workbench/actions";
import { useProjects } from "../../workbench/projects";
import { notify } from "../../workbench/toasts";
import { showTerminal } from "./actions";
import { shellEntries } from "./shellEntries";

/** The installed shells, fetched from the host (D-240). Menus read the cache so they open at once. */
export const useShells = create<{ choices?: ShellChoices }>(() => ({}));

export async function loadShells(): Promise<ShellChoices | undefined> {
  try {
    const choices = await call("terminals.shells");
    useShells.setState({ choices });
    return choices;
  } catch {
    return useShells.getState().choices;
  }
}

/** Loads the list once when the component mounts. */
export function useShellChoices(): ShellChoices | undefined {
  const choices = useShells((s) => s.choices);
  useEffect(() => {
    void loadShells();
  }, []);
  return choices;
}

/** What "+ ˅", the right-click on "+" and the top bar's "New terminal in…" show (from the cache, which the Terminals view refreshes). */
export function newTerminalInEntries(): MenuEntry[] {
  return [
    ...shellEntries(useShells.getState().choices, (path) => void newTerminalInShell(path)),
    { separator: true },
    { label: "Change default shell…", icon: Settings2, onSelect: () => openSettings("terminal") },
  ];
}

/** One terminal in this shell only; the default is unchanged. */
export async function newTerminalInShell(shell: string): Promise<void> {
  try {
    const t = await call("terminals.create", { projectId: useProjects.getState().activeId, shell });
    showTerminal(t.id);
  } catch (error) {
    notify({ title: "Couldn't open a terminal", message: errorMessage(error), tone: "danger" });
  }
}
