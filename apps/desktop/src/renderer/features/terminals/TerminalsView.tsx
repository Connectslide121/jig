import { Pencil, Plus, Power, RotateCw, Sparkles, SquareTerminal, X } from "lucide-react";
import type { TerminalInfo } from "../../../shared/terminals";
import { call } from "../../lib/host";
import { cn, contextMenu, Empty, IconButton, type MenuEntry, promptDialog } from "../../ui";
import { Pane } from "../../workbench/Pane";
import { useActiveProject } from "../../workbench/projects";
import type { ViewProps } from "../../workbench/registry";
import { newTerminal } from "./actions";
import { askClaudeAboutTerminal } from "./askClaude";
import { useTerminals } from "./store";
import { XTerm } from "./XTerm";

export function terminalMenu(t: TerminalInfo): MenuEntry[] {
  return [
    ...(t.private
      ? []
      : [
          {
            label: "Ask Claude about this output",
            icon: Sparkles,
            onSelect: () => void askClaudeAboutTerminal(t),
          },
        ]),
    {
      label: "Rename…",
      icon: Pencil,
      onSelect: async () => {
        const title = await promptDialog({
          title: "Rename terminal",
          initial: t.title,
          confirmLabel: "Rename",
        });
        if (title) await call("terminals.rename", { id: t.id, title });
      },
    },
    ...(t.scriptId && t.projectId
      ? [
          {
            label: "Restart",
            icon: RotateCw,
            onSelect: () => void call("scripts.restart", { projectId: t.projectId!, scriptId: t.scriptId! }),
          },
        ]
      : []),
    {
      label: "Stop process",
      icon: Power,
      disabled: t.status !== "running",
      onSelect: () => void call("terminals.kill", { id: t.id }),
    },
    { separator: true },
    { label: "Close", icon: X, onSelect: () => void call("terminals.close", { id: t.id }) },
  ];
}

export function TerminalsView(_props: ViewProps) {
  const { terminals, activeId } = useTerminals();
  const project = useActiveProject();
  if (terminals.length === 0)
    return (
      <Empty icon={SquareTerminal} title="No terminals">
        <button type="button" className="text-accent hover:underline" onClick={() => void newTerminal()}>
          New terminal{project ? ` in ${project.name}` : ""}
        </button>
      </Empty>
    );
  return (
    <div className="flex h-full" data-testid="terminals-view">
      <div className="min-w-0 flex-1 bg-code p-1">
        {terminals.map((t) => (
          <div key={t.id} className={cn("h-full", t.id !== activeId && "hidden")}>
            <XTerm id={t.id} active={t.id === activeId} />
          </div>
        ))}
      </div>
      <Pane
        id="jig.terminals.list"
        edge="left"
        defaultSize={192}
        max={480}
        label="Resize the terminal list"
        className="flex flex-col border-l border-line"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {terminals.map((t) => (
            <div
              key={t.id}
              role="tab"
              tabIndex={-1}
              aria-selected={t.id === activeId}
              data-testid={`terminal-tab-${t.title}`}
              onClick={() => useTerminals.setState({ activeId: t.id })}
              onContextMenu={contextMenu(() => terminalMenu(t))}
              className={cn(
                "group flex h-7 cursor-default items-center gap-1.5 rounded-md px-2 text-xs",
                t.id === activeId ? "bg-active text-fg" : "text-muted hover:bg-hover hover:text-fg",
              )}
            >
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  t.status === "running" ? "bg-success" : t.exitCode === 0 ? "bg-hint" : "bg-danger",
                )}
              />
              <span className="min-w-0 flex-1 truncate" title={t.command ?? t.cwd}>
                {t.title}
              </span>
              {t.status === "exited" && t.exitCode !== 0 && !t.private && (
                <IconButton
                  icon={Sparkles}
                  size="sm"
                  label="Ask Claude about this failure"
                  data-testid="terminal-ask-claude"
                  className="size-5 text-accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    void askClaudeAboutTerminal(t);
                  }}
                />
              )}
              <IconButton
                icon={X}
                size="sm"
                label="Close terminal"
                className="hidden size-5 group-hover:inline-flex"
                onClick={(e) => {
                  e.stopPropagation();
                  void call("terminals.close", { id: t.id });
                }}
              />
            </div>
          ))}
        </div>
      </Pane>
    </div>
  );
}

export function TerminalsHeaderActions() {
  return (
    <IconButton
      icon={Plus}
      label="New terminal (Ctrl+`)"
      size="sm"
      data-testid="new-terminal"
      onClick={() => void newTerminal()}
    />
  );
}
