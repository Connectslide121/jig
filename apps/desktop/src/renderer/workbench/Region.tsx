import { EyeOff, MoreHorizontal, PanelBottom, PanelLeft, PanelRight, PanelTop, Sparkles } from "lucide-react";
import { type DragEvent, useState } from "react";
import { LOWER_HALF, type SideRegion } from "../../shared/layout";
import { requestBuild } from "../addons/buildRequests";
import { cn, ErrorBoundary, IconButton, type MenuEntry, openMenuAt, ResizeHandle } from "../ui";
import { useRegistry } from "./registry";
import { startViewDrag, useViewDrag, useWorkbench, VIEW_DRAG, workbench } from "./store";

const regionNames: Record<SideRegion, string> = {
  left: "left sidebar",
  left2: "lower left sidebar",
  right: "right sidebar",
  right2: "lower right sidebar",
  bottom: "bottom panel",
};
const regionIcons = {
  left: PanelLeft,
  right: PanelRight,
  bottom: PanelBottom,
};

export function viewMenu(viewId: string, region: SideRegion): MenuEntry[] {
  const owner = useRegistry.getState().views[viewId]?.owner;
  const addonId = owner && owner !== "core" ? owner : undefined;
  return [
    ...(addonId
      ? [
          {
            label: "Change this with AI…",
            icon: Sparkles,
            testId: "change-with-ai",
            onSelect: () => requestBuild({ goal: "", addonId, origin: "addon" }),
          },
          { separator: true } as const,
        ]
      : []),
    // A lower half (split sidebar) is made by dragging a tab there, not from this menu (D-173).
    ...(["left", "right", "bottom"] as const)
      .filter((r) => r !== region)
      .map((r) => ({
        label: `Move to ${regionNames[r]}`,
        icon: regionIcons[r],
        onSelect: () => workbench.moveView(viewId, r),
        testId: `move-view-${r}`,
      })),
    {
      label: "Open as a tab",
      icon: PanelTop,
      onSelect: () => workbench.openViewTab(viewId),
      testId: "move-view-main",
    },
    { separator: true },
    { label: "Hide", icon: EyeOff, onSelect: () => workbench.hideView(viewId), testId: "hide-view" },
  ];
}

const DEFAULT_SIZE: Record<SideRegion, number> = {
  left: 280,
  left2: 260,
  right: 320,
  right2: 260,
  bottom: 260,
};
const MIN_MAIN = 320;

/** Drag handle that resizes a region; the main area keeps at least 320px. */
function Resizer({ region, size }: { region: SideRegion; size: number }) {
  const max = () => {
    const layout = useWorkbench.getState().layout;
    if (region === "bottom" || region === "left2" || region === "right2") return window.innerHeight * 0.75;
    const other = region === "left" ? layout?.right : layout?.left;
    const otherSize = other && !other.collapsed && other.views.length ? other.size : 0;
    return window.innerWidth - otherSize - MIN_MAIN;
  };
  return (
    <ResizeHandle
      edge={region === "left" ? "right" : region === "right" ? "left" : "top"}
      size={size}
      min={120}
      max={max}
      label={`Resize the ${regionNames[region]}`}
      onResize={(next) => workbench.resizeRegion(region, next)}
      onReset={() => workbench.resizeRegion(region, DEFAULT_SIZE[region])}
      data-testid={`resize-${region}`}
    />
  );
}

/**
 * A side region: the bottom panel, or a sidebar with one stack of views, or two when it is split (the
 * lower half has its own tabs and height).
 */
export function Region({ region }: { region: SideRegion }) {
  const state = useWorkbench((s) => s.layout?.[region]);
  const lowerId = LOWER_HALF[region];
  const lower = useWorkbench((s) => (lowerId ? s.layout?.[lowerId] : undefined));
  const views = useRegistry((s) => s.views);
  const [splitDrop, setSplitDrop] = useState(false);
  if (!state || state.collapsed) return null;
  const upper = state.views.some((id) => views[id]);
  const split = Boolean(lowerId && lower?.views.some((id) => views[id]));
  if (!upper && !split) return null;
  const horizontal = region !== "bottom";
  // Not split yet: dragging a view tab over the lower half of the sidebar offers to split it there.
  const canSplit = Boolean(lowerId && !split);
  const inLowerHalf = (e: DragEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY > rect.top + rect.height / 2;
  };
  return (
    <section
      data-testid={`region-${region}`}
      aria-label={regionNames[region]}
      style={horizontal ? { width: state.size } : { height: state.size }}
      className={cn(
        "relative flex shrink-0 flex-col bg-surface",
        region === "left" && "border-r border-line",
        region === "right" && "border-l border-line",
        region === "bottom" && "border-t border-line",
      )}
      onDragOver={(e) => {
        if (!canSplit || !e.dataTransfer.types.includes(VIEW_DRAG) || e.defaultPrevented) return;
        const lowerHalf = inLowerHalf(e);
        setSplitDrop(lowerHalf);
        if (!lowerHalf) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSplitDrop(false);
      }}
      onDrop={(e) => {
        const on = splitDrop;
        setSplitDrop(false);
        const id = e.dataTransfer.getData(VIEW_DRAG);
        if (!canSplit || !lowerId || !on || !id || e.defaultPrevented) return;
        e.preventDefault();
        workbench.dropView(id, lowerId);
      }}
    >
      <Stack region={region} />
      {lowerId && lower && split && (
        <section
          data-testid={`region-${lowerId}`}
          aria-label={regionNames[lowerId]}
          style={upper ? { height: lower.size } : undefined}
          className={cn("relative flex min-h-0 flex-col", upper ? "shrink-0 border-t border-line" : "flex-1")}
        >
          {upper && <Resizer region={lowerId} size={lower.size} />}
          <Stack region={lowerId} />
        </section>
      )}
      {splitDrop && (
        <div
          data-testid={`split-drop-${region}`}
          className="pointer-events-none absolute inset-x-1 bottom-1 top-1/2 flex items-center justify-center rounded-md border-2 border-dashed border-accent bg-accent-soft text-sm font-medium text-accent"
        >
          Drop to split the sidebar
        </div>
      )}
      <Resizer region={region} size={state.size} />
    </section>
  );
}

/** One stack of views: a header with a tab per view, and the active view below. */
function Stack({ region }: { region: SideRegion }) {
  const state = useWorkbench((s) => s.layout?.[region]);
  const [over, setOver] = useState<string | null>(null);
  const views = useRegistry((s) => s.views);
  if (!state) return null;
  const visible = state.views.map((id) => views[id]).filter((v) => v !== undefined);
  if (visible.length === 0) return null;
  const active = visible.find((v) => v.id === state.active) ?? visible[0]!;
  const View = active.component;
  const HeaderActions = active.headerActions;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid={`stack-${region}`}>
      <header className="flex h-8 shrink-0 items-center gap-0.5 border-b border-line px-1.5">
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden rounded-md",
            over === "" && "bg-accent-soft",
          )}
          data-testid={`view-tabs-${region}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(VIEW_DRAG)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (e.target === e.currentTarget) setOver("");
          }}
          onDragLeave={(e) => {
            // Left the bar (not just moved from one of its tabs to another).
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
          }}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(VIEW_DRAG);
            setOver(null);
            if (!id) return;
            e.preventDefault();
            // On a tab: before it; elsewhere on the bar: at the end.
            const before = (e.target as HTMLElement).closest<HTMLElement>("[data-view-id]")?.dataset.viewId;
            workbench.dropView(id, region, before);
          }}
        >
          {visible.map((view) => {
            const Icon = view.icon;
            const isActive = view.id === active.id;
            return (
              <button
                key={view.id}
                type="button"
                data-testid={`view-tab-${view.id}`}
                data-view-id={view.id}
                title={view.title}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(VIEW_DRAG, view.id);
                  e.dataTransfer.effectAllowed = "move";
                  startViewDrag(view.id);
                }}
                onDragOver={(e) => e.dataTransfer.types.includes(VIEW_DRAG) && setOver(view.id)}
                onDragEnd={() => setOver(null)}
                onClick={() => workbench.showView(view.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenuAt(e.currentTarget, viewMenu(view.id, region));
                }}
                className={cn(
                  "flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium",
                  isActive ? "bg-active text-fg" : "text-muted hover:bg-hover hover:text-fg",
                  over === view.id && "border-l-2 border-accent",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {(isActive || visible.length <= 3) && <span className="truncate">{view.title}</span>}
              </button>
            );
          })}
        </div>
        {HeaderActions && <HeaderActions viewId={active.id} region={region} />}
        <IconButton
          icon={MoreHorizontal}
          label={`${active.title} options`}
          size="sm"
          data-testid={`view-menu-${active.id}`}
          onClick={(e) => openMenuAt(e.currentTarget, viewMenu(active.id, region), true)}
        />
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ErrorBoundary key={active.id} label={active.title}>
          <View viewId={active.id} region={region} />
        </ErrorBoundary>
      </div>
    </div>
  );
}

/**
 * While a view is dragged: a drop target at the edge of the window for each sidebar or the bottom
 * panel that isn't showing (collapsed or empty), so a view can go anywhere. Overlays: nothing moves.
 */
export function ViewDropEdges() {
  const dragging = useViewDrag((s) => s.viewId);
  const layout = useWorkbench((s) => s.layout);
  const views = useRegistry((s) => s.views);
  const [over, setOver] = useState<SideRegion | null>(null);
  if (!dragging || !layout) return null;
  const showing = (r: "left" | "right" | "bottom") => {
    const lower = LOWER_HALF[r];
    const ids = [...layout[r].views, ...(lower ? layout[lower].views : [])];
    return !layout[r].collapsed && ids.some((id) => views[id]);
  };
  const edges = (["left", "right", "bottom"] as const).filter((r) => !showing(r));
  return (
    <>
      {edges.map((r) => (
        <div
          key={r}
          data-testid={`view-drop-${r}`}
          className={cn(
            "absolute z-10 flex items-center justify-center rounded-md border-2 border-dashed border-accent text-xs font-medium text-accent",
            over === r ? "bg-accent-soft" : "bg-surface",
            r === "left" && "inset-y-2 left-2 w-24",
            r === "right" && "inset-y-2 right-2 w-24",
            r === "bottom" && "inset-x-28 bottom-2 h-12",
          )}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(VIEW_DRAG)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            setOver(r);
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(VIEW_DRAG);
            setOver(null);
            if (!id) return;
            e.preventDefault();
            e.stopPropagation();
            workbench.moveView(id, r);
          }}
        >
          {regionNames[r]}
        </div>
      ))}
    </>
  );
}
