import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { type AddonManifest, addonToolName, scopeLabel } from "@jig/sdk";
import { z } from "zod";
import type { AddonInfo } from "../../shared/addons";
import type { ChatItem, ConfigUndo } from "../../shared/engine";
import type { JigTool } from "../engine/jigTools";

/**
 * Claude and add-ons: the tools add-ons give Claude (`contributes.tools`, slot `claude.tool`), and
 * Jig's own tools to look into any add-on and manage its stored data (with Undo).
 */
type ToolDef = AddonManifest["contributes"]["tools"][number];

/** A tool's params as the zod shape the MCP server wants. */
export function paramsShape(params: ToolDef["params"]): z.ZodRawShape {
  const shape: Record<string, z.ZodType> = {};
  for (const [name, p] of Object.entries(params)) {
    let t: z.ZodType =
      p.enum && p.enum.length
        ? z.enum(p.enum as [string, ...string[]])
        : p.type === "number"
          ? z.number()
          : p.type === "boolean"
            ? z.boolean()
            : p.type === "object"
              ? z.record(z.string(), z.unknown())
              : p.type === "array"
                ? z.array(z.unknown())
                : z.string();
    if (p.description) t = t.describe(p.description);
    shape[name] = p.optional ? t.optional() : t;
  }
  return shape;
}

const MAX_OUTPUT = 60_000;

/** A tool's result as text for Claude (strings as they are, the rest as JSON). */
export function toolText(value: unknown): string {
  const text =
    typeof value === "string" ? value : value === undefined ? "Done." : JSON.stringify(value, null, 2);
  return text.length > MAX_OUTPUT
    ? `${text.slice(0, MAX_OUTPUT)}\n… (cut at ${MAX_OUTPUT} characters)`
    : text;
}

/** The enabled add-ons' tools for the `jig` MCP server. */
export function addonTools(
  addons: AddonInfo[],
  call: (id: string, method: string, args: unknown) => Promise<unknown>,
): JigTool[] {
  return addons
    .filter((a) => a.enabled && a.errors.length === 0 && a.manifest)
    .flatMap((a) =>
      a.manifest!.contributes.tools.map(
        (t): JigTool => ({
          name: addonToolName(a.id, t.id),
          description: `${t.description} (from the ${a.name} add-on)`,
          shape: paramsShape(t.params),
          readOnly: t.readOnly,
          handler: async (args, meta) =>
            toolText(
              await call(a.id, t.run, { ...args, chat: { cwd: meta.cwd, projectId: meta.projectId } }),
            ),
        }),
      ),
    );
}

export interface AddonDataDeps {
  list(): AddonInfo[];
  all(id: string): Promise<Record<string, unknown>>;
  set(id: string, key: string, value: unknown): Promise<void>;
  remove(id: string, key: string): Promise<void>;
  /** The add-on's UI should reload what it shows from storage. */
  changed(id: string, key: string): void;
  addCard(sessionId: string, item: ChatItem): Promise<void>;
  card(summary: string, details: string[], undo?: ConfigUndo): ChatItem;
}

const SKIP = new Set([".git", "node_modules"]);

async function listFiles(dir: string, base = dir, out: string[] = []): Promise<string[]> {
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (SKIP.has(name) || out.length >= 200) continue;
    const full = join(dir, name);
    const s = await stat(full).catch(() => undefined);
    if (s?.isDirectory()) await listFiles(full, base, out);
    else if (s?.isFile()) out.push(relative(base, full).split(sep).join("/"));
  }
  return out;
}

const preview = (v: unknown, max: number) => {
  const text = JSON.stringify(v);
  return text.length > max ? `${text.slice(0, max)}… (${text.length} characters)` : text;
};

/** Jig's tools to see inside any add-on and change its stored data. */
export function addonDataTools(deps: AddonDataDeps): JigTool[] {
  const find = (id: string) => {
    const a = deps.list().find((x) => x.id === id);
    if (!a) throw new Error(`No add-on "${id}" (jig_list_addons lists them)`);
    return a;
  };
  const show = (v: unknown) => (v === undefined ? "(none)" : preview(v, 200));
  return [
    {
      name: "jig_get_addon",
      readOnly: true,
      description:
        "Look inside one of Jig's add-ons: what it is and contributes, its permissions, files, README, and the keys of the data it stores (with a short preview of each value).",
      shape: { addonId: z.string().describe("The add-on's id, from jig_list_addons") },
      handler: async (args) => {
        const a = find(String(args.addonId));
        const data = await deps.all(a.id).catch(() => ({}) as Record<string, unknown>);
        const files = await listFiles(a.dir);
        const readme = await readFile(join(a.dir, "README.md"), "utf8").catch(() => "");
        const c = a.manifest?.contributes;
        return [
          `${a.name} (${a.id}) ${a.version ?? ""} — ${a.source === "builtin" ? "built in" : "yours"}${a.enabled ? "" : ", switched off"}`,
          a.description ?? "",
          a.manifest?.permissions.length
            ? `Permissions: ${a.manifest.permissions.join(", ")}`
            : "Permissions: none",
          `Data: ${scopeLabel(a.manifest?.storage?.scope ?? "global")}${a.manifest?.storage?.scope && a.manifest.storage.scope !== "global" ? ` (keys look like @${a.manifest.storage.scope}(<${a.manifest.storage.scope === "project" ? "project id" : "repository path"}>) <key>; use the full key)` : ""}`,
          c
            ? `Contributes: ${
                [
                  ...c.views.map((v) => `view ${v.title}`),
                  ...c.tabs.map((t) => `tab ${t.title}`),
                  ...c.actions.map((x) => `action ${x.title}`),
                  ...c.watchers.map((w) => `watcher ${w.id} (${w.every})`),
                  ...c.tools.map((t) => `tool ${addonToolName(a.id, t.id)}`),
                ].join(", ") || "nothing"
              }`
            : "",
          a.errors.length ? `Problems: ${a.errors.join("; ")}` : "",
          `Files (${files.length}): ${files.join(", ")}`,
          `Stored data (${Object.keys(data).length} keys):`,
          ...Object.entries(data).map(([k, v]) => `- ${k}: ${preview(v, 300)}`),
          readme ? `\nREADME.md:\n${readme.slice(0, 8000)}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      },
    },
    {
      name: "jig_get_addon_data",
      readOnly: true,
      description:
        "Read the data an add-on stores (its storage, e.g. Workflows' workflows, Releases' deploy log, Pipelines' settings): one key in full, or every key with its value. An add-on whose data is per project or per repository has keys like `@project(<projectId>) <key>` or `@repo(<path>) <key>` (jig_list_projects gives project ids).",
      shape: {
        addonId: z.string(),
        key: z.string().optional().describe("One key; leave out for all of them"),
      },
      handler: async (args) => {
        const a = find(String(args.addonId));
        const data = await deps.all(a.id);
        if (args.key !== undefined) {
          const key = String(args.key);
          if (!(key in data))
            return `${a.name} stores nothing under "${key}". Keys: ${Object.keys(data).join(", ") || "(none)"}`;
          return toolText(JSON.stringify(data[key], null, 2));
        }
        return Object.keys(data).length ? toolText(data) : `${a.name} stores no data yet.`;
      },
    },
    {
      name: "jig_set_addon_data",
      description:
        "Create or replace one key of an add-on's stored data with a JSON value (e.g. add a workflow to Workflows' `workflows:<projectId>`). Read it first with jig_get_addon_data and keep the shape the add-on uses. The user sees a card with Undo.",
      shape: {
        addonId: z.string(),
        key: z.string().min(1).max(200),
        value: z.unknown().describe("The new value (any JSON)"),
      },
      handler: async (args, meta) => {
        const a = find(String(args.addonId));
        const key = String(args.key);
        if (args.value === undefined) throw new Error("Give a value (use jig_delete_addon_data to delete)");
        const before = await deps.all(a.id);
        await deps.set(a.id, key, args.value);
        deps.changed(a.id, key);
        await deps.addCard(
          meta.id,
          deps.card(`Changed ${a.name}'s data`, [`${key}: ${show(before[key])} → ${show(args.value)}`], {
            type: "addonData",
            id: a.id,
            key,
            value: before[key],
            existed: key in before,
          }),
        );
        return `Saved ${key} for ${a.name}.`;
      },
    },
    {
      name: "jig_delete_addon_data",
      description: "Delete one key of an add-on's stored data. The user sees a card with Undo.",
      shape: { addonId: z.string(), key: z.string() },
      handler: async (args, meta) => {
        const a = find(String(args.addonId));
        const key = String(args.key);
        const before = await deps.all(a.id);
        if (!(key in before)) return `${a.name} stores nothing under "${key}".`;
        await deps.remove(a.id, key);
        deps.changed(a.id, key);
        await deps.addCard(
          meta.id,
          deps.card(`Deleted from ${a.name}'s data`, [`${key}: ${show(before[key])}`], {
            type: "addonData",
            id: a.id,
            key,
            value: before[key],
            existed: true,
          }),
        );
        return `Deleted ${key} from ${a.name}.`;
      },
    },
  ];
}
