import {
  ChevronDown,
  CircleHelp,
  Eye,
  FolderPlus,
  Keyboard,
  LayoutDashboard,
  LayoutTemplate,
  MessageSquarePlus,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Puzzle,
  RotateCcw,
  Save,
  Search,
  Settings,
  Settings2,
  Wrench,
} from "lucide-react";
import { LOWER_HALF } from "../../shared/layout";
import { openAbout } from "../features/about";
import { ProjectSwatch } from "../features/projects/colors";
import { call } from "../lib/host";
import type { MenuEntry } from "../ui";
import { cn, ErrorBoundary, IconButton, JigLogo, openMenuAt, switchMenuAt } from "../ui";
import { addProject, hiddenViews, openSettings, resetLayout, saveLayoutAs } from "./actions";
import { useActiveProject, useProjects } from "./projects";
import { type ActionDef, runAction, useRegistry } from "./registry";
import { formatShortcut } from "./shortcuts";
import { useWorkbench, workbench } from "./store";
import { filterActions, openToolsMenu } from "./ToolsMenu";

const TOPBAR_MENU = "topbar";
/**
 * Top bar menus merge related action groups (D-174), so the bar stays short; each group is a heading
 * inside its menu. Project actions are in the project switcher. Groups not listed (an add-on's own)
 * get a menu of their own. The Tools menu (Ctrl+K) still lists every group.
 */
const TOPBAR_MENUS: Array<{ menu: string; groups: string[] }> = [
  { menu: "Chats", groups: ["Chats", "Claude", "Workflows"] },
  { menu: "Code", groups: ["Git", "Files", "Terminals", "Pipelines"] },
  { menu: "Build", groups: ["Build"] },
  { menu: "View", groups: ["Layout", "Appearance"] },
];
const OWN_MENU = new Set(["Jig", "Projects"]);

function topbarMenus(groups: Array<{ group: string; actions: ActionDef[] }>) {
  const byGroup = new Map(groups.map((g) => [g.group, g.actions]));
  const merged = TOPBAR_MENUS.map(({ menu, groups: names }) => {
    const parts = names.flatMap((name) => {
      const actions = byGroup.get(name);
      return actions?.length ? [{ name, actions }] : [];
    });
    const entries: MenuEntry[] =
      parts.length === 1
        ? actionMenu(parts[0]!.actions)
        : parts.flatMap(({ name, actions }) => [{ heading: name } as const, ...actionMenu(actions)]);
    return { menu, entries };
  }).filter((m) => m.entries.length > 0);
  const taken = new Set([...OWN_MENU, ...TOPBAR_MENUS.flatMap((m) => m.groups)]);
  const others = groups
    .filter((g) => !taken.has(g.group))
    .map((g) => ({ menu: g.group, entries: actionMenu(g.actions) }));
  return [...merged, ...others];
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

function layoutMenu(): MenuEntry[] {
  const layout = useWorkbench.getState().layout;
  const views = useRegistry.getState().views;
  const hidden = hiddenViews();
  const regionEntries = (["left", "right", "bottom"] as const).map((r) => ({
    label: { left: "Left sidebar", right: "Right sidebar", bottom: "Bottom panel" }[r],
    icon: { left: PanelLeft, right: PanelRight, bottom: PanelBottom }[r],
    checked: layout
      ? !layout[r].collapsed &&
        [...layout[r].views, ...(LOWER_HALF[r] ? layout[LOWER_HALF[r]].views : [])].some((v) => views[v])
      : false,
    onSelect: () => workbench.toggleRegion(r),
  }));
  return [
    { heading: "Show" },
    ...regionEntries,
    { separator: true },
    {
      label: "Views",
      icon: Eye,
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
    {
      label: "Layouts",
      icon: LayoutTemplate,
      testId: "layouts-menu",
      submenu: [
        ...(layout?.saved ?? []).map((saved) => ({
          label: saved.name,
          onSelect: () => workbench.switchLayout(saved.name),
        })),
        ...(layout?.saved.length ? [{ separator: true as const }] : []),
        { label: "Save layout as…", icon: Save, testId: "save-layout", onSelect: () => void saveLayoutAs() },
        ...(layout?.saved.length
          ? [{ label: "Manage layouts…", icon: Settings2, onSelect: () => openSettings("layout") }]
          : []),
      ],
    },
    { separator: true },
    {
      label: "Reset layout",
      icon: RotateCcw,
      testId: "reset-layout",
      onSelect: () => void resetLayout(),
    },
  ];
}

/** Items contributed to the top bar (`topbar.item` slot). */
function TopbarItems() {
  const items = Object.values(useRegistry((s) => s.topbarItems)).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
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
    { label: "Extension slots", icon: Puzzle, onSelect: () => openAbout("slots") },
  ];
}

export function Topbar() {
  const project = useActiveProject();
  const mac = navigator.platform.startsWith("Mac");
  const actions = useRegistry((s) => s.actions);
  const menus = topbarMenus(filterActions(Object.values(actions), ""));
  return (
    <header
      className={cn(
        "drag topbar-insets flex shrink-0 items-center gap-1 border-b border-line bg-titlebar px-2 text-sm",
      )}
    >
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
        {menus.map(({ menu, entries }) => (
          <button
            type="button"
            key={menu}
            className="no-drag h-7 max-w-32 shrink-0 truncate rounded-md px-2 text-sm hover:bg-hover"
            aria-haspopup="menu"
            data-testid={`tools-group-${menu}`}
            onClick={(e) => openMenuAt(e.currentTarget, entries, false, TOPBAR_MENU)}
            onMouseEnter={(e) => switchMenuAt(e.currentTarget, entries, TOPBAR_MENU)}
          >
            {menu}
          </button>
        ))}
      </div>
      <button
        type="button"
        data-testid="goto-button"
        title={`Go to a chat, file, view or action (${formatShortcut("Mod+P")})`}
        className="no-drag flex h-7 items-center gap-1.5 rounded-md px-2 text-fg hover:bg-hover"
        onClick={() => runAction("jig.goTo")}
      >
        <Search className="size-4 text-muted" />
        <span className="sr-only">Go to</span>
      </button>
      <button
        type="button"
        data-testid="tools-button"
        title={`Every action in Jig (${formatShortcut("Mod+K")})`}
        className="no-drag flex h-7 items-center gap-1.5 rounded-md px-2 text-fg hover:bg-hover"
        onClick={(e) => openToolsMenu(e.currentTarget)}
      >
        <Wrench className="size-4 text-muted" />
        <span className="sr-only">All tools</span>
      </button>
      {project && (
        <button
          type="button"
          data-testid="topbar-new-chat"
          className="no-drag flex h-7 items-center gap-1.5 rounded-md border border-line-strong px-2 text-fg hover:border-accent hover:bg-hover"
          onClick={() => runAction("jig.newSession")}
        >
          <MessageSquarePlus className="size-4 text-accent" />
          New chat
        </button>
      )}
      <div className="flex-1" />
      <TopbarItems />
      <IconButton
        icon={PanelLeft}
        label="Layout and views"
        data-testid="layout-button"
        onClick={(e) => openMenuAt(e.currentTarget, layoutMenu(), true, TOPBAR_MENU)}
        onMouseEnter={(e) => switchMenuAt(e.currentTarget, layoutMenu(), TOPBAR_MENU, true)}
      />
      <IconButton
        icon={CircleHelp}
        label="What Jig can do"
        data-testid="about-button"
        onClick={() => openAbout()}
      />
      <IconButton
        icon={Settings}
        label="Settings"
        data-testid="settings-button"
        onClick={() => openSettings()}
      />
    </header>
  );
}
