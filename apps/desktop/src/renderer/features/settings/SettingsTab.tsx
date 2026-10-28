import {
  Bot,
  Download,
  FolderTree,
  Info,
  LayoutPanelLeft,
  Palette,
  Puzzle,
  Sparkles,
  SquareTerminal,
} from "lucide-react";
import type { ComponentType } from "react";
import { create } from "zustand";
import { updateTabParams } from "../../../shared/layout";
import { cn } from "../../ui";
import { Pane } from "../../workbench/Pane";
import type { TabProps } from "../../workbench/registry";
import { updateLayout } from "../../workbench/store";
import { AddonsSettings } from "./AddonsSettings";
import { AppearanceSettings } from "./Appearance";
import {
  AboutSettings,
  EngineSettings,
  LayoutSettings,
  LearningSettings,
  TerminalSettings,
  UpdatesSettings,
  WorkspacesSettings,
} from "./OtherSections";

export interface SettingsPage {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  component: ComponentType;
  order: number;
  owner?: string;
}

/** Settings pages; add-ons contribute their own (`settings.page` slot, phase 6). */
export const useSettingsPages = create<{ pages: Record<string, SettingsPage> }>(() => ({
  pages: {
    appearance: {
      id: "appearance",
      title: "Appearance",
      icon: Palette,
      component: AppearanceSettings,
      order: 0,
    },
    layout: { id: "layout", title: "Layout", icon: LayoutPanelLeft, component: LayoutSettings, order: 1 },
    workspaces: {
      id: "workspaces",
      title: "Workspaces",
      icon: FolderTree,
      component: WorkspacesSettings,
      order: 1.5,
    },
    engine: { id: "engine", title: "Claude Code", icon: Bot, component: EngineSettings, order: 2 },
    terminal: {
      id: "terminal",
      title: "Terminal",
      icon: SquareTerminal,
      component: TerminalSettings,
      order: 3,
    },
    updates: { id: "updates", title: "Updates", icon: Download, component: UpdatesSettings, order: 90 },
    learning: { id: "learning", title: "Learning", icon: Sparkles, component: LearningSettings, order: 4 },
    addons: { id: "addons", title: "Add-ons", icon: Puzzle, component: AddonsSettings, order: 5 },
    about: { id: "about", title: "About", icon: Info, component: AboutSettings, order: 100 },
  },
}));

export function registerSettingsPage(page: SettingsPage): () => void {
  useSettingsPages.setState((s) => ({ pages: { ...s.pages, [page.id]: page } }));
  return () =>
    useSettingsPages.setState((s) => {
      const next = { ...s.pages };
      delete next[page.id];
      return { pages: next };
    });
}

export function SettingsTab({ tabId, params }: TabProps) {
  const pages = Object.values(useSettingsPages((s) => s.pages)).sort((a, b) => a.order - b.order);
  const current = pages.find((p) => p.id === params.section) ?? pages[0]!;
  const Page = current.component;
  return (
    <div className="flex h-full" data-testid="settings">
      <Pane
        id="jig.settings.nav"
        edge="right"
        defaultSize={208}
        min={150}
        max={420}
        label="Resize the settings list"
        className="border-r border-line bg-surface"
      >
        <nav className="h-full overflow-y-auto p-2">
          {pages.map((page) => {
            const Icon = page.icon;
            return (
              <button
                key={page.id}
                type="button"
                data-testid={`settings-nav-${page.id}`}
                onClick={() => updateLayout((l) => updateTabParams(l, tabId, { section: page.id }))}
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
                  page.id === current.id ? "bg-active text-fg" : "text-muted hover:bg-hover hover:text-fg",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{page.title}</span>
              </button>
            );
          })}
        </nav>
      </Pane>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl p-6">
          <Page />
        </div>
      </div>
    </div>
  );
}
