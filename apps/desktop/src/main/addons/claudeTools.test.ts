import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseManifest } from "@jig/sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { AddonInfo } from "../../shared/addons";
import type { ChatItem, SessionMeta } from "../../shared/engine";
import { addonDataTools, addonTools, paramsShape, toolText } from "./claudeTools";

const meta = { id: "s1", cwd: "/repo", projectId: "p1" } as SessionMeta;

const manifest = parseManifest({
  id: "releases",
  name: "Releases",
  contributes: {
    tools: [
      {
        id: "changes",
        description: "What changed since the last release",
        params: { repo: { optional: true }, limit: { type: "number", optional: true } },
        readOnly: true,
        run: "toolChanges",
      },
    ],
  },
}).manifest!;

const addon = (dir: string): AddonInfo =>
  ({
    id: "releases",
    name: "Releases",
    source: "builtin",
    enabled: true,
    errors: [],
    dir,
    manifest,
  }) as unknown as AddonInfo;

describe("add-on tools for Claude", () => {
  it("turns params into a schema and results into text", () => {
    const shape = z.object(paramsShape(manifest.contributes.tools[0]!.params));
    expect(shape.safeParse({}).success).toBe(true);
    expect(shape.safeParse({ limit: "x" }).success).toBe(false);
    expect(toolText("hi")).toBe("hi");
    expect(toolText({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(toolText(undefined)).toBe("Done.");
  });

  it("registers enabled add-ons' tools, calling host code with the chat", async () => {
    const calls: unknown[] = [];
    const [tool] = addonTools([addon("/x")], async (id, method, args) => {
      calls.push({ id, method, args });
      return { ok: true };
    });
    expect(tool).toMatchObject({ name: "addon_releases_changes", readOnly: true });
    expect(await tool!.handler({ repo: "shop" }, meta)).toBe('{\n  "ok": true\n}');
    expect(calls).toEqual([
      {
        id: "releases",
        method: "toolChanges",
        args: { repo: "shop", chat: { cwd: "/repo", projectId: "p1" } },
      },
    ]);
    expect(addonTools([{ ...addon("/x"), enabled: false }], async () => 0)).toEqual([]);
  });

  it("shows an add-on and changes its data with Undo cards", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jig-addon-"));
    await writeFile(join(dir, "README.md"), "# Releases\nVersions.");
    await writeFile(join(dir, "addon.json"), "{}");
    const store: Record<string, unknown> = { deploys: [1] };
    const cards: ChatItem[] = [];
    const changed: string[] = [];
    const tools = addonDataTools({
      list: () => [addon(dir)],
      all: async () => ({ ...store }),
      set: async (_id, k, v) => {
        store[k] = v;
      },
      remove: async (_id, k) => {
        delete store[k];
      },
      changed: (_id, k) => changed.push(k),
      addCard: async (_s, item) => {
        cards.push(item);
      },
      card: (summary, details, undo) => ({ kind: "change", id: "c", at: "", summary, details, undo }),
    });
    const t = Object.fromEntries(tools.map((x) => [x.name, x]));
    const info = String(await t.jig_get_addon!.handler({ addonId: "releases" }, meta));
    expect(info).toContain("tool addon_releases_changes");
    expect(info).toContain("- deploys: [1]");
    expect(info).toContain("Files (2): README.md, addon.json");
    expect(info).toContain("README.md:\n# Releases");
    expect(await t.jig_get_addon_data!.handler({ addonId: "releases", key: "deploys" }, meta)).toBe(
      "[\n  1\n]",
    );
    await t.jig_set_addon_data!.handler({ addonId: "releases", key: "note", value: { a: 1 } }, meta);
    expect(store.note).toEqual({ a: 1 });
    expect(cards[0]).toMatchObject({ undo: { type: "addonData", key: "note", existed: false } });
    await t.jig_delete_addon_data!.handler({ addonId: "releases", key: "deploys" }, meta);
    expect(store.deploys).toBeUndefined();
    expect(cards[1]).toMatchObject({
      undo: { type: "addonData", key: "deploys", value: [1], existed: true },
    });
    expect(changed).toEqual(["note", "deploys"]);
    await expect(t.jig_get_addon!.handler({ addonId: "nope" }, meta)).rejects.toThrow(/No add-on/);
    expect(t.jig_set_addon_data!.readOnly).toBeFalsy();
  });
});
