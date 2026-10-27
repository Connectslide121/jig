import { describe, expect, it } from "vitest";
import { intervalMs, parseManifest, uiExports } from "./manifest";
import { allowsExec, describePermission, isPermission } from "./permissions";
import { addonActionId, addonTabType, addonViewId, MANIFEST_KEY, SLOTS } from "./slots";

const minimal = { id: "hello", name: "Hello" };

describe("parseManifest", () => {
  it("fills defaults for a minimal manifest", () => {
    const { manifest, errors } = parseManifest(minimal);
    expect(errors).toEqual([]);
    expect(manifest).toMatchObject({ id: "hello", version: "0.1.0", permissions: [], description: "" });
    expect(manifest?.contributes.views).toEqual([]);
  });

  it("accepts every contribution kind", () => {
    const { manifest, errors } = parseManifest({
      ...minimal,
      permissions: ["exec:git", "net", "terminal"],
      contributes: {
        views: [{ id: "main", title: "Hello", component: "HelloView" }],
        tabs: [{ type: "detail", title: "Detail", component: "DetailTab" }],
        topbar: [{ id: "badge", component: "Badge" }],
        statusbar: [{ id: "status", component: "Status", side: "left" }],
        dashboard: [{ id: "card", component: "Card" }],
        actions: [{ id: "say", title: "Say hello", run: "sayHello", shortcut: "Mod+Shift+H" }],
        menus: [{ slot: "context.project", id: "open", title: "Open", run: "openIt" }],
        chatToolbar: [{ id: "btn", component: "Btn" }],
        toolRenderers: [{ tool: "mcp__x__y", component: "Card" }],
        prompts: [{ id: "review", label: "Review", text: "Review the diff" }],
        watchers: [{ id: "poll", every: "5m", run: "poll" }],
        settings: { title: "Hello", component: "Settings" },
        themes: [{ path: "themes/x.json" }],
      },
    });
    expect(errors).toEqual([]);
    expect(manifest?.contributes.views[0]?.region).toBe("left");
    expect(manifest?.contributes.statusbar[0]?.side).toBe("left");
    expect(manifest && uiExports(manifest)).toEqual([
      "HelloView",
      "DetailTab",
      "Badge",
      "Status",
      "Card",
      "sayHello",
      "openIt",
      "Btn",
      "Card",
      "Settings",
    ]);
  });

  it("explains what is wrong", () => {
    expect(parseManifest({ id: "Bad Id", name: "" }).errors).toEqual([
      "id: lower-case letters, digits and dashes, starting with a letter",
      "name: Too small: expected string to have >=1 characters",
    ]);
    expect(parseManifest({ ...minimal, permissions: ["root"] }).errors).toEqual([
      "permissions.0: unknown permission",
    ]);
    expect(
      parseManifest({
        ...minimal,
        contributes: {
          views: [
            { id: "a", title: "A", component: "A" },
            { id: "a", title: "B", component: "B" },
          ],
        },
      }).errors,
    ).toEqual(['contributes.views: "a" is used twice']);
    expect(
      parseManifest({ ...minimal, contributes: { watchers: [{ id: "w", every: "soon", run: "x" }] } })
        .errors[0],
    ).toMatch(/^contributes.watchers.0.every/);
    expect(parseManifest("nope").errors.length).toBe(1);
  });

  it("converts watcher intervals with a 10 s minimum", () => {
    expect(intervalMs("5m")).toBe(300_000);
    expect(intervalMs("1h")).toBe(3_600_000);
    expect(intervalMs("2s")).toBe(10_000);
    expect(intervalMs("x")).toBe(60_000);
  });
});

describe("permissions", () => {
  it("validates names", () => {
    for (const p of ["exec", "exec:git", "exec:az", "fs:read", "fs:write", "net", "terminal", "chat"])
      expect(isPermission(p)).toBe(true);
    for (const p of ["exec:", "fs", "everything", "exec:rm -rf"]) expect(isPermission(p)).toBe(false);
  });

  it("checks exec against exec and exec:<name>", () => {
    expect(allowsExec(["exec"], "anything")).toBe(true);
    expect(allowsExec(["exec:git"], "git")).toBe(true);
    expect(allowsExec(["exec:git"], "C:\\Program Files\\Git\\cmd\\git.exe")).toBe(true);
    expect(allowsExec(["exec:az"], "az.cmd")).toBe(true);
    expect(allowsExec(["exec:git"], "powershell")).toBe(false);
    expect(allowsExec([], "git")).toBe(false);
  });

  it("describes permissions for people", () => {
    expect(describePermission("exec:git")).toBe("Run git.");
    expect(describePermission("net")).toBe("Make network requests.");
  });
});

describe("slots", () => {
  it("has a manifest key for every slot and namespaced ids", () => {
    expect(Object.keys(MANIFEST_KEY).sort()).toEqual(Object.keys(SLOTS).sort());
    expect(addonViewId("git", "branches")).toBe("addon.git.branches");
    expect(addonTabType("git", "commit")).toBe("addon.git.commit");
    expect(addonActionId("git", "fetch")).toBe("addon.git.fetch");
  });
});
