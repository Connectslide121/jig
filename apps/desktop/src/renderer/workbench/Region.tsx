import { EyeOff, MoreHorizontal, PanelBottom, PanelLeft, PanelRight, Sparkles } from "lucide-react";
import type { SideRegion } from "../../shared/layout";
import { requestBuild } from "../addons/buildRequests";
import { cn, ErrorBoundary, IconButton, type MenuEntry, openMenuAt, ResizeHandle } from "../ui";
import { useRegistry } from "./registry";
import { useWorkbench, workbench } from "./store";

const regionNames: Record<SideRegion, string> = {
  left: "left sidebar",
  right: "right sidebar",
  bottom: "bottom panel",
};
const regionIcons = { left: PanelLeft, right: PanelRight, bottom: PanelBottom };

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

const DEFAULT_SIZE: Record<SideRegion, number> = { left: 280, right: 320, bottom: 260 };
const MIN_MAIN = 320;

/** Drag handle that resizes a region; the main area keeps at least 320px. */
function Resizer({ region, size }: { region: SideRegion; size: number }) {
  const max = () => {
    const layout = useWorkbench.getState().layout;
    if (region === "bottom") return window.innerHeight * 0.75;
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
      <Resizer region={region} size={state.size} />
    </section>
  );
}
