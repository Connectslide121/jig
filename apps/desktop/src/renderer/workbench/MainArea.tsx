import { FolderPlus, Settings, Wrench, X } from "lucide-react";
import { useState } from "react";
import { closeOtherTabs, type LayoutTab, moveTab } from "../../shared/layout";
import { Button, cn, contextMenu, ErrorBoundary } from "../ui";
import { addProject } from "./actions";
import { useRegistry } from "./registry";
import { updateLayout, useWorkbench, workbench } from "./store";
import { openToolsMenu } from "./ToolsMenu";

const noTitle = () => "";
/** The tab's title; `useTitle` hooks re-render it when the title changes. */
function useTabTitle(tab: LayoutTab): string {
  const def = useRegistry((s) => s.tabTypes[tab.type]);
  const hookTitle = (def?.useTitle ?? noTitle)(tab.params);
  return def ? hookTitle || def.title(tab.params) : tab.type;
}

function TabButton({ tab, active, index }: { tab: LayoutTab; active: boolean; index: number }) {
  const def = useRegistry((s) => s.tabTypes[tab.type]);
  const [dragOver, setDragOver] = useState(false);
  const title = useTabTitle(tab);
  const Icon = (def && (def.iconFor?.(tab.params) ?? def.icon)) || Settings;
  return (
    <div
      role="tab"
      tabIndex={-1}
      aria-selected={active}
      data-testid={`tab-${tab.type}`}
      title={title}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("jig/tab", tab.id)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("jig/tab")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        const id = e.dataTransfer.getData("jig/tab");
        if (id) updateLayout((l) => moveTab(l, id, index));
      }}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          workbench.closeTab(tab.id);
        }
      }}
      onClick={() => workbench.activateTab(tab.id)}
      onContextMenu={contextMenu([
        { label: "Close", icon: X, onSelect: () => workbench.closeTab(tab.id) },
        { label: "Close others", onSelect: () => updateLayout((l) => closeOtherTabs(l, tab.id)) },
        {
          label: "Close all",
          onSelect: () => updateLayout((l) => ({ ...l, main: { tabs: [], active: undefined } })),
        },
      ])}
      className={cn(
        "group relative flex h-full max-w-56 min-w-24 shrink-0 cursor-default items-center gap-1.5 border-r border-line pr-1 pl-3 text-xs",
        active ? "bg-canvas text-fg" : "bg-surface text-muted hover:text-fg",
        dragOver && "bg-hover",
      )}
    >
      {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={(e) => {
          e.stopPropagation();
          workbench.closeTab(tab.id);
        }}
        className={cn(
          "flex size-5 items-center justify-center rounded-sm hover:bg-hover",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function EmptyMain() {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center"
      data-testid="main-empty"
    >
      <div className="text-xl font-semibold text-fg">Jig</div>
      <div className="max-w-md text-sm text-muted">
        Your workbench around Claude Code. Add a project to start, or open the Tools menu to see everything
        Jig can do.
      </div>
      <div className="flex gap-2">
        <Button variant="primary" icon={FolderPlus} onClick={() => void addProject()}>
          Add project…
        </Button>
        <Button icon={Wrench} onClick={(e) => openToolsMenu(e.currentTarget)}>
          Tools
        </Button>
        <Button variant="ghost" icon={Settings} onClick={() => workbench.openTab("jig.settings")}>
          Settings
        </Button>
      </div>
    </div>
  );
}

/** Tab bodies stay mounted once opened, so chats and terminals keep their state when you switch. */
function TabBody({ tab, active }: { tab: LayoutTab; active: boolean }) {
  const def = useRegistry((s) => s.tabTypes[tab.type]);
  if (!def)
    return (
      <div className={cn("p-6 text-sm text-muted", !active && "hidden")}>
        This tab needs “{tab.type}”, which isn't available right now.
      </div>
    );
  const Body = def.component;
  return (
    <div className={cn("h-full", !active && "hidden")} data-tab-id={tab.id}>
      <ErrorBoundary label={def.title(tab.params)}>
        <Body tabId={tab.id} params={tab.params} active={active} />
      </ErrorBoundary>
    </div>
  );
}

export function MainArea() {
  const main = useWorkbench((s) => s.layout?.main);
  const [mounted] = useState(() => new Set<string>());
  if (!main) return <div className="flex-1" />;
  if (main.active) mounted.add(main.active);
  for (const id of mounted) if (!main.tabs.some((t) => t.id === id)) mounted.delete(id);
  return (
    <main className="flex min-w-0 flex-1 flex-col bg-canvas">
      {main.tabs.length > 0 && (
        <div
          role="tablist"
          className="flex h-8 shrink-0 overflow-x-auto overflow-y-hidden border-b border-line bg-surface"
        >
          {main.tabs.map((tab, index) => (
            <TabButton key={tab.id} tab={tab} index={index} active={tab.id === main.active} />
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {main.tabs.length === 0 ? (
          <EmptyMain />
        ) : (
          main.tabs
            .filter((t) => mounted.has(t.id))
            .map((tab) => <TabBody key={tab.id} tab={tab} active={tab.id === main.active} />)
        )}
      </div>
    </main>
  );
}
