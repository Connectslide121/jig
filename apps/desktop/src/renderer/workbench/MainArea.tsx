import { Settings, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { closeOtherTabs, type LayoutTab, moveTab } from "../../shared/layout";
import { requestBuild } from "../addons/buildRequests";
import { AboutPage } from "../features/about/AboutTab";
import { Home } from "../features/home/Home";
import { cn, contextMenu, ErrorBoundary, FileIcon } from "../ui";
import { useActiveProject } from "./projects";
import { useRegistry } from "./registry";
import { updateLayout, useWorkbench, workbench } from "./store";

const noTitle = () => "";
/** The tab's title; `useTitle` hooks re-render it when the title changes. */
function useTabTitle(tab: LayoutTab): string {
  const def = useRegistry((s) => s.tabTypes[tab.type]);
  const hookTitle = (def?.useTitle ?? noTitle)(tab.params);
  return def ? hookTitle || def.title(tab.params) : tab.type;
}

const noStatus = () => undefined;
const STATUS_TITLE = {
  working: "Claude is working",
  attention: "Needs you",
  error: "Stopped with an error",
  unread: "Finished — not seen yet",
};

/** A dot on a tab when something there wants a look (a chat working, waiting for you, done). */
function TabStatusDot({ tab }: { tab: LayoutTab }) {
  const def = useRegistry((s) => s.tabTypes[tab.type]);
  const status = (def?.useStatus ?? noStatus)(tab.params);
  if (!status) return null;
  return (
    <span
      title={STATUS_TITLE[status]}
      data-testid="tab-status"
      data-status={status}
      className={cn(
        "size-2 shrink-0 rounded-full",
        status === "working" && "animate-pulse bg-info",
        status === "attention" && "bg-warning",
        status === "error" && "bg-danger",
        status === "unread" && "bg-accent",
      )}
    />
  );
}

function TabButton({ tab, active, index }: { tab: LayoutTab; active: boolean; index: number }) {
  const def = useRegistry((s) => s.tabTypes[tab.type]);
  const [dragOver, setDragOver] = useState(false);
  const title = useTabTitle(tab);
  const Icon = (def && (def.iconFor?.(tab.params) ?? def.icon)) || Settings;
  const filePath =
    def?.filePath?.(tab.params) ??
    (typeof tab.params.fileIcon === "string" ? tab.params.fileIcon : undefined);
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
        ...(def?.owner && def.owner !== "core"
          ? [
              {
                label: "Change this with AI…",
                icon: Sparkles,
                onSelect: () => requestBuild({ goal: "", addonId: def.owner, origin: "addon" }),
              },
              { separator: true } as const,
            ]
          : []),
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
      {filePath ? <FileIcon path={filePath} className="size-3.5" /> : <Icon className="size-3.5 shrink-0" />}
      <TabStatusDot tab={tab} />
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

/**
 * With no tab open: the active project's Home (start a chat, recent chats, next steps), or the
 * "What Jig can do" page with Add project… when there is no project yet.
 */
function EmptyMain() {
  const project = useActiveProject();
  return project ? <Home project={project} /> : <AboutPage welcome />;
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
