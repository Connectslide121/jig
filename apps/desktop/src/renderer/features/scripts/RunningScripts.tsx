import { Play, Square } from "lucide-react";
import { call } from "../../lib/host";
import { openMenuAt } from "../../ui";
import { showTerminal } from "../terminals/actions";
import { useTerminals } from "../terminals/store";

/** Status bar: how many scripts are running; click for a menu to show or stop them. */
export function RunningScripts() {
  const terminals = useTerminals((s) => s.terminals);
  const running = terminals.filter((t) => t.scriptId && t.status === "running");
  if (running.length === 0) return null;
  return (
    <button
      type="button"
      data-testid="running-scripts"
      className="flex items-center gap-1 hover:text-fg"
      onClick={(e) =>
        openMenuAt(e.currentTarget, [
          { heading: "Running scripts" },
          ...running.map((t) => ({
            label: t.title,
            icon: Play,
            submenu: [
              { label: "Show output", onSelect: () => showTerminal(t.id) },
              { label: "Stop", icon: Square, onSelect: () => void call("terminals.kill", { id: t.id }) },
            ],
          })),
        ])
      }
    >
      <Play className="size-3 text-success" /> {running.length} running
    </button>
  );
}
