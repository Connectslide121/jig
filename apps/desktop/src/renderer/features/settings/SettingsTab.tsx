import {
  BrainCircuit,
  Cloud,
  Download,
  Factory,
  FileCode,
  FolderTree,
  Info,
  LayoutPanelLeft,
  MessagesSquare,
  Mic,
  Palette,
  Puzzle,
  Smartphone,
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
import { AzureSettings } from "../azure/AzureSettings";
import { PhoneSettings } from "../phone/PhoneSettings";
import { SpeechSettings } from "../speech/SpeechSettings";
import { AddonsSettings } from "./AddonsSettings";
import { AiFeaturesSettings } from "./AiFeatures";
import { AppearanceSettings } from "./Appearance";
import { ChatSettings } from "./ChatSettings";
import {
  AboutSettings,
  EditorSettings,
  FactorySettings,
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
  /** Words Go to finds the page by besides its title (what's on it: "telegram" for Phone). */
  keywords?: string[];
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
      keywords: ["theme", "dark", "light", "font", "colours", "colors", "density", "icons", "file icons"],
    },
    layout: {
      id: "layout",
      title: "Layout",
      icon: LayoutPanelLeft,
      component: LayoutSettings,
      order: 1,
      keywords: ["views", "sidebar", "panels", "reset layout"],
    },
    workspaces: {
      id: "workspaces",
      title: "Workspaces",
      icon: FolderTree,
      component: WorkspacesSettings,
      order: 1.5,
      keywords: ["folders", "repositories", "repos"],
    },
    engine: {
      id: "engine",
      title: "Chats",
      icon: MessagesSquare,
      component: ChatSettings,
      order: 2,
      keywords: [
        "claude",
        "chatgpt",
        "codex",
        "model",
        "permission mode",
        "effort",
        "provider",
        "limit",
        "titles",
      ],
    },
    ai: {
      id: "ai",
      title: "AI features",
      icon: BrainCircuit,
      component: AiFeaturesSettings,
      order: 2.2,
      keywords: ["models", "helper", "suggestions", "provider"],
    },
    editor: {
      id: "editor",
      title: "Editor",
      icon: FileCode,
      component: EditorSettings,
      order: 2.5,
      keywords: ["code completion", "language servers", "monaco"],
    },
    terminal: {
      id: "terminal",
      title: "Terminal",
      icon: SquareTerminal,
      component: TerminalSettings,
      order: 3,
      keywords: ["shell", "powershell", "bash", "font"],
    },
    phone: {
      id: "phone",
      title: "Phone",
      icon: Smartphone,
      component: PhoneSettings,
      order: 3.6,
      keywords: [
        "telegram",
        "bot",
        "mobile",
        "iphone",
        "notifications",
        "away",
        "topics",
        "voice messages",
        "screenshots",
        "keep awake",
      ],
    },
    azure: {
      id: "azure",
      title: "Azure",
      icon: Cloud,
      component: AzureSettings,
      order: 3.7,
      keywords: ["tenant", "az", "devops", "sign in"],
    },
    updates: {
      id: "updates",
      title: "Updates",
      icon: Download,
      component: UpdatesSettings,
      order: 90,
      keywords: ["version", "install", "release"],
    },
    speech: {
      id: "speech",
      title: "Speech",
      icon: Mic,
      component: SpeechSettings,
      order: 3.5,
      keywords: ["dictation", "whisper", "microphone", "voice", "read aloud", "hey jig", "voice commands"],
    },
    learning: {
      id: "learning",
      title: "Learning",
      icon: Sparkles,
      component: LearningSettings,
      order: 4,
      keywords: ["suggestions", "reflection", "activity"],
    },
    addons: {
      id: "addons",
      title: "Add-ons",
      icon: Puzzle,
      component: AddonsSettings,
      order: 5,
      keywords: ["extensions", "plugins"],
    },
    factory: {
      id: "factory",
      title: "Jig factory",
      icon: Factory,
      component: FactorySettings,
      order: 5.5,
      keywords: ["demo kit", "demos", "prototype"],
    },
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
