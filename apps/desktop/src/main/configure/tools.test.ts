import { describe, expect, it } from "vitest";
import type { AddonInfo } from "../../shared/addons";
import { type DeepPartial, deepMerge, defaultConfig, type JigConfig } from "../../shared/config";
import type { ChatItem, SessionMeta } from "../../shared/engine";
import { defaultLayout, normalizeLayout } from "../../shared/layout";
import type { ProjectsState } from "../../shared/projects";
import { applyUndo, type ConfigureDeps, configureTools } from "./tools";

function setup() {
  let config = defaultConfig();
  let layout = normalizeLayout(defaultLayout(), [
    { id: "jig.projects", defaultRegion: "left" },
    { id: "jig.terminals", defaultRegion: "bottom" },
  ]);
  const enabled: Record<string, boolean> = { git: true };
  let projects: ProjectsState = {
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
    updateProject: async (id, patch) => {
      projects = {
        ...projects,
        projects: projects.projects.map((p) =>
          p.id === id
            ? {
                ...p,
                ...(patch.name ? { name: patch.name } : {}),
                ...(patch.color ? { color: patch.color } : {}),
              }
            : p,
        ),
      };
    },
    addCard: async (_id, item) => {
      cards.push(item);
    },
  };
  const tools = Object.fromEntries(configureTools(deps).map((t) => [t.name, t]));
  const meta = { id: "s1", projectId: "p1" } as SessionMeta;
  const call = (name: string, args: Record<string, unknown> = {}) => tools[name]!.handler(args, meta);
  return { deps, call, cards, tools, get: () => ({ config, layout, enabled, projects }) };
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
    ).toEqual(["jig_find_themes", "jig_get_layout", "jig_get_settings", "jig_list_themes"]);
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
});
