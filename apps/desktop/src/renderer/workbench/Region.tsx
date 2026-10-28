import {
  ChevronDown,
  ChevronRight,
  EyeOff,
  MoreHorizontal,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Rows3,
  Sparkles,
  SquareStack,
} from "lucide-react";
import { hostOf, type SideRegion } from "../../shared/layout";
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

/** The views a view can be shown below: every placed view that isn't a section (nor itself). */
function hostChoices(viewId: string): MenuEntry[] {
  const layout = useWorkbench.getState().layout;
  const views = useRegistry.getState().views;
  if (!layout) return [];
  return (["left", "right", "bottom"] as const)
    .flatMap((r) => layout[r].views)
    .filter((id) => id !== viewId && views[id] && layout.sections[id]?.includes(viewId) !== true)
    .map((id) => ({
      label: views[id]!.title,
      icon: views[id]!.icon,
      testId: `place-below-${id}`,
      onSelect: () => workbench.placeBelow(viewId, id),
    }));
}

export function viewMenu(viewId: string, region: SideRegion): MenuEntry[] {
  const owner = useRegistry.getState().views[viewId]?.owner;
  const addonId = owner && owner !== "core" ? owner : undefined;
  const layout = useWorkbench.getState().layout;
  const isSection = layout ? Boolean(hostOf(layout, viewId)) : false;
  const below = hostChoices(viewId);
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
    ...(isSection
      ? [
          {
            label: "Move to its own tab",
            icon: SquareStack,
            testId: "section-own-tab",
            onSelect: () => workbench.moveView(viewId, region),
          },
        ]
      : []),
    ...(below.length
      ? [{ label: "Show below…", icon: Rows3, testId: "place-below", submenu: below } as MenuEntry]
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
  const sectionMap = useWorkbench((s) => s.layout?.sections) ?? {};
  if (!state || state.collapsed) return null;
  const visible = state.views.map((id) => views[id]).filter((v) => v !== undefined);
  if (visible.length === 0) return null;
  const active = visible.find((v) => v.id === state.active) ?? visible[0]!;
  const sections = (sectionMap[active.id] ?? []).filter((id) => views[id]);
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
      {sections.map((id) => (
        <Section key={id} viewId={id} region={region} />
      ))}
      <Resizer region={region} size={state.size} />
    </section>
  );
}

const SECTION_HEIGHT = 240;

/**
 * A view shown below the active view, in the same tab (like GitLens below Source Control): a header
 * that collapses it, and its content at a height you drag (`panes["section:<view>"]`).
 */
function Section({ viewId, region }: { viewId: string; region: SideRegion }) {
  const view = useRegistry((s) => s.views[viewId]);
  const closed = useWorkbench((s) => s.layout?.closedSections.includes(viewId) ?? false);
  const height = useWorkbench((s) => s.layout?.panes[`section:${viewId}`]) ?? SECTION_HEIGHT;
  if (!view) return null;
  const View = view.component;
  const Icon = view.icon;
  const HeaderActions = view.headerActions;
  return (
    <div
      className="relative flex shrink-0 flex-col border-t border-line"
      style={closed ? undefined : { height: Math.max(80, height) }}
      data-testid={`section-${viewId}`}
    >
      {!closed && (
        <ResizeHandle
          edge="top"
          size={height}
          min={80}
          max={() => window.innerHeight * 0.7}
          label={`Resize ${view.title}`}
          onResize={(next) => workbench.resizePane(`section:${viewId}`, next)}
          onReset={() => workbench.resetPane(`section:${viewId}`)}
        />
      )}
      <div className="group flex h-7 shrink-0 items-center gap-1 px-1.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 text-2xs font-semibold tracking-wide text-muted uppercase hover:text-fg"
          aria-expanded={!closed}
          data-testid={`section-toggle-${viewId}`}
          onClick={() => workbench.toggleSection(viewId)}
        >
          {closed ? (
            <ChevronRight className="size-3.5 shrink-0" />
          ) : (
            <ChevronDown className="size-3.5 shrink-0" />
          )}
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{view.title}</span>
        </button>
        {!closed && HeaderActions && <HeaderActions viewId={viewId} region={region} />}
        <IconButton
          icon={MoreHorizontal}
          label={`${view.title} options`}
          size="sm"
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          data-testid={`view-menu-${viewId}`}
          onClick={(e) => openMenuAt(e.currentTarget, viewMenu(viewId, region), true)}
        />
      </div>
      {!closed && (
        <div className="min-h-0 flex-1 overflow-hidden">
          <ErrorBoundary key={viewId} label={view.title}>
            <View viewId={viewId} region={region} />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}
