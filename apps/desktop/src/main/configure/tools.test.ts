import { describe, expect, it } from "vitest";
import type { AddonInfo } from "../../shared/addons";
import { type DeepPartial, deepMerge, defaultConfig, type JigConfig } from "../../shared/config";
import type { ChatItem, SessionMeta } from "../../shared/engine";
import { defaultLayout, normalizeLayout } from "../../shared/layout";
import type { ProjectsState } from "../../shared/projects";
import { outputText } from "../engine/types";
import { applyUndo, type ConfigureDeps, configureTools } from "./tools";

function setup() {
  let config = defaultConfig();
  let layout = normalizeLayout(defaultLayout(), [
    { id: "jig.projects", defaultRegion: "left" },
    { id: "jig.terminals", defaultRegion: "bottom" },
  ]);
  const enabled: Record<string, boolean> = { git: true };
  let projects: ProjectsState = {
    workspaces: [],
    activeId: "p1",
    projects: [
      {
        id: "p1",
        name: "shop",
        path: "/shop",
        color: "accent",
        addedAt: "",
        exists: true,
        isGitRepo: true,
        repos: [],
      },
    ],
  };
  const cards: ChatItem[] = [];
  let chats = [
    { id: "s1", projectId: "p1", title: "Fix cart", kind: "chat" },
    { id: "s2", title: "Loose chat", kind: "chat" },
  ] as unknown as SessionMeta[];
  const deps: ConfigureDeps = {
    config: () => config,
    updateConfig: async (patch) => {
      config = deepMerge<JigConfig>(config, patch as DeepPartial<JigConfig>);
    },
    themes: async () =>
      [
        { id: "jig-dark", label: "Jig Dark", appearance: "dark", source: "builtin" },
        { id: "vscode:dracula/dracula", label: "Dracula", appearance: "dark", source: "vscode" },
      ] as never,
    iconThemes: async () => ({ themes: [], vscodeSetting: "material-icon-theme" }),
    searchThemes: async () => [],
    installTheme: async () => [],
    layout: async () => layout,
    setLayout: async (l) => {
      layout = l;
    },
    addons: () =>
      [
        { id: "git", name: "Git", enabled: enabled.git, manifest: { contributes: { views: [] } } },
      ] as unknown as AddonInfo[],
    setAddonEnabled: async (id, on) => {
      enabled[id] = on;
    },
    projects: async () => projects,
    createProject: async (input) => {
      const project = {
        ...projects.projects[0]!,
        ...input,
        id: "p2",
        exists: true,
        isGitRepo: true,
        repos: [],
      };
      projects = { ...projects, projects: [...projects.projects, project as never], activeId: "p2" };
      return project as never;
    },
    updateProject: async (id, patch) => {
      projects = {
        ...projects,
        projects: projects.projects.map((p) => {
          if (p.id !== id) return p;
          const next: Record<string, unknown> = { ...p };
          for (const [k, v] of Object.entries(patch)) {
            if (v === "" || (Array.isArray(v) && !v.length)) delete next[k];
            else if (v !== undefined) next[k] = v;
          }
          return next as never;
        }),
      };
    },
    removeProject: async (id) => {
      projects = { ...projects, projects: projects.projects.filter((p) => p.id !== id) };
    },
    setFocusRepo: async (id, repo) => {
      projects = {
        ...projects,
        projects: projects.projects.map((p) => (p.id === id ? { ...p, focusRepo: repo } : p)),
      };
    },
    chats: async () => chats,
    setChatProject: async (id, projectId) => {
      chats = chats.map((c) => (c.id === id ? { ...c, projectId } : c));
    },
    setChatPinned: async (id, pinned) => {
      chats = chats.map((c) => (c.id === id ? { ...c, pinned } : c));
    },
    addCard: async (_id, item) => {
      cards.push(item);
    },
  };
  const tools = Object.fromEntries(configureTools(deps).map((t) => [t.name, t]));
  const meta = { id: "s1", projectId: "p1" } as SessionMeta;
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    outputText(await tools[name]!.handler(args, meta));
  return { deps, call, cards, tools, get: () => ({ config, layout, enabled, projects, chats }) };
}

describe("configure tools", () => {
  it("reads settings without protected ones, and marks reading tools as read-only", async () => {
    const { call, tools } = setup();
    const text = await call("jig_get_settings");
    const json = text.split("\n\nWhat they mean")[0]!;
    expect(json).toContain('"themeId": "jig-dark"');
    expect(json).not.toContain("allowApiKey");
    expect(json).not.toContain("claudePath");
    expect(json).not.toContain("buildCommand");
    expect(text).toContain("Not changeable here");
    expect(
      Object.values(tools)
        .filter((t) => t.readOnly)
        .map((t) => t.name)
        .sort(),
    ).toEqual([
      "jig_find_themes",
      "jig_get_layout",
      "jig_get_settings",
      "jig_list_projects",
      "jig_list_themes",
    ]);
  });

  it("changes settings with validation, refuses protected ones, and undoes", async () => {
    const { call, cards, deps, get } = setup();
    const out = await call("jig_update_settings", {
      patch: { appearance: { themeId: "vscode:dracula/dracula", density: "compact" } },
    });
    expect(out).toContain('appearance.themeId: "jig-dark" → "vscode:dracula/dracula"');
    expect(get().config.appearance).toMatchObject({ themeId: "vscode:dracula/dracula", density: "compact" });
    const change = cards[0] as Extract<ChatItem, { kind: "change" }>;
    expect(change.details).toEqual([
      'appearance.themeId: "jig-dark" → "vscode:dracula/dracula"',
      'appearance.density: "comfortable" → "compact"',
    ]);
    await applyUndo(deps, change.undo!);
    expect(get().config.appearance).toMatchObject({ themeId: "jig-dark", density: "comfortable" });

    await expect(call("jig_update_settings", { patch: { engine: { allowApiKey: true } } })).rejects.toThrow(
      /only be changed in Settings/,
    );
    await expect(
      call("jig_update_settings", { patch: { updates: { buildCommand: "rm -rf /" } } }),
    ).rejects.toThrow(/only be changed in Settings/);
    await expect(call("jig_update_settings", { patch: { appearance: { themeId: "nope" } } })).rejects.toThrow(
      /Unknown theme/,
    );
    await expect(call("jig_update_settings", { patch: { appearance: { fontSize: 40 } } })).rejects.toThrow(
      /Invalid settings/,
    );
    expect(await call("jig_update_settings", { patch: { appearance: { radius: "soft" } } })).toMatch(
      /^Nothing to change/,
    );
    expect(cards).toHaveLength(1);
  });

  it("changes the layout, add-ons and projects, each undoable", async () => {
    const { call, cards, deps, get } = setup();
    await call("jig_change_layout", { ops: [{ op: "move", view: "jig.terminals", region: "right" }] });
    expect(get().layout.right.views).toContain("jig.terminals");
    await expect(call("jig_change_layout", { ops: [{ op: "hide", view: "nope" }] })).rejects.toThrow(
      /Unknown view/,
    );
    await call("jig_set_addon_enabled", { id: "git", enabled: false });
    expect(get().enabled.git).toBe(false);
    await call("jig_update_project", { name: "Webshop", color: "info" });
    expect(get().projects.projects[0]).toMatchObject({ name: "Webshop", color: "info" });
    for (const c of [...cards].reverse())
      await applyUndo(deps, (c as Extract<ChatItem, { kind: "change" }>).undo!);
    expect(get().layout.right.views).not.toContain("jig.terminals");
    expect(get().enabled.git).toBe(true);
    expect(get().projects.projects[0]).toMatchObject({ name: "shop", color: "accent" });
  });

  it("creates projects, sets their defaults and organises chats, each undoable", async () => {
    const { call, cards, deps, get, tools } = setup();
    expect(tools.jig_list_projects!.readOnly).toBe(true);
    const list = await call("jig_list_projects");
    expect(list).toContain("shop [p1] (active)");
    expect(list).toContain('"Loose chat" [s2] in no project');

    await call("jig_update_project", {
      instructions: "Release notes in Swedish",
      permissionMode: "plan",
      starters: ["Plan the next ticket"],
    });
    expect(get().projects.projects[0]).toMatchObject({
      instructions: "Release notes in Swedish",
      permissionMode: "plan",
      starters: ["Plan the next ticket"],
    });
    await call("jig_create_project", { name: "Podium", path: "/repos/podium", model: "opus" });
    expect(get().projects.projects.map((p) => p.name)).toEqual(["shop", "Podium"]);
    await call("jig_move_chat", { chatId: "s2", projectId: "p2", pinned: true });
    expect(get().chats.find((c) => c.id === "s2")).toMatchObject({ projectId: "p2", pinned: true });

    for (const c of [...cards].reverse())
      await applyUndo(deps, (c as Extract<ChatItem, { kind: "change" }>).undo!);
    expect(get().chats.find((c) => c.id === "s2")).toMatchObject({ projectId: undefined, pinned: false });
    expect(get().projects.projects.map((p) => p.name)).toEqual(["shop"]);
    expect(get().projects.projects[0]?.instructions).toBeUndefined();
    expect(get().projects.projects[0]?.permissionMode).toBeUndefined();
  });

  it("adds and replaces project links, undoable", async () => {
    const { call, cards, deps, get } = setup();
    await call("jig_add_project_links", {
      group: "Stage",
      links: [
        { url: "https://stage.shop.se" },
        { url: "https://dev.azure.com/c/S/_git/shop", label: "Repo" },
      ],
    });
    const links = get().projects.projects[0]!.links!;
    expect(links.map((g) => g.title)).toEqual(["Stage"]);
    expect(links[0]!.links.map((l) => l.type)).toEqual(["website", "devops-repo"]);
    expect(await call("jig_list_projects")).toContain("links: Stage [");
    await call("jig_set_project_links", { groups: [{ title: "Prod", links: [{ url: "https://shop.se" }] }] });
    expect(get().projects.projects[0]!.links!.map((g) => g.title)).toEqual(["Prod"]);
    for (const c of [...cards].reverse())
      await applyUndo(deps, (c as Extract<ChatItem, { kind: "change" }>).undo!);
    expect(get().projects.projects[0]!.links ?? []).toEqual([]);
  });
});
