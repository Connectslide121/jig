import { EyeOff, MoreHorizontal, PanelBottom, PanelLeft, PanelRight } from "lucide-react";
import { useCallback, useRef } from "react";
import type { SideRegion } from "../../shared/layout";
import { cn, ErrorBoundary, IconButton, type MenuEntry, openMenuAt } from "../ui";
import { useRegistry } from "./registry";
import { useWorkbench, workbench } from "./store";

const regionNames: Record<SideRegion, string> = {
  left: "left sidebar",
  right: "right sidebar",
  bottom: "bottom panel",
};
const regionIcons = { left: PanelLeft, right: PanelRight, bottom: PanelBottom };

export function viewMenu(viewId: string, region: SideRegion): MenuEntry[] {
  return [
    ...(["left", "right", "bottom"] as const)
      .filter((r) => r !== region)
      .map((r) => ({
        label: `Move to ${regionNames[r]}`,
        icon: regionIcons[r],
        onSelect: () => workbench.moveView(viewId, r),
        testId: `move-view-${r}`,
      })),
    { separator: true },
    { label: "Hide", icon: EyeOff, onSelect: () => workbench.hideView(viewId), testId: "hide-view" },
  ];
}

/** Drag handle that resizes a region. */
function Resizer({ region }: { region: SideRegion }) {
  const start = useRef<{ pos: number; size: number }>(undefined);
  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      const size = useWorkbench.getState().layout?.[region].size ?? 280;
      start.current = { pos: region === "bottom" ? event.clientY : event.clientX, size };
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    },
    [region],
  );
  const onPointerMove = (event: React.PointerEvent) => {
    if (!start.current) return;
    const pos = region === "bottom" ? event.clientY : event.clientX;
    const delta = pos - start.current.pos;
    const size = region === "left" ? start.current.size + delta : start.current.size - delta;
    const max = region === "bottom" ? window.innerHeight * 0.75 : window.innerWidth * 0.5;
    workbench.resizeRegion(region, Math.min(size, max));
  };
  return (
    <div
      role="separator"
      aria-orientation={region === "bottom" ? "horizontal" : "vertical"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => {
        start.current = undefined;
      }}
      onDoubleClick={() =>
        workbench.resizeRegion(region, region === "bottom" ? 260 : region === "left" ? 280 : 320)
      }
      className={cn(
        "absolute z-10 bg-transparent transition-colors hover:bg-focus",
        region === "left" && "top-0 -right-0.5 h-full w-1 cursor-col-resize",
        region === "right" && "top-0 -left-0.5 h-full w-1 cursor-col-resize",
        region === "bottom" && "-top-0.5 left-0 h-1 w-full cursor-row-resize",
      )}
    />
  );
}

/** A side region: a header with one tab per view, and the active view below. */
export function Region({ region }: { region: SideRegion }) {
  const state = useWorkbench((s) => s.layout?.[region]);
  const views = useRegistry((s) => s.views);
  if (!state || state.collapsed) return null;
  const visible = state.views.map((id) => views[id]).filter((v) => v !== undefined);
  if (visible.length === 0) return null;
  const active = visible.find((v) => v.id === state.active) ?? visible[0]!;
  const View = active.component;
  const HeaderActions = active.headerActions;
  const horizontal = region !== "bottom";
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
    >
      <header className="flex h-8 shrink-0 items-center gap-0.5 border-b border-line px-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
          {visible.map((view) => {
            const Icon = view.icon;
            const isActive = view.id === active.id;
            return (
              <button
                key={view.id}
                type="button"
                data-testid={`view-tab-${view.id}`}
                title={view.title}
                onClick={() => workbench.showView(view.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenuAt(e.currentTarget, viewMenu(view.id, region));
                }}
                className={cn(
                  "flex h-6 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium",
                  isActive ? "bg-active text-fg" : "text-muted hover:bg-hover hover:text-fg",
                )}
              >
                <Icon className="size-3.5 shrink-0" />
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
      <Resizer region={region} />
    </section>
  );
}
