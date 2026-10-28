import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { addonViewId } from "@jig/sdk";
import { z } from "zod";
import type { AddonInfo } from "../../shared/addons";
import type { BuildJob, BuildKind, LayoutOp } from "../../shared/builds";
import { ConfigSchema, type DeepPartial, deepMerge, type JigConfig } from "../../shared/config";
import { hideView, type Layout, moveView, type SideRegion, setRegion, showView } from "../../shared/layout";

/**
 * The `jig-builder` tools. Defined once and used both as an in-process MCP server for Claude Code
 * (ClaudeEngine) and as plain handlers (FakeEngine's scripted builder in tests).
 */
export const CORE_VIEWS: Array<{ id: string; title: string; region: SideRegion }> = [
  { id: "jig.projects", title: "Projects", region: "left" },
  { id: "jig.sessions", title: "Sessions", region: "left" },
  { id: "jig.terminals", title: "Terminals", region: "bottom" },
  { id: "jig.builds", title: "Builds", region: "bottom" },
  { id: "jig.suggestions", title: "Suggestions", region: "right" },
];

export interface BuilderEnv {
  job: () => BuildJob;
  update: (patch: Partial<BuildJob>) => void;
  addons: () => AddonInfo[];
  catalogText: () => string;
  layout: () => Promise<Layout>;
  config: () => JigConfig;
  /** Prepares an add-on folder in the worktree and returns it. */
  startAddon: (id: string, mode: "change" | "new") => Promise<string>;
  validate: (id: string) => Promise<{ ok: boolean; problems: string[] }>;
  finish: (input: { summary: string; kind: BuildKind; addonId?: string }) => Promise<string>;
}

export interface BuilderTool {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

const MAX_READ = 200_000;

async function listFiles(dir: string, root = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(path, root)));
    else out.push(relative(root, path).split(sep).join("/"));
  }
  return out;
}

export function allViews(addons: AddonInfo[]) {
  return [
    ...CORE_VIEWS,
    ...addons.flatMap((a) =>
      (a.manifest?.contributes.views ?? []).map((v) => ({
        id: addonViewId(a.id, v.id),
        title: `${v.title} (${a.name})`,
        region: v.region,
      })),
    ),
  ];
}

/** Applies layout operations; throws on unknown views. Pure apart from the view list. */
export function applyLayoutOps(layout: Layout, ops: LayoutOp[], viewIds: string[]): Layout {
  let next = layout;
  for (const op of ops) {
    if (op.view && !viewIds.includes(op.view))
      throw new Error(`Unknown view "${op.view}". Use an id from the catalog.`);
    if (op.op === "move" && op.view && op.region) next = moveView(next, op.view, op.region);
    else if (op.op === "hide" && op.view) next = hideView(next, op.view);
    else if (op.op === "show" && op.view) next = showView(next, op.view, op.region ?? "left");
    else if (op.op === "resize" && op.region && op.size) next = setRegion(next, op.region, { size: op.size });
    else if (op.op === "collapse" && op.region) next = setRegion(next, op.region, { collapsed: true });
    else if (op.op === "expand" && op.region) next = setRegion(next, op.region, { collapsed: false });
    else throw new Error(`Incomplete operation: ${JSON.stringify(op)}`);
  }
  return next;
}

export function builderTools(env: BuilderEnv): BuilderTool[] {
  return [
    {
      name: "catalog",
      description:
        "Everything that exists: add-ons (with what they contribute, permissions and README), views and where they are, settings, slots.",
      shape: {},
      handler: async () => {
        const layout = await env.layout();
        const views = allViews(env.addons())
          .map((v) => {
            const where =
              (["left", "right", "bottom"] as const).find((r) => layout[r].views.includes(v.id)) ??
              (layout.hidden.includes(v.id) ? "hidden" : v.region);
            return `- ${v.id} — ${v.title}: ${where}`;
          })
          .join("\n");
        const regions = (["left", "right", "bottom"] as const)
          .map((r) => `${r}: ${layout[r].collapsed ? "collapsed" : "open"}, ${layout[r].size}px`)
          .join("; ");
        const readmes = env
          .addons()
          .filter((a) => a.readme)
          .map((a) => `### ${a.id} (${a.source}, folder ${a.dir})\n${a.readme!.slice(0, 1500)}`)
          .join("\n\n");
        const settings = JSON.stringify(env.config(), null, 1);
        return `## Add-ons\n${env.catalogText()}\n\n## Views (id — title: where)\n${views}\nRegions: ${regions}\n\n## Settings (config.json)\n${settings}\n\n## Add-on READMEs\n${readmes}`;
      },
    },
    {
      name: "read_addon",
      description: "Read every file of an add-on (built-in or the user's).",
      shape: { id: z.string() },
      handler: async ({ id }) => {
        const addon = env.addons().find((a) => a.id === id);
        if (!addon) return `No add-on "${String(id)}". Call catalog to see the ids.`;
        let total = 0;
        const parts: string[] = [];
        for (const file of await listFiles(addon.dir)) {
          const content = await readFile(join(addon.dir, file), "utf8").catch(() => "(binary)");
          total += content.length;
          if (total > MAX_READ) {
            parts.push(`--- ${file} (not shown: the add-on is large)`);
            continue;
          }
          parts.push(`--- ${file}\n${content}`);
        }
        return `Folder: ${addon.dir}\n\n${parts.join("\n\n")}`;
      },
    },
    {
      name: "start_addon",
      description:
        'Prepare an add-on to work on. mode "change": an existing add-on (a built-in one is copied into the user\'s add-ons). mode "new": a new add-on with this id. Returns the folder to write in.',
      shape: { id: z.string().regex(/^[a-z][a-z0-9-]*$/), mode: z.enum(["change", "new"]) },
      handler: async ({ id, mode }) => {
        const folder = await env.startAddon(String(id), mode as "change" | "new");
        return `Work in this folder (and only here): ${folder}\nWhen done, call validate with id "${String(id)}", fix what it reports, then finish.`;
      },
    },
    {
      name: "validate",
      description: "Check the add-on you are building: manifest, bundles, exports, design tokens, README.",
      shape: { id: z.string() },
      handler: async ({ id }) => {
        const result = await env.validate(String(id));
        return result.ok
          ? "Valid. Call finish."
          : `Fix these problems, then validate again:\n- ${result.problems.join("\n- ")}`;
      },
    },
    {
      name: "stage_layout",
      description:
        'Level 1: stage layout changes for the user to accept. ops: [{ op: "move", view, region } | { op: "hide", view } | { op: "show", view } | { op: "resize", region, size } | { op: "collapse" | "expand", region }]. View ids come from the catalog.',
      shape: {
        ops: z.array(
          z.object({
            op: z.enum(["move", "hide", "show", "resize", "collapse", "expand"]),
            view: z.string().optional(),
            region: z.enum(["left", "right", "bottom"]).optional(),
            size: z.number().optional(),
          }),
        ),
      },
      handler: async ({ ops }) => {
        const list = ops as LayoutOp[];
        const layout = applyLayoutOps(
          await env.layout(),
          list,
          allViews(env.addons()).map((v) => v.id),
        );
        const job = env.job();
        env.update({
          staged: { ...job.staged, layoutOps: [...(job.staged?.layoutOps ?? []), ...list], layout },
        });
        return `Staged ${list.length} layout change(s). Call finish with kind "layout".`;
      },
    },
    {
      name: "stage_settings",
      description:
        "Level 1: stage a settings change (a partial config.json object, see the catalog) for the user to accept.",
      shape: { patch: z.record(z.string(), z.unknown()) },
      handler: async ({ patch }) => {
        const job = env.job();
        const merged = deepMerge(job.staged?.settings ?? {}, patch as DeepPartial<JigConfig>);
        const check = ConfigSchema.safeParse(deepMerge(env.config(), merged));
        if (!check.success)
          return `Invalid settings: ${check.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
        env.update({ staged: { ...job.staged, settings: merged } });
        return 'Staged. Call finish with kind "settings".';
      },
    },
    {
      name: "propose_app_change",
      description:
        "Level 3: the request needs a change to Jig's own source code (no slot can do it). Explain why and what you'd change.",
      shape: { reason: z.string(), plan: z.string() },
      handler: async ({ reason, plan }) =>
        env.finish({
          summary: `Needs a change to Jig itself: ${String(reason)}\n\nPlan: ${String(plan)}`,
          kind: "app",
        }),
    },
    {
      name: "finish",
      description:
        'Done. kind: "layout" | "settings" | "change-addon" | "new-addon" | "nothing". Jig validates and shows the user a preview to accept or discard.',
      shape: {
        summary: z.string().describe("What the user will see and how to reach it, in plain language"),
        kind: z.enum(["layout", "settings", "change-addon", "new-addon", "nothing"]),
        addonId: z.string().optional(),
      },
      handler: async ({ summary, kind, addonId }) =>
        env.finish({
          summary: String(summary),
          kind: kind as BuildKind,
          addonId: addonId as string | undefined,
        }),
    },
  ];
}

export async function folderExists(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );
}
