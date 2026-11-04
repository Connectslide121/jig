import {
  ChevronDown,
  Eye,
  FolderPlus,
  Keyboard,
  LayoutDashboard,
  LayoutTemplate,
  MessageSquarePlus,
  Mic,
  Puzzle,
  RotateCcw,
  Save,
  Settings,
  Settings2,
  SquareTerminal,
} from "lucide-react";
import { LOWER_HALF } from "../../shared/layout";
import { openAbout } from "../features/about";
import { TenantChip } from "../features/azure";
import { TopbarSearch } from "../features/goto";
import { ProjectSwatch } from "../features/projects/colors";
import { newTerminalInEntries } from "../features/terminals/shells";
import { call } from "../lib/host";
import type { MenuEntry } from "../ui";
import { cn, ErrorBoundary, IconButton, JigLogo, menuBarOpen, openMenuAt, switchMenuAt } from "../ui";
import { filterActions } from "./actionGroups";
import { addProject, hiddenViews, openSettings, resetLayout, saveLayoutAs } from "./actions";
import { collectLiveEntries, type LiveEntries, withLiveEntries } from "./menuGroups";
import { useActiveProject, useProjects } from "./projects";
import { type ActionDef, runAction, type TopbarItemDef, useRegistry } from "./registry";
import { useWorkbench, workbench } from "./store";

const TOPBAR_MENU = "topbar";
/**
 * Top bar menus merge related action groups (D-174), so the bar stays short; each group is a heading
 * inside its menu. Project actions are in the project switcher. Groups not listed (an add-on's own)
 * get a menu of their own. Search (Ctrl+P or Ctrl+K) also finds registered actions.
 */
const TOPBAR_MENUS: Array<{ menu: string; groups: string[] }> = [
  { menu: "Chats", groups: ["Chats", "Claude", "Workflows", "Meetings"] },
  { menu: "Code", groups: ["Git", "Files", "Terminals", "Pipelines", "Boards"] },
  { menu: "Build", groups: ["Build"] },
  { menu: "View", groups: ["Layout", "Appearance"] },
];
const OWN_MENU = new Set(["Jig", "Projects"]);

/** A top bar menu: the action groups it shows and its entries, given the groups' live entries (D-305). */
interface TopbarMenu {
  menu: string;
  groups: string[];
  entries: (live: LiveEntries) => MenuEntry[];
}

function topbarMenus(groups: Array<{ group: string; actions: ActionDef[] }>, liveGroups: Set<string>) {
  const byGroup = new Map(groups.map((g) => [g.group, g.actions]));
  // A group with live entries (an add-on's menuGroups) gets its menu even without actions.
  for (const name of liveGroups) if (!byGroup.has(name)) byGroup.set(name, []);
  const merged = TOPBAR_MENUS.map(({ menu, groups: names }): TopbarMenu => {
    const parts = names.flatMap((name) => {
      const actions = byGroup.get(name) ?? [];
      return actions.length || liveGroups.has(name) ? [{ name, actions }] : [];
    });
    const items = (name: string, actions: ActionDef[]): MenuEntry[] =>
      name === "Terminals"
        ? [
            ...actionMenu(actions),
            { label: "New terminal in…", icon: SquareTerminal, submenu: newTerminalInEntries() },
          ]
        : actionMenu(actions);
    const section = (live: LiveEntries, name: string, actions: ActionDef[]) =>
      withLiveEntries(live[name], items(name, actions));
    return {
      menu,
      groups: parts.map((p) => p.name),
      entries: (live) =>
        parts.length === 1 && parts[0]!.name !== "Layout"
          ? section(live, parts[0]!.name, parts[0]!.actions)
          : parts.flatMap(({ name, actions }) =>
              // View's layout section brings its own headings (Show, Layout).
              name === "Layout"
                ? layoutSection(live[name], actions)
                : [{ heading: name } as const, ...section(live, name, actions)],
            ),
    };
  }).filter((m) => m.groups.length > 0);
  const taken = new Set([...OWN_MENU, ...TOPBAR_MENUS.flatMap((m) => m.groups)]);
  const others = [...byGroup]
    .filter(([name]) => !taken.has(name))
    .map(
      ([name, actions]): TopbarMenu => ({
        menu: name,
        groups: [name],
        entries: (live) => withLiveEntries(live[name], actionMenu(actions)),
      }),
    );
  return [...merged, ...others];
}

/**
 * Opens a top bar menu (or switches to it on hover), with its groups' live entries computed now. A
 * menu waits for an add-on's slow entries (at most LIVE_MENU_TIMEOUT_MS) rather than growing once
 * open; an answer that comes after another menu was asked for is dropped.
 */
let menuRequest = 0;
function openTopbarMenu(element: HTMLElement, menu: TopbarMenu, hover: boolean) {
  if (hover && !menuBarOpen(TOPBAR_MENU)) return;
  const request = ++menuRequest;
  const show = (live: LiveEntries) => {
    if (request !== menuRequest) return;
    if (hover) switchMenuAt(element, menu.entries(live), TOPBAR_MENU);
    else openMenuAt(element, menu.entries(live), false, TOPBAR_MENU);
  };
  const defs = Object.values(useRegistry.getState().menuGroups).filter((d) => menu.groups.includes(d.group));
  const live = collectLiveEntries(defs);
  if (live instanceof Promise) void live.then(show);
  else show(live);
}

function actionMenu(actions: ActionDef[]): MenuEntry[] {
  return actions.map((action) => ({
    label: action.title,
    icon: action.icon,
    shortcut: action.shortcut,
    onSelect: () => runAction(action.id),
  }));
}

function projectActions(): ActionDef[] {
  const all = filterActions(Object.values(useRegistry.getState().actions), "");
  return all.find((g) => g.group === "Projects")?.actions ?? [];
}

function projectMenu(): MenuEntry[] {
  const { projects, activeId } = useProjects.getState();
  return [
    ...(projects.length ? [{ heading: "Projects" } as const] : []),
    ...projects.map((p) => ({
      label: p.name,
      checked: p.id === activeId,
      leading: <ProjectSwatch color={p.color} />,
      testId: `project-item-${p.name}`,
      onSelect: () => void call("projects.setActive", { id: p.id }),
    })),
    ...(projects.length ? [{ separator: true } as const] : []),
    { label: "New project…", icon: FolderPlus, onSelect: () => void addProject(), testId: "project-add" },
    ...actionMenu(
      projectActions().filter((a) => a.title !== "New project…" && a.title !== "Open project dashboard"),
    ),
    ...(activeId
      ? [
          {
            label: "Project dashboard",
            icon: LayoutDashboard,
            onSelect: () => workbench.openTab("jig.project", { projectId: activeId }),
          },
        ]
      : []),
  ];
}

/** Layouts: the saved ones to switch to, then save and manage. */
function layoutsEntry(): MenuEntry {
  const saved = useWorkbench.getState().layout?.saved ?? [];
  return {
    label: "Layouts",
    icon: LayoutTemplate,
    testId: "layouts-menu",
    submenu: [
      ...saved.map((s) => ({ label: s.name, onSelect: () => workbench.switchLayout(s.name) })),
      ...(saved.length ? [{ separator: true as const }] : []),
      { label: "Save layout as…", icon: Save, testId: "save-layout", onSelect: () => void saveLayoutAs() },
      ...(saved.length
        ? [{ label: "Manage layouts…", icon: Settings2, onSelect: () => openSettings("layout") }]
        : []),
    ],
  };
}

/**
 * Layout actions View shows in its own form (D-335): the region toggles as checked entries, Save layout
 * in Layouts ›, a hidden view in Views ›. They stay registered for search and shortcuts.
 */
const REGION_ACTIONS = {
  left: "jig.toggleLeft",
  right: "jig.toggleRight",
  bottom: "jig.toggleBottom",
} as const;
const SHOWN_AS_LAYOUT_ENTRIES = new Set<string>([
  ...Object.values(REGION_ACTIONS),
  "jig.showHiddenViews",
  "jig.saveLayout",
  "jig.resetLayout",
]);

/**
 * View's layout section: Show (the regions, checked while shown, and every view in Views ›), then
 * Layout (other layout actions, saved layouts, Reset layout last). Read when the menu opens.
 */
function layoutSection(live: MenuEntry[] | undefined, actions: ActionDef[]): MenuEntry[] {
  const layout = useWorkbench.getState().layout;
  const { views, actions: registered } = useRegistry.getState();
  const hidden = hiddenViews();
  const regionEntries = (["left", "right", "bottom"] as const).map(
    (r): MenuEntry => ({
      label: { left: "Left sidebar", right: "Right sidebar", bottom: "Bottom panel" }[r],
      shortcut: registered[REGION_ACTIONS[r]]?.shortcut,
      checked: layout
        ? !layout[r].collapsed &&
          [...layout[r].views, ...(LOWER_HALF[r] ? layout[LOWER_HALF[r]].views : [])].some((v) => views[v])
        : false,
      testId: `view-region-${r}`,
      onSelect: () => workbench.toggleRegion(r),
    }),
  );
  return [
    { heading: "Show" },
    ...regionEntries,
    {
      label: "Views",
      icon: Eye,
      testId: "views-menu",
      submenu: Object.values(views)
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((v) => ({
          label: v.title,
          icon: v.icon,
          checked: !hidden.includes(v),
          // Opens the view (hide it from its own ⋯ menu).
          onSelect: () => workbench.showView(v.id),
        })),
    },
    { heading: "Layout" },
    ...withLiveEntries(live, [
      ...actionMenu(actions.filter((a) => !SHOWN_AS_LAYOUT_ENTRIES.has(a.id))),
      layoutsEntry(),
      { label: "Reset layout", icon: RotateCcw, testId: "reset-layout", onSelect: () => void resetLayout() },
    ]),
  ];
}

/**
 * Items contributed to the top bar (`topbar.item` slot): those placed "right-start" lead the right-hand
 * group, before Suggestions; the others follow Jig's own items (D-305). Each list is sorted by order.
 */
function TopbarItems({ placement }: { placement?: TopbarItemDef["placement"] }) {
  const all = useRegistry((s) => s.topbarItems);
  const items = Object.values(all)
    .filter((item) => item.placement === placement)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!items.length) return null;
  return (
    <div className="no-drag flex items-center gap-1">
      {items.map((item) => (
        <ErrorBoundary key={item.id} label={item.id}>
          <item.component />
        </ErrorBoundary>
      ))}
    </div>
  );
}

/** The "Jig" menu at the left of the top bar: help, setup and updates, always one click away. */
function jigMenu(): MenuEntry[] {
  const actions =
    filterActions(Object.values(useRegistry.getState().actions), "").find((group) => group.group === "Jig")
      ?.actions ?? [];
  return [
    ...actionMenu(actions).map((entry) =>
      "label" in entry && entry.label === "What Jig can do" ? { ...entry, testId: "jig-menu-about" } : entry,
    ),
    { separator: true },
    { label: "Keyboard shortcuts", icon: Keyboard, onSelect: () => openAbout("shortcuts") },
    { label: "Voice commands", icon: Mic, onSelect: () => openAbout("voice") },
    { label: "Extension slots", icon: Puzzle, onSelect: () => openAbout("slots") },
  ];
}

export function Topbar() {
  const project = useActiveProject();
  const mac = navigator.platform.startsWith("Mac");
  const actions = useRegistry((s) => s.actions);
  const menuGroups = useRegistry((s) => s.menuGroups);
  const menus = topbarMenus(
    filterActions(Object.values(actions), ""),
    new Set(Object.values(menuGroups).map((g) => g.group)),
  );
  return (
    <header
      className={cn(
        "drag topbar-insets grid shrink-0 grid-cols-3 items-center gap-3 border-b border-line bg-titlebar px-2 text-sm",
      )}
    >
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          data-testid="jig-menu"
          className={cn(
            "no-drag flex h-7 items-center gap-1.5 rounded-md px-1.5 font-semibold tracking-tight text-accent hover:bg-hover",
            !mac && "ml-0.5",
          )}
          onClick={(e) => openMenuAt(e.currentTarget, jigMenu(), false, TOPBAR_MENU)}
          onMouseEnter={(e) => switchMenuAt(e.currentTarget, jigMenu(), TOPBAR_MENU)}
        >
          <JigLogo className="size-4" />
          Jig
        </button>
        <button
          type="button"
          data-testid="project-switcher"
          className="no-drag flex h-7 max-w-64 items-center gap-1.5 rounded-md px-2 hover:bg-hover"
          onClick={(e) => openMenuAt(e.currentTarget, projectMenu(), false, TOPBAR_MENU)}
          onMouseEnter={(e) => switchMenuAt(e.currentTarget, projectMenu(), TOPBAR_MENU)}
        >
          {project ? (
            <>
              <ProjectSwatch color={project.color} />
              <span className="truncate font-medium">{project.name}</span>
            </>
          ) : (
            <span className="text-muted">No project</span>
          )}
          <ChevronDown className="size-3.5 text-muted" />
        </button>
        <div
          className="tab-strip no-drag flex min-w-0 items-center overflow-x-auto"
          onWheel={(e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
          }}
        >
          {menus.map((m) => (
            <button
              type="button"
              key={m.menu}
              className="no-drag h-7 max-w-32 shrink-0 truncate rounded-md px-2 text-sm hover:bg-hover"
              aria-haspopup="menu"
              data-testid={`tools-group-${m.menu}`}
              onClick={(e) => openTopbarMenu(e.currentTarget, m, false)}
              onMouseEnter={(e) => openTopbarMenu(e.currentTarget, m, true)}
            >
              {m.menu}
            </button>
          ))}
        </div>
      </div>
      {/* Search with New chat beside it; the button keeps its place (invisible) without a project. */}
      <div className="flex min-w-0 items-center justify-center gap-2">
        <TopbarSearch />
        <button
          type="button"
          data-testid="topbar-new-chat"
          disabled={!project}
          className={cn(
            "no-drag flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-2 whitespace-nowrap text-fg hover:border-accent hover:bg-hover",
            !project && "invisible",
          )}
          onClick={() => runAction("jig.newSession")}
        >
          <MessageSquarePlus className="size-4 text-accent" />
          New chat
        </button>
      </div>
      <div className="flex min-w-0 items-center justify-end gap-1">
        <TopbarItems placement="right-start" />
        <TopbarItems />
        <IconButton
          icon={Settings}
          label="Settings"
          data-testid="settings-button"
          onClick={() => openSettings()}
        />
        <TenantChip menuBar={TOPBAR_MENU} />
      </div>
    </header>
  );
}
