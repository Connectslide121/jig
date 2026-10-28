import { z } from "zod";
import type { MethodName } from "../../shared/ipc";

/**
 * Checks at the IPC boundary. The renderer (which add-on UI code shares) is not trusted with the host:
 * calls must come from Jig's own page, arguments must be plain data, and the methods that touch
 * paths, programs, URLs or settings have exact shapes. Handlers still check what they own (grants,
 * protected settings, add-on permissions).
 */

/** Only Jig's own UI: the bundled page, or the dev server in development. Never a frame inside it. */
export function isAllowedOrigin(url: string | undefined, devUrl = process.env.JIG_RENDERER_URL): boolean {
  if (!url) return false;
  if (url.startsWith("jig-app://")) return true;
  return Boolean(devUrl) && url.startsWith(new URL(devUrl!).origin);
}

const MAX_TEXT = 1_000_000;
const path = z.string().min(1).max(4096);
const id = z.string().min(1).max(200);
const text = z.string().max(MAX_TEXT);
const addonId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]*$/)
  .max(100);
const int = z.number().int();

const attachment = z.object({
  path,
  mime: z.string().max(200),
  name: z.string().max(500).optional(),
  kind: z.enum(["image", "pdf", "office", "text"]).optional(),
});

export const SCHEMAS: Partial<Record<MethodName, z.ZodType>> = {
  "files.image": z.object({ path }),
  "files.preview": z.object({ path }),
  "files.stat": z.object({ path }),
  "app.openExternal": z.object({ url: z.string().max(8192) }),
  "app.openPath": z.object({ path }),
  "app.showItemInFolder": z.object({ path }),
  "app.pickFiles": z.object({ title: z.string().max(200).optional(), defaultPath: path.optional() }),
  "tour.create": z.object({ cwd: path, focus: z.string().max(2000).optional() }),
  "ai.ask": z.object({ addonId, prompt: z.string().max(200_000), cwd: path.optional() }),
  "attempts.start": z.object({
    projectId: id,
    repo: path,
    task: z.string().max(50_000),
    hints: z.array(z.string().max(1000)).min(2).max(4),
  }),
  "attempts.diff": z.object({ id, index: int.min(1).max(4), path: z.string().max(4096).optional() }),
  "attempts.keep": z.object({ id, index: int.min(1).max(4) }),
  "projects.add": z.object({ path: path.optional() }),
  "sessions.create": z.object({ projectId: id, title: z.string().max(500).optional(), cwd: path.optional() }),
  "sessions.send": z.object({ id, text, attachments: z.array(attachment).max(50).optional() }),
  "sessions.rewindFiles": z.object({ id, itemId: id, dryRun: z.boolean() }),
  "browser.navigate": z.object({
    url: z.string().max(8192).optional(),
    action: z.enum(["back", "forward", "reload"]).optional(),
  }),
  "browser.input": z.discriminatedUnion("type", [
    z.object({
      type: z.enum(["mouseDown", "mouseUp", "mouseMove"]),
      x: z.number().finite(),
      y: z.number().finite(),
      button: z.enum(["left", "right"]).optional(),
      clickCount: int.min(1).max(3).optional(),
    }),
    z.object({
      type: z.literal("wheel"),
      x: z.number().finite(),
      y: z.number().finite(),
      deltaX: z.number().finite(),
      deltaY: z.number().finite(),
    }),
    z.object({ type: z.enum(["keyDown", "keyUp"]), key: z.string().min(1).max(40) }),
    z.object({ type: z.literal("text"), text: z.string().max(10_000) }),
  ]),
  "browser.resize": z.object({ width: int.min(200).max(4000), height: int.min(200).max(4000) }),
  "terminals.create": z.object({
    projectId: id.optional(),
    cwd: path.optional(),
    command: z.string().max(10_000).optional(),
    title: z.string().max(500).optional(),
    cols: int.min(1).max(1000).optional(),
    rows: int.min(1).max(1000).optional(),
  }),
  "terminals.write": z.object({ id, data: text }),
  "terminals.resize": z.object({ id, cols: int.min(1).max(1000), rows: int.min(1).max(1000) }),
  "addons.call": z.object({
    id: addonId,
    method: z
      .string()
      .regex(/^[A-Za-z_$][\w$]*$/)
      .max(100),
  }),
  "addons.storageGet": z.object({ id: addonId, key: z.string().max(200) }),
  "addons.storageSet": z.object({ id: addonId, key: z.string().max(200) }),
  "addons.setEnabled": z.object({ id: addonId, enabled: z.boolean() }),
  "addons.rollback": z.object({ id: addonId, commit: z.string().regex(/^[0-9a-f]{7,40}$/) }),
  "scripts.run": z.object({ projectId: id, scriptId: z.string().max(2000) }),
  "scripts.restart": z.object({ projectId: id, scriptId: z.string().max(2000) }),
};

const isPlain = (v: unknown) =>
  v === undefined ||
  v === null ||
  (typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype);

/** The reason a call's arguments are refused, or undefined when they're fine. */
export function invalidArgs(method: MethodName, args: unknown): string | undefined {
  // Layouts and config patches are objects too; arrays, strings and numbers never are arguments.
  if (!isPlain(args)) return "arguments must be an object";
  const schema = SCHEMAS[method];
  if (!schema) return undefined;
  const result = schema.safeParse(args ?? {});
  if (result.success) return undefined;
  const issue = result.error.issues[0]!;
  return `${issue.path.join(".") || "arguments"}: ${issue.message}`;
}

/** Files `app.openPath` won't open: on Windows opening them runs them. */
export const EXECUTABLE =
  /\.(exe|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|scr|pif|lnk|hta|cpl|reg|jar|sh|command|app)$/i;
