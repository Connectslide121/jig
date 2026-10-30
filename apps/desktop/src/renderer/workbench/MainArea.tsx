import { Columns2, Settings, Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  closeOtherTabs,
  type LayoutTab,
  type MainPane,
  moveTab,
  moveTabToPane,
  paneActive,
  paneOf,
  paneTabs,
  unsplit,
} from "../../shared/layout";
import { requestBuild } from "../addons/buildRequests";
import { AboutPage } from "../features/about/AboutTab";
import { Home } from "../features/home/Home";
import { cn, contextMenu, ErrorBoundary, FileIcon, OverlayScrollbar } from "../ui";
import { confirmClose, useDirtyTabs } from "./dirty";
import { useSplitRatio } from "./Pane";
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

function TabButton({
  tab,
  active,
  focused,
  index,
  pane,
  split,
}: {
  tab: LayoutTab;
  active: boolean;
  /** Its pane has focus (in a split, the other pane's active tab is shown quieter). */
  focused: boolean;
  index: number;
  pane: MainPane;
  split: boolean;
}) {
  const def = useRegistry((s) => s.tabTypes[tab.type]);
  const [dragOver, setDragOver] = useState(false);
  const title = useTabTitle(tab);
  const dirty = useDirtyTabs((s) => s.tabs[tab.id] !== undefined);
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
        e.stopPropagation();
        const id = e.dataTransfer.getData("jig/tab");
        // Dropped on the other pane's tab bar: it moves there, at this place.
        if (id)
          updateLayout((l) => moveTab(paneOf(l, id) === pane ? l : moveTabToPane(l, id, pane), id, index));
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
        {
          label:
            pane === "right"
              ? "Move to the left side"
              : split
                ? "Move to the right side"
                : "Open to the side",
          icon: Columns2,
          testId: "tab-open-side",
          onSelect: () => updateLayout((l) => moveTabToPane(l, tab.id, pane === "right" ? "left" : "right")),
        },
        { separator: true },
        { label: "Close", icon: X, onSelect: () => workbench.closeTab(tab.id) },
        {
          label: "Close others",
          onSelect: async () => {
            const others = (useWorkbench.getState().layout?.main.tabs ?? []).filter(
              (t) => t.id !== tab.id && !t.pinned,
            );
            if (await confirmClose(others.map((t) => t.id))) updateLayout((l) => closeOtherTabs(l, tab.id));
          },
        },
        {
          label: "Close all",
          onSelect: async () => {
            const all = (useWorkbench.getState().layout?.main.tabs ?? []).map((t) => t.id);
            if (await confirmClose(all))
              updateLayout((l) => ({ ...l, main: { tabs: [], active: undefined } }));
          },
        },
        ...(split ? [{ label: "One pane", icon: Square, onSelect: () => updateLayout(unsplit) }] : []),
      ])}
      className={cn(
        "group relative flex h-full max-w-56 min-w-24 shrink-0 cursor-default items-center gap-1.5 border-r border-line pr-1 pl-3 text-xs",
        active ? "bg-canvas text-fg" : "bg-surface text-muted hover:text-fg",
        dragOver && "bg-hover",
      )}
    >
      {active && (
        <span className={cn("absolute inset-x-0 top-0 h-0.5", focused ? "bg-accent" : "bg-line-strong")} />
      )}
      {filePath ? <FileIcon path={filePath} className="size-3.5" /> : <Icon className="size-3.5 shrink-0" />}
      <TabStatusDot tab={tab} />
      {dirty && (
        <span
          className="size-1.5 shrink-0 rounded-full bg-fg"
          title="Unsaved changes"
          data-testid="tab-dirty"
        />
      )}
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
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
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
  return project ? <Home key={project.id} project={project} /> : <AboutPage welcome />;
}

/** Tab bodies stay mounted once opened, so chats and terminals keep their state when you switch. */
function TabBody({ tab, active, focused }: { tab: LayoutTab; active: boolean; focused: boolean }) {
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
        <Body tabId={tab.id} params={tab.params} active={active} focused={active && focused} />
      </ErrorBoundary>
    </div>
  );
}

/** A drag over the right part of the main area (below the tab bar): drop to open to the side. */
function atRightEdge(e: React.DragEvent<HTMLElement>): boolean {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientX > rect.left + rect.width * 0.6 && e.clientY > rect.top + 32;
}

/** One pane of the main area: its tab bar and its tabs' bodies. */
function TabPane({
  pane,
  tabs,
  active,
  focused,
  split,
  mounted,
}: {
  pane: MainPane;
  tabs: LayoutTab[];
  active: string | undefined;
  focused: boolean;
  split: boolean;
  mounted: Set<string>;
}) {
  const strip = useRef<HTMLDivElement>(null);
  // The active tab is always in view, however many tabs are open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the active tab or the tabs change.
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, tabs.length]);
  return (
    <div
      className="flex h-full min-w-0 flex-1 flex-col"
      data-testid={`main-pane-${pane}`}
      // A click anywhere in a pane gives it the focus (where new tabs open).
      onMouseDownCapture={() => {
        if (split && !focused && active) workbench.activateTab(active);
      }}
    >
      <div className="group/strip relative shrink-0">
        <div
          ref={strip}
          role="tablist"
          // No scrollbar squeezing the tabs: a thin one is drawn over their bottom edge on hover, and
          // the wheel scrolls them sideways, as in VS Code.
          className="tab-strip flex h-8 overflow-x-auto overflow-y-hidden border-b border-line bg-surface"
          onWheel={(e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
          }}
          onDragOver={(e) => e.dataTransfer.types.includes("jig/tab") && e.preventDefault()}
          onDrop={(e) => {
            const id = e.dataTransfer.getData("jig/tab");
            if (id) updateLayout((l) => moveTabToPane(l, id, pane));
          }}
        >
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              pane={pane}
              split={split}
              index={useWorkbench.getState().layout?.main.tabs.findIndex((t) => t.id === tab.id) ?? 0}
              active={tab.id === active}
              focused={focused}
            />
          ))}
        </div>
        <OverlayScrollbar target={strip} />
      </div>
      <div className="min-h-0 flex-1">
        {tabs
          .filter((t) => mounted.has(t.id))
          .map((tab) => (
            <TabBody key={tab.id} tab={tab} active={tab.id === active} focused={focused} />
          ))}
      </div>
    </div>
  );
}

export function MainArea() {
  const layout = useWorkbench((s) => s.layout);
  const main = layout?.main;
  const [mounted] = useState(() => new Set<string>());
  const [ratio, setRatio, resetRatio] = useSplitRatio("main.split", 0.5);
  const [edge, setEdge] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  if (!layout || !main) return <div className="flex-1" />;
  const split = Boolean(main.split);
  const leftActive = paneActive(layout, "left");
  const rightActive = paneActive(layout, "right");
  for (const id of [leftActive, rightActive]) if (id) mounted.add(id);
  for (const id of mounted) if (!main.tabs.some((t) => t.id === id)) mounted.delete(id);
  const focus = main.split?.focus ?? "left";
  return (
    <main className="flex min-w-0 flex-1 flex-col bg-canvas">
      {main.tabs.length === 0 ? (
        <div className="min-h-0 flex-1">
          <EmptyMain />
        </div>
      ) : (
        <div
          ref={area}
          className="relative flex min-h-0 flex-1"
          // Drag a tab to the right edge to open it to the side.
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("jig/tab") || split) return;
            e.preventDefault();
            setEdge(atRightEdge(e));
          }}
          onDragLeave={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const inside =
              e.clientX > rect.left &&
              e.clientX < rect.right &&
              e.clientY > rect.top &&
              e.clientY < rect.bottom;
            if (!inside) setEdge(false);
          }}
          onDrop={(e) => {
            const id = e.dataTransfer.getData("jig/tab");
            if (id && !split && atRightEdge(e)) {
              e.preventDefault();
              updateLayout((l) => moveTabToPane(l, id, "right"));
            }
            setEdge(false);
          }}
        >
          <div className="flex h-full min-w-0" style={split ? { width: `${ratio * 100}%` } : { flex: 1 }}>
            <TabPane
              pane="left"
              tabs={paneTabs(layout, "left")}
              active={leftActive}
              focused={focus === "left"}
              split={split}
              mounted={mounted}
            />
          </div>
          {split && (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-valuenow={Math.round(ratio * 100)}
                tabIndex={0}
                title="Drag to resize; double-click for half and half"
                data-testid="main-split-handle"
                className="w-1 shrink-0 cursor-col-resize bg-line hover:bg-accent"
                onDoubleClick={resetRatio}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") setRatio(ratio - 0.05);
                  if (e.key === "ArrowRight") setRatio(ratio + 0.05);
                }}
                onPointerDown={(e) => {
                  const rect = area.current?.getBoundingClientRect();
                  if (!rect) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  document.body.classList.add("jig-resizing");
                  const move = (ev: PointerEvent) => setRatio((ev.clientX - rect.left) / rect.width);
                  const up = () => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                    document.body.classList.remove("jig-resizing");
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
              />
              <div className="flex h-full min-w-0 flex-1">
                <TabPane
                  pane="right"
                  tabs={paneTabs(layout, "right")}
                  active={rightActive}
                  focused={focus === "right"}
                  split={split}
                  mounted={mounted}
                />
              </div>
            </>
          )}
          {edge && (
            <div
              className="pointer-events-none absolute inset-y-0 right-0 w-1/2 border-2 border-accent bg-accent-soft"
              data-testid="main-split-drop"
            />
          )}
        </div>
      )}
    </main>
  );
}
