import { z } from "zod";
import { EFFORT_LEVELS, PERMISSION_MODES } from "../../shared/engine";
import type { MethodName } from "../../shared/ipc";
import { LinkGroupSchema } from "../../shared/links";
import { PROJECT_COLORS } from "../../shared/projects";

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

/** What a project's settings may hold (the store trims and checks the rest). */
const projectPatch = z.object({
  name: z.string().max(200).optional(),
  color: z.enum(PROJECT_COLORS).optional(),
  path: path.optional(),
  model: z.string().max(200).optional(),
  effort: z.union([z.enum(EFFORT_LEVELS), z.literal("")]).optional(),
  permissionMode: z.union([z.enum(PERMISSION_MODES), z.literal("")]).optional(),
  instructions: z.string().max(20_000).optional(),
  starters: z.array(z.string().max(500)).max(12).optional(),
  links: z.array(LinkGroupSchema).max(50).optional(),
});

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
  "files.write": z.object({ path, text: z.string().max(10_000_000), expectedMtimeMs: z.number().optional() }),
  "app.openExternal": z.object({ url: z.string().max(8192) }),
  "app.openPath": z.object({ path }),
  "app.showItemInFolder": z.object({ path }),
  "app.pickFiles": z.object({ title: z.string().max(200).optional(), defaultPath: path.optional() }),
  "tour.create": z.object({ cwd: path, focus: z.string().max(2000).optional() }),
  "learning.setProfile": z.object({ text: z.string().max(200_000) }),
  "learning.checkIn": z.object({ action: z.enum(["enable", "decline", "start", "skip"]) }),
  "addons.inspectPackage": z.object({ path: path.optional() }),
  "addons.importPackage": z.object({ path, replace: z.boolean().optional() }),
  "worktrees.start": z.object({ repo: path, name: z.string().max(200), projectId: id.optional() }),
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
  "projects.setFocusRepo": z.object({ id, repo: path.optional() }),
  "sessions.addAttachment": z.object({
    id,
    // Base64 of a pasted file (about 30 MB).
    data: z.string().max(42_000_000).optional(),
    mime: z.string().max(200).optional(),
    name: z.string().max(500).optional(),
    path: path.optional(),
  }),
  "builds.start": z.object({
    goal: z.string().min(1).max(50_000),
    origin: z.enum(["tools", "addon", "chat", "suggestion", "settings"]),
    targetAddonId: addonId.optional(),
    originSessionId: id.optional(),
  }),
  "builds.diff": z.object({ id, path }),
  "devRequests.create": z.object({ buildId: id }),
  "devRequests.email": z.object({ buildId: id }),
  "devRequests.prompt": z.object({ buildId: id }),
  "devRequests.status": z.object({ buildId: id }),
  "devRequests.approve": z.object({ buildId: id }),
  "builds.reviseRequest": z.object({ id, feedback: z.string().min(1).max(20_000) }),
  "learning.record": z.object({
    kind: z.literal("addon.action"),
    text: z.string().max(2000),
    projectId: id.optional(),
    detail: z.record(z.string(), z.string().max(2000)).optional(),
  }),
  "projects.create": z.object({ name: z.string().min(1).max(200), path }).extend(projectPatch.shape),
  "projects.update": z.object({ id }).extend(projectPatch.shape),
  "workspaces.add": z.object({ path: path.optional() }),
  "sessions.create": z.object({
    projectId: id.optional(),
    title: z.string().max(500).optional(),
    cwd: path.optional(),
  }),
  "sessions.setProject": z.object({ id, projectId: id.optional() }),
  "links.azure": z.object({
    group: z
      .string()
      .regex(/^[\w.()-]+$/)
      .max(90)
      .optional(),
  }),
  "sessions.send": z.object({
    id,
    text,
    attachments: z.array(attachment).max(50).optional(),
    now: z.boolean().optional(),
  }),
  "sessions.rewind": z.object({ id, itemId: id, files: z.boolean() }),
  "sessions.runShell": z.object({ id, command: z.string().min(1).max(10_000) }),
  "sessions.remember": z.object({
    id,
    text: z.string().min(1).max(5000),
    scope: z.enum(["project", "user"]),
  }),
  "sessions.setEffort": z.object({
    id,
    effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  }),
  "sessions.setDirs": z.object({ id, dirs: z.array(path).max(20) }),
  "sessions.mcpToggle": z.object({ id, name: z.string().min(1).max(200), enabled: z.boolean() }),
  "sessions.mcpReconnect": z.object({ id, name: z.string().min(1).max(200) }),
  "files.search": z.object({ root: path, query: z.string().max(500), limit: int.min(1).max(200).optional() }),
  "sessions.rewindFiles": z.object({ id, itemId: id, dryRun: z.boolean() }),
  "artifacts.fetch": z.object({ url: z.string().max(500) }),
  "routines.run": z.object({ id }),
  "routines.setEnabled": z.object({ id, enabled: z.boolean() }),
  "routines.runs": z.object({ id }),
  "routines.runLog": z.object({ sessionId: id }),
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
  "addons.remove": z.object({ id: addonId }),
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
