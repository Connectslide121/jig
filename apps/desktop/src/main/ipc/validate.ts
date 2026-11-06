import { isTenantInput } from "@jig/azure";
import { z } from "zod";
import { ADDON_AI_FEATURES } from "../../shared/aiFeatures";
import { ANY_EFFORT_LEVELS, CHAT_PROVIDERS, LIMIT_POLICIES, PERMISSION_MODES } from "../../shared/engine";
import type { MethodName } from "../../shared/ipc";
import { LinkGroupSchema } from "../../shared/links";
import { CHAT_MESSAGE_ID, HOSTED_CONTENT_ID, TEAMS_CHAT_ID } from "../../shared/meetingChat";
import { CHAT_SEARCH_MIN, CHAT_TOPIC_MAX, NEW_CHAT_MAX_PEOPLE } from "../../shared/meetingChatList";
import { MEETING_SIZES, MEETING_SLOTS } from "../../shared/meetingLayout";
import { PRESENCE_BATCH } from "../../shared/meetingPresence";
import { TEAMS_CREDENTIAL, TELEGRAM_TOKEN } from "../../shared/phone";
import { PROJECT_COLORS } from "../../shared/projects";
import { AI_PROVIDERS } from "../../shared/providers";
import { NATURAL_VOICE_IDS, SPEECH_MODEL_IDS } from "../../shared/speech";

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

const rememberedDevice = z.object({ id: z.string().min(1).max(500), name: z.string().max(500) }).strict();
const meetingPanel = z.object({ slot: z.enum(MEETING_SLOTS), hidden: z.boolean().optional() }).strict();
const MAX_TEXT = 1_000_000;
const path = z.string().min(1).max(4096);
const id = z.string().min(1).max(200);
/** A Teams chat id (D-296): it goes into a Graph URL path, so only the two shapes Teams uses. */
const teamsChatId = z.string().max(300).regex(TEAMS_CHAT_ID);
const text = z.string().max(MAX_TEXT);
const addonId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]*$/)
  .max(100);
const int = z.number().int();
/** An Azure tenant's key (`default` = your own az login) and what may be passed to `az login --tenant`. */
const tenantKey = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const tenantInput = z.string().max(253).refine(isTenantInput, "a tenant id (GUID) or a domain");
const signInMethod = z.enum(["browser", "code"]);
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const meetingAction = z.object({
  id,
  title: z.string().min(1).max(500),
  prompt: z.string().min(1).max(50_000),
  owner: z.string().max(200),
  mine: z.boolean().optional(),
  projectId: id.optional(),
  evidence: z.string().max(4000),
  // Shown back as the dialog has them; main keeps its own status for every saved action (D-407).
  status: z.enum(["queued", "running", "done", "dismissed"]).optional(),
  sessionId: id.optional(),
});

/** What a project's settings may hold (the store trims and checks the rest). */
const projectPatch = z.object({
  name: z.string().max(200).optional(),
  color: z.enum(PROJECT_COLORS).optional(),
  path: path.optional(),
  provider: z.union([z.enum(CHAT_PROVIDERS), z.literal("")]).optional(),
  onLimit: z.union([z.enum(LIMIT_POLICIES), z.literal("")]).optional(),
  model: z.string().max(200).optional(),
  effort: z.union([z.enum(ANY_EFFORT_LEVELS), z.literal("")]).optional(),
  permissionMode: z.union([z.enum(PERMISSION_MODES), z.literal("")]).optional(),
  instructions: z.string().max(20_000).optional(),
  starters: z.array(z.string().max(500)).max(12).optional(),
  links: z.array(LinkGroupSchema).max(50).optional(),
  azureTenant: z.union([tenantKey, z.literal("")]).optional(),
});

const attachment = z.object({
  path,
  mime: z.string().max(200),
  name: z.string().max(500).optional(),
  kind: z.enum(["image", "pdf", "office", "text"]).optional(),
});

export const SCHEMAS: Partial<Record<MethodName, z.ZodType>> = {
  "meetings.lobbyView": z.object({ view: z.enum(["agenda", "week"]) }).strict(),
  "meetings.captionLanguage": z
    .object({ language: z.string().regex(/^([a-z]{2,3}(-[a-z0-9]{2,8})*)?$/i) })
    .strict(),
  "meetings.devices": z
    .object({ microphone: rememberedDevice, speaker: rememberedDevice, camera: rememberedDevice })
    .partial()
    .strict(),
  "meetings.aiTranslation": z
    .object({ id: z.uuid(), language: z.string().regex(/^([a-z]{2,3}(-[a-z0-9]{2,8})*)?$/i) })
    .strict(),
  "meetings.configure": z
    .object({ tenantId: z.uuid(), clientId: z.uuid(), endpoint: z.url().max(1000) })
    .strict(),
  "meetings.layout": z
    .object({
      panels: z
        .object({ people: meetingPanel, transcript: meetingPanel, notes: meetingPanel, chat: meetingPanel })
        .strict(),
      sizes: z.partialRecord(z.enum(MEETING_SIZES), z.number().min(0).max(10_000)),
      historyTranscript: z.literal(true).optional(),
    })
    .strict(),
  "meetings.revealChat": z.object({ sessionId: id }).strict(),
  "meetings.showBoards": z.object({ projectId: id }).strict(),
  "meetings.open": z
    .object({
      tab: z.enum(["calendar", "chats", "meetings"]).optional(),
      select: z.string().max(100).optional(),
    })
    .strict()
    .optional(),
  "meetings.startChat": z.object({ projectId: id, draft: z.string().max(500) }).strict(),
  "meetings.join": z.object({ url: z.string().max(8192), title: z.string().min(1).max(500) }).strict(),
  "meetings.people": z.object({ query: z.string().max(200) }).strict(),
  "meetings.photo": z.object({ id: z.string().max(300) }).strict(),
  "people.photo": z.object({ email: z.string().max(320) }).strict(),
  "meetings.chat": z.object({ id }).strict(),
  "meetings.chatSend": z.object({ id, text: z.string().trim().min(1).max(4000) }).strict(),
  "meetings.chatThread": z.object({ chatId: teamsChatId }).strict(),
  "meetings.chatThreadSend": z
    .object({ chatId: teamsChatId, text: z.string().trim().min(1).max(4000) })
    .strict(),
  "meetings.chatWith": z.object({ peerId: z.uuid() }).strict(),
  "meetings.chatPin": z.object({ chatId: teamsChatId, pinned: z.boolean() }).strict(),
  "meetings.chatSearch": z.object({ query: z.string().trim().min(CHAT_SEARCH_MIN).max(200) }).strict(),
  "meetings.chatCreate": z
    .object({
      people: z
        .array(z.object({ id: z.uuid(), name: z.string().trim().min(1).max(300) }).strict())
        .min(1)
        .max(NEW_CHAT_MAX_PEOPLE),
      topic: z.string().max(CHAT_TOPIC_MAX).optional(),
      text: z.string().trim().min(1).max(4000),
    })
    .strict(),
  "meetings.chatImage": z
    .object({
      chatId: teamsChatId,
      messageId: z.string().regex(CHAT_MESSAGE_ID),
      contentId: z.string().regex(HOSTED_CONTENT_ID),
    })
    .strict(),
  "meetings.presence": z
    .object({ ids: z.array(z.string().regex(/^[0-9a-f-]{36}$/i)).max(PRESENCE_BATCH) })
    .strict(),
  "meetings.openChatFile": z.object({ url: z.url({ protocol: /^https$/ }).max(8192) }).strict(),
  "completion.request": z
    .object({
      path,
      text: z.string().max(5_000_000),
      offset: z.number().int().min(0),
      tabSize: z.number().int().min(1).max(16),
      insertSpaces: z.boolean(),
    })
    .strict(),
  "completion.accepted": z.object({ id: z.string().max(10_000) }).strict(),
  "knowledge.list": z.object({ projectId: id }).strict(),
  "lsp.open": z.object({ path }).strict(),
  "lsp.send": z.object({ id, message: z.string().max(20_000_000) }).strict(),
  "lsp.release": z.object({ id }).strict(),
  "lsp.restart": z.object({ id }).strict(),
  "knowledge.read": z.object({ projectId: id, id }).strict(),
  "knowledge.remove": z.object({ projectId: id, id }).strict(),
  "notes.list": z.object({ projectId: id }).strict(),
  "notes.add": z
    .object({
      projectId: id,
      kind: z.enum(["wait", "note", "link"]),
      text: z.string().max(5_000),
      url: z.string().max(2_000).optional(),
    })
    .strict(),
  "notes.update": z
    .object({
      projectId: id,
      id,
      text: z.string().max(5_000).optional(),
      url: z.string().max(2_000).optional(),
      done: z.boolean().optional(),
    })
    .strict(),
  "notes.remove": z.object({ projectId: id, id }).strict(),
  "knowledge.addFiles": z.object({ projectId: id, paths: z.array(path).max(100).optional() }).strict(),
  "claudeImport.open": z.object({ path: path.optional() }).strict(),
  "claudeImport.apply": z.object({ token: id, uuids: z.array(id).max(500), path }).strict(),
  "completion.closeFile": z.object({ path }).strict(),
  "meetings.startCall": z
    .object({
      // Empty when the caller isn't a Teams user Jig can call back.
      peerId: z.uuid().or(z.literal("")),
      peerName: z.string().min(1).max(500),
      direction: z.enum(["outgoing", "incoming"]),
    })
    .strict(),
  "meetings.start": z.discriminatedUnion("kind", [
    z
      .object({ kind: z.literal("join"), url: z.string().max(8192), title: z.string().min(1).max(500) })
      .strict(),
    z
      .object({
        kind: z.literal("call"),
        peerId: z.uuid(),
        peerName: z.string().min(1).max(500),
        camera: z.boolean(),
      })
      .strict(),
    z.object({ kind: z.literal("show") }).strict(),
  ]),
  "meetings.setRinging": z.object({ on: z.boolean() }).strict(),
  "meetings.incoming": z.object({ name: z.string().max(500).optional() }).strict(),
  "meetings.credential": z.object({ id: id.optional() }).strict(),
  "meetings.caption": z
    .object({
      id,
      caption: z
        .object({
          id,
          speakerId: z.string().max(500),
          speaker: z.string().max(200),
          timestamp: z.iso.datetime(),
          text: z.string().min(1).max(20_000),
          final: z.boolean(),
          translated: z.string().max(20_000).optional(),
          translatedLanguage: z.string().max(40).optional(),
          // Only Teams' translations come from the meeting window; Claude's are made in main.
          translatedBy: z.literal("teams").optional(),
          // Transcribed in the meeting window by Whisper while Teams captions don't run (D-321).
          source: z.literal("local").optional(),
        })
        .strict(),
    })
    .strict(),
  "meetings.status": z
    .object({
      id,
      status: z.enum(["joining", "connected", "ended", "interrupted"]),
      capture: z.string().max(500),
      gap: z.string().max(500).optional(),
      detail: z.string().max(500).optional(),
    })
    .strict(),
  "meetings.ask": z
    .object({
      id,
      question: z.string().min(1).max(50_000),
      projectId: id.optional(),
      sessionId: id.optional(),
    })
    .strict(),
  "meetings.notes": z.object({ id }).strict(),
  "meetings.cancelNotes": z.object({ id }).strict(),
  "meetings.delete": z.object({ id }).strict(),
  "meetings.mentions": z.object({ query: z.string().max(500) }).strict(),
  "meetings.chatMentions": z.object({ query: z.string().max(500) }).strict(),
  "meetings.rename": z.object({ id, title: z.string().min(1).max(500) }).strict(),
  "meetings.saveFolder": z.object({ id: z.uuid().optional(), name: z.string().min(1).max(120) }).strict(),
  "meetings.deleteFolder": z.object({ id: z.uuid() }).strict(),
  "meetings.moveToFolder": z
    .object({
      ids: z.array(z.uuid()).min(1).max(500),
      place: z.union([z.uuid(), z.literal("none"), z.literal("auto")]),
    })
    .strict(),
  "meetings.markdown": z.object({ id }).strict(),
  "meetings.export": z.object({ id }).strict(),
  "meetings.actions": z.object({ id, actions: z.array(meetingAction).max(200) }).strict(),
  "meetings.queue": z.object({ id, actionIds: z.array(id).min(1).max(200) }).strict(),
  "meetings.runAction": z.object({ id, actionId: id }).strict(),
  "meetings.setActionStatus": z
    .object({ id, actionId: id, status: z.enum(["done", "dismissed", "open"]) })
    .strict(),
  "meetings.cardForm": z.object({ id, actionId: id, projectId: id, boardId: id.optional() }).strict(),
  "meetings.createCard": z
    .object({
      id,
      actionId: id,
      projectId: id,
      boardId: id,
      type: z.string().min(1).max(200),
      title: z.string().trim().min(1).max(500),
      description: z.string().max(50_000),
      assignedTo: z.string().max(300).optional(),
    })
    .strict(),
  "meetings.selectShare": z.object({ sourceId: id }).strict(),
  "skills.details": z.object({ id }),
  "files.image": z.object({ path }),
  "files.preview": z.object({ path }),
  "files.stat": z.object({ path }),
  "files.locate": z.object({ cwd: path, path }).strict(),
  "files.write": z.object({ path, text: z.string().max(10_000_000), expectedMtimeMs: z.number().optional() }),
  "app.openExternal": z.object({ url: z.string().max(8192) }),
  "speech.removeModel": z.object({ model: z.enum(SPEECH_MODEL_IDS) }),
  "speech.prepareVoice": z.object({ voice: z.enum(NATURAL_VOICE_IDS) }).strict(),
  "speech.say": z
    .object({
      text: z.string().max(20_000),
      voice: z.enum(NATURAL_VOICE_IDS),
      speed: z.number().min(0.5).max(2),
    })
    .strict(),
  "speech.sayParts": z
    .object({
      id: z.number().int().nonnegative(),
      text: z.string().max(20_000),
      voice: z.enum(NATURAL_VOICE_IDS),
      speed: z.number().min(0.5).max(2),
    })
    .strict(),
  "app.openPath": z.object({ path }),
  "app.showItemInFolder": z.object({ path }),
  "app.pickFiles": z.object({ title: z.string().max(200).optional(), defaultPath: path.optional() }),
  "tour.create": z.object({ cwd: path, focus: z.string().max(2000).optional() }),
  "learning.setProfile": z.object({ text: z.string().max(200_000) }),
  "learning.checkIn": z.object({ action: z.enum(["enable", "decline", "start", "skip"]) }),
  "addons.inspectPackage": z.object({ path: path.optional() }),
  "addons.importPackage": z.object({ path, replace: z.boolean().optional() }),
  "addons.galleryInstall": z.object({
    source: z.string().min(1).max(2000),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    replace: z.boolean().optional(),
  }),
  "worktrees.start": z.object({ repo: path, name: z.string().max(200), projectId: id.optional() }),
  "ai.models": z.object({ provider: z.enum(AI_PROVIDERS) }),
  "ai.ask": z.object({
    addonId,
    prompt: z.string().max(200_000),
    cwd: path.optional(),
    quick: z.boolean().optional(),
    feature: z.enum(ADDON_AI_FEATURES).optional(),
  }),
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
  "addons.addAttachment": z.object({
    id: addonId,
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
    kind: z.enum(["addon.action", "ui"]),
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
    provider: z.enum(CHAT_PROVIDERS).optional(),
  }),
  "sessions.setProject": z.object({ id, projectId: id.optional() }),
  "sessions.switchProject": z.object({ id, projectId: id }),
  "sessions.setProvider": z.object({ id, provider: z.enum(CHAT_PROVIDERS) }),
  "sessions.handOverPlan": z.object({ id, provider: z.enum(CHAT_PROVIDERS) }),
  "sessions.handOver": z.object({ id, provider: z.enum(CHAT_PROVIDERS) }),
  "sessions.limitAction": z.object({
    id,
    itemId: z.string().min(1).max(200),
    action: z.enum(["continue", "wait", "cancel", "dismiss"]),
  }),
  "sessions.openSaved": z.object({ sessionId: z.string().regex(/^[\w-]{1,100}$/) }),
  "links.azure": z.object({
    subscription: z
      .string()
      .regex(/^[0-9a-fA-F-]{36}$/)
      .optional(),
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
  "sessions.editQueued": z
    .object({ id, queuedId: id, text, attachments: z.array(attachment).max(50).optional() })
    .strict()
    .refine((a) => a.text.trim() !== "" || (a.attachments?.length ?? 0) > 0, "The message is empty"),
  "sessions.park": z
    .object({
      id,
      text: text.optional(),
      attachments: z.array(attachment).max(50).optional(),
      queuedId: id.optional(),
    })
    .strict()
    .refine(
      (a) => a.queuedId !== undefined || (a.text ?? "").trim() !== "" || (a.attachments?.length ?? 0) > 0,
      "The message is empty",
    ),
  "sessions.sendParked": z.object({ id, parkedId: id, now: z.boolean().optional() }).strict(),
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
  "routines.run": z.object({ id }),
  "routines.setEnabled": z.object({ id, enabled: z.boolean() }),
  "routines.runs": z.object({ id }),
  "routines.runLog": z.object({ sessionId: id }),
  "userBrowser.present": z
    .object({
      bounds: z
        .object({
          x: int.min(0).max(32000),
          y: int.min(0).max(32000),
          width: int.min(0).max(32000),
          height: int.min(0).max(32000),
        })
        .strict(),
      visible: z.boolean(),
    })
    .strict(),
  "userBrowser.navigate": z
    .object({
      url: z.string().min(1).max(8192).optional(),
      action: z.enum(["back", "forward", "reload", "stop"]).optional(),
    })
    .strict(),
  "browser.navigate": z.object({
    chatId: id,
    url: z.string().max(8192).optional(),
    action: z.enum(["back", "forward", "reload"]).optional(),
  }),
  "browser.input": z.object({
    chatId: id,
    input: z.discriminatedUnion("type", [
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
  }),
  "browser.resize": z.object({
    chatId: id,
    width: int.min(200).max(4000),
    height: int.min(200).max(4000),
  }),
  "terminals.create": z.object({
    projectId: id.optional(),
    cwd: path.optional(),
    command: z.string().max(10_000).optional(),
    shell: path.optional(),
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
  "addons.saveCopy": z.object({
    id: addonId,
    from: path,
    name: z.string().min(1).max(200).optional(),
    title: z.string().max(200).optional(),
  }),
  "addons.storageGet": z.object({ id: addonId, key: z.string().max(200) }),
  "addons.storageSet": z.object({ id: addonId, key: z.string().max(200) }),
  "addons.setEnabled": z.object({ id: addonId, enabled: z.boolean() }),
  "addons.rollback": z.object({ id: addonId, commit: z.string().regex(/^[0-9a-f]{7,40}$/) }),
  "addons.remove": z.object({ id: addonId }),
  "addons.restoreOriginal": z.object({ id: addonId }),
  "addons.export": z.object({
    id: addonId,
    copy: z.object({ name: z.string().trim().min(1).max(100) }).optional(),
    gallerySource: z.string().min(1).max(2000).optional(),
  }),
  "azure.tenants": z.object({ check: z.boolean().optional() }).strict(),
  // A Telegram bot's token, or the Teams relay's address and key (D-379).
  "phone.connect": z
    .object({
      token: z
        .string()
        .trim()
        .max(600)
        .refine((t) => TELEGRAM_TOKEN.test(t) || TEAMS_CREDENTIAL.test(t)),
    })
    .strict(),
  // Teams setup (D-370): where the Azure pieces go, and a relay made by hand in the portal.
  "phone.teamsSetupWhere": z
    .object({
      subscription: z.string().regex(GUID).optional(),
      region: z
        .string()
        .regex(/^[a-z0-9]{2,40}$/)
        .optional(),
      group: z.string().max(90).optional(),
    })
    .strict(),
  "phone.teamsSetupManual": z
    .object({
      appId: z.string().trim().regex(GUID),
      credential: z
        .string()
        .trim()
        .max(600)
        .refine((t) => TEAMS_CREDENTIAL.test(t)),
    })
    .strict(),
  "phone.open": z.object({ sessionId: z.string().min(1).max(100) }).strict(),
  "phone.voiceDone": z
    .object({
      id: z.string().min(1).max(100),
      text: z.string().max(20_000).optional(),
      data: z.string().max(30_000_000).optional(),
      error: z.string().max(2000).optional(),
    })
    .strict(),
  "azure.addTenant": z
    .object({ tenant: tenantInput, label: z.string().max(80).optional(), method: signInMethod.optional() })
    .strict(),
  "azure.signInAgain": z.object({ key: tenantKey, method: signInMethod.optional() }).strict(),
  "azure.renameTenant": z
    .object({ key: tenantKey, label: z.string().trim().min(1).max(80).optional() })
    .strict(),
  "azure.removeTenant": z.object({ key: tenantKey }).strict(),
  "azure.setActiveTenant": z.object({ key: tenantKey }).strict(),
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
