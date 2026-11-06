import { z } from "zod";
import { JIG_EVENT_NAMES, type JigEventName } from "./events";
import { isPermission } from "./permissions";
import { CONTEXT_SLOTS } from "./slots";

/**
 * `addon.json`. Components and handlers are named exports of the add-on's `ui.tsx`; watchers are
 * named exports of `host.ts`. Reference: docs/reference/addon-api.md. A JSON Schema for editors is
 * generated into packages/sdk/addon.schema.json (`npm run schema -w @jig/sdk`).
 */
const Id = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "lower-case letters, digits and dashes, starting with a letter");
const ExportName = z.string().regex(/^[A-Za-z_$][\w$]*$/, "the name of an export");
/** A lucide icon name, e.g. "git-branch" (https://lucide.dev/icons). */
const Icon = z.string().optional();

export const ManifestSchema = z.object({
  $schema: z.string().optional(),
  id: Id,
  name: z.string().min(1),
  description: z.string().default(""),
  version: z.string().default("0.1.0"),
  icon: Icon,
  permissions: z.array(z.string().refine(isPermission, "unknown permission")).default([]),
  /**
   * Where the add-on's data lives (D-116): "global" (one copy), "project" (one per project) or "repo"
   * (one per repository). `ctx.storage` / `useStorage` use it with the active project or repository.
   */
  storage: z.object({ scope: z.enum(["global", "project", "repo"]).default("global") }).prefault({}),
  /**
   * Host methods other add-ons may call (`api.addons.call` / `ctx.addons.call`, D-215), e.g. a board
   * add-on asking the Git add-on to create a branch. Nothing else is callable from outside.
   */
  exports: z.array(ExportName).default([]),
  contributes: z
    .object({
      views: z
        .array(
          z.object({
            id: Id,
            title: z.string(),
            icon: Icon,
            region: z.enum(["left", "left2", "right", "right2", "bottom"]).default("left"),
            /** Starts hidden, not in a sidebar: opened from an action in the top bar menus or the Views list. */
            hidden: z.boolean().optional(),
            /** Ignored (older add-ons used it to start below another view; see `left2` / `right2`). */
            under: z.string().optional(),
            component: ExportName,
          }),
        )
        .default([]),
      tabs: z.array(z.object({ type: Id, title: z.string(), icon: Icon, component: ExportName })).default([]),
      topbar: z
        .array(
          z.object({
            id: Id,
            component: ExportName,
            /**
             * "right-start": the first item of the right-hand group, before Suggestions. Left out, the
             * item sits with Jig's own top bar items, after Suggestions (D-305).
             */
            placement: z.enum(["right-start"]).optional(),
            /** Order among the items with the same placement (lower first). */
            order: z.number().default(50),
          }),
        )
        .default([]),
      /**
       * Live entries for a top bar menu group (D-305): `group` is an `actions[].group` title (or the
       * add-on's name, the default group) and `items` a ui.tsx export `(ctx) => MenuInput[]` (or a
       * Promise of them), called each time that menu opens. Its entries show above the group's actions;
       * if it throws or takes longer than half a second, the menu opens with the actions alone.
       */
      menuGroups: z.array(z.object({ group: z.string().min(1), items: ExportName })).default([]),
      statusbar: z
        .array(z.object({ id: Id, side: z.enum(["left", "right"]).default("right"), component: ExportName }))
        .default([]),
      dashboard: z
        .array(z.object({ id: Id, component: ExportName, order: z.number().default(50) }))
        .default([]),
      actions: z
        .array(
          z.object({
            id: Id,
            title: z.string(),
            group: z.string().optional(),
            icon: Icon,
            shortcut: z.string().optional(),
            run: ExportName,
          }),
        )
        .default([]),
      menus: z
        .array(
          z.object({ slot: z.enum(CONTEXT_SLOTS), id: Id, title: z.string(), icon: Icon, run: ExportName }),
        )
        .default([]),
      chatToolbar: z.array(z.object({ id: Id, component: ExportName })).default([]),
      /**
       * Sections of a chat's overview card (D-423): `title` heads the collapsible section, `order` sorts
       * the sections (lower first). The component gets `AddonChatOverviewProps`.
       */
      chatOverview: z
        .array(
          z.object({
            id: Id,
            title: z.string().min(1),
            component: ExportName,
            order: z.number().default(50),
          }),
        )
        .default([]),
      toolRenderers: z
        .array(
          z.object({
            tool: z.string(),
            component: ExportName,
            /**
             * Show the finished card in the chat even where steps are folded into one line (the compact
             * view), without the tool's own header: for a result the user came for (a page), not a step.
             */
            promote: z.boolean().optional(),
          }),
        )
        .default([]),
      /** Approval cards for this add-on's own tools (`tool` is the tool's id in `tools`). */
      permissionRenderers: z
        .array(z.object({ tool: z.string().regex(/^[a-z][a-z0-9_]*$/), component: ExportName }))
        .default([]),
      prompts: z
        .array(z.object({ id: Id, label: z.string(), text: z.string(), send: z.boolean().default(false) }))
        .default([]),
      watchers: z
        .array(
          z.object({
            id: Id,
            /** Interval like "30s", "5m", "1h" (minimum 10s). */
            every: z.string().regex(/^\d+(s|m|h)$/),
            run: ExportName,
            /** Also run once a few seconds after Jig starts (or the add-on loads), e.g. to warm a cache. */
            atStart: z.boolean().default(false),
          }),
        )
        .default([]),
      /**
       * Tools Claude can use in every chat (slot `claude.tool`): a named export of `host.ts` called with
       * the tool's arguments plus `chat` ({ cwd, projectId }) when Claude uses it. `readOnly` tools run
       * without asking; others ask the user first. On the `jig` MCP server as `addon_<add-on>_<id>`.
       */
      tools: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z][a-z0-9_]*$/, "lower-case letters, digits and underscores"),
            /** When Claude should use it, and what it returns. */
            description: z.string().min(10),
            params: z
              .record(
                z.string().regex(/^[a-zA-Z_]\w*$/),
                z.object({
                  type: z.enum(["string", "number", "boolean", "object", "array"]).default("string"),
                  description: z.string().default(""),
                  optional: z.boolean().default(false),
                  /** Allowed values (strings). */
                  enum: z.array(z.string()).optional(),
                }),
              )
              .default({}),
            readOnly: z.boolean().default(false),
            /**
             * Always in Claude's prompt, never deferred behind Claude Code's tool search (D-158): for
             * tools Claude should use on its own, without looking them up first. Costs prompt space in
             * every turn, so keep it for a few.
             */
            alwaysLoad: z.boolean().default(false),
            run: ExportName,
          }),
        )
        .default([]),
      /**
       * What Claude should know in every turn of a chat (slot `claude.context`, D-151): a named export
       * of `host.ts` called with `{ chat }` before each message is sent; the text it returns (up to
       * 4000 characters, '' for nothing) goes with the message, not shown in the transcript.
       */
      context: z.object({ run: ExportName }).optional(),
      /**
       * Host code that runs when something happens in Jig (slot `jig.event`, D-215): a named export of
       * `host.ts` called with the event's payload (`JigEventPayloads`), even when no view is open.
       */
      events: z
        .array(
          z.object({ on: z.enum(JIG_EVENT_NAMES as [JigEventName, ...JigEventName[]]), run: ExportName }),
        )
        .default([]),
      /**
       * Results in Jig's search (slot `search.provider`, D-215): a named export of `host.ts` called with
       * `{ query, projectId, cwd }` as you type, returning up to 8 `AddonSearchResult`s quickly (it is
       * given 1.5 s). `title` heads its group of results.
       */
      search: z.array(z.object({ id: Id, title: z.string(), icon: Icon, run: ExportName })).default([]),
      /**
       * Asks before Jig quits (slot `app.quitGuard`): a named export of `host.ts` called with no
       * arguments when Jig is about to quit, returning `null` or an `AddonQuitAnswer` within 2 s (slower
       * or failing guards are skipped). Jig shows every answer in one modal and quits only on a choice.
       */
      quitGuards: z.array(z.object({ id: Id, run: ExportName })).default([]),
      settings: z.object({ title: z.string(), component: ExportName }).optional(),
      themes: z.array(z.object({ label: z.string().optional(), path: z.string() })).default([]),
    })
    .prefault({}),
});

export type AddonManifest = z.infer<typeof ManifestSchema>;

/** Validates a parsed addon.json; returns readable problems instead of throwing. */
export function parseManifest(json: unknown): { manifest?: AddonManifest; errors: string[] } {
  const result = ManifestSchema.safeParse(json);
  if (result.success) {
    const errors = duplicateIds(result.data);
    return errors.length ? { errors } : { manifest: result.data, errors: [] };
  }
  return {
    errors: result.error.issues.map((issue) => `${issue.path.join(".") || "addon.json"}: ${issue.message}`),
  };
}

function duplicateIds(m: AddonManifest): string[] {
  const errors: string[] = [];
  const check = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`contributes.${kind}: "${id}" is used twice`);
      seen.add(id);
    }
  };
  const c = m.contributes;
  check(
    "views",
    c.views.map((v) => v.id),
  );
  check(
    "tabs",
    c.tabs.map((t) => t.type),
  );
  check(
    "actions",
    c.actions.map((a) => a.id),
  );
  check(
    "menus",
    c.menus.map((a) => a.id),
  );
  check(
    "tools",
    c.tools.map((t) => t.id),
  );
  check(
    "search",
    c.search.map((t) => t.id),
  );
  check(
    "quitGuards",
    c.quitGuards.map((g) => g.id),
  );
  return errors;
}

/** Interval string → milliseconds (at least 10 s). */
export function intervalMs(every: string): number {
  const match = /^(\d+)(s|m|h)$/.exec(every);
  if (!match) return 60_000;
  const n = Number(match[1]) * { s: 1000, m: 60_000, h: 3_600_000 }[match[2] as "s" | "m" | "h"];
  return Math.max(10_000, n);
}

/** UI export names the manifest refers to (for validation against the bundle). */
export function uiExports(m: AddonManifest): string[] {
  const c = m.contributes;
  return [
    ...c.views.map((v) => v.component),
    ...c.tabs.map((t) => t.component),
    ...c.topbar.map((t) => t.component),
    ...c.menuGroups.map((g) => g.items),
    ...c.statusbar.map((s) => s.component),
    ...c.dashboard.map((d) => d.component),
    ...c.actions.map((a) => a.run),
    ...c.menus.map((a) => a.run),
    ...c.chatToolbar.map((t) => t.component),
    ...c.chatOverview.map((t) => t.component),
    ...c.toolRenderers.map((t) => t.component),
    ...c.permissionRenderers.map((t) => t.component),
    ...(c.settings ? [c.settings.component] : []),
  ];
}

/** host.ts export names the manifest refers to (watchers, tools, context, events, search, quit guards, exports). */
export function hostExports(m: AddonManifest): string[] {
  const c = m.contributes;
  return [
    ...new Set([
      ...c.watchers.map((w) => w.run),
      ...c.tools.map((t) => t.run),
      ...(c.context ? [c.context.run] : []),
      ...c.events.map((e) => e.run),
      ...c.search.map((x) => x.run),
      ...c.quitGuards.map((g) => g.run),
      ...m.exports,
    ]),
  ];
}
