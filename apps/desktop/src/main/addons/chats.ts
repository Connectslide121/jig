import type { AddonChatInfo, AddonChatSend } from "@jig/sdk";
import type { ChatAttachment, PermissionMode, SessionMeta, SessionSnapshot } from "../../shared/engine";
import { JigError } from "../../shared/ipc";

/**
 * Chats an add-on runs through its host API (`api.chats`, the `chat` permission). Main remembers which
 * add-on sent to or asked about which chat, and tells that add-on's host when the chat's status
 * changes (`chatChanged`). The remembering is in memory: after a restart an add-on asks again (`get`).
 */
export interface ChatsDeps {
  hasPermission(addonId: string): boolean;
  create(input: {
    projectId?: string;
    cwd?: string;
    title?: string;
    permissionMode?: PermissionMode;
  }): Promise<SessionMeta>;
  send(sessionId: string, text: string, attachments: ChatAttachment[]): Promise<void>;
  /** A message from the add-on, not you: the transcript shows `from` with the add-on's icon. */
  sendFrom(sessionId: string, text: string, from: string, icon?: string): Promise<void>;
  /** The add-on's icon (its manifest's), for the messages it sends with `from`. */
  icon(addonId: string): string | undefined;
  /** Copies files the add-on kept (`addons.addAttachment`) into the chat's attachments. */
  copyAttachments(addonId: string, sessionId: string, list: ChatAttachment[]): Promise<ChatAttachment[]>;
  snapshot(sessionId: string): Promise<SessionSnapshot>;
  notify(addonId: string, change: { sessionId: string; status: SessionMeta["status"] }): Promise<unknown>;
}

const MODES = new Set(["default", "acceptEdits", "plan"]);

/** When you last stopped a turn of the chat (Stop) or rejected a tool call in it. */
function userStoppedAt(items: SessionSnapshot["items"]): string | undefined {
  let last: string | undefined;
  for (const item of items) {
    const stopped =
      (item.kind === "result" && item.stopped) || (item.kind === "permission" && item.status === "denied");
    if (stopped && (!last || item.at > last)) last = item.at;
  }
  return last;
}

export function chatInfo({ meta, items, queue }: SessionSnapshot): AddonChatInfo {
  const answer = [...items].reverse().find((i) => i.kind === "assistant" && !i.parentId);
  const stoppedAt = userStoppedAt(items);
  return {
    id: meta.id,
    title: meta.title,
    status: meta.status,
    projectId: meta.projectId,
    cwd: meta.cwd,
    costUsd: meta.costUsd,
    queued: queue?.length ?? 0,
    background: meta.backgroundTasks?.length ?? 0,
    ...(stoppedAt ? { userStoppedAt: stoppedAt } : {}),
    ...(answer?.kind === "assistant" ? { lastAnswer: answer.text, lastAnswerAt: answer.at } : {}),
    ...(meta.lastError ? { error: meta.lastError } : {}),
  };
}

export function addonChats(deps: ChatsDeps) {
  const owners = new Map<string, Set<string>>();
  const watch = (addonId: string, sessionId: string) => {
    const set = owners.get(sessionId) ?? new Set<string>();
    set.add(addonId);
    owners.set(sessionId, set);
  };
  const check = (addonId: string) => {
    if (!deps.hasPermission(addonId))
      throw new JigError("permission", `This add-on needs the "chat" permission in addon.json`);
  };

  const create = async (addonId: string, input: Omit<AddonChatSend, "text" | "sessionId">) => {
    if (input?.permissionMode && !MODES.has(input.permissionMode))
      throw new JigError("invalid_args", `Unknown permission mode ${input.permissionMode}`);
    const meta = await deps.create({
      projectId: input?.projectId,
      cwd: input?.cwd,
      title: input?.title,
      permissionMode: input?.permissionMode,
    });
    watch(addonId, meta.id);
    return meta.id;
  };

  return {
    async create(addonId: string, input: Omit<AddonChatSend, "text" | "sessionId">) {
      check(addonId);
      return { sessionId: await create(addonId, input) };
    },
    async send(addonId: string, input: AddonChatSend): Promise<{ sessionId: string; sentAt: string }> {
      check(addonId);
      const text = String(input?.text ?? "").trim();
      const files = Array.isArray(input?.attachments) ? input.attachments : [];
      if (!text && !files.length) throw new JigError("invalid_args", "Nothing to send");
      if (input?.from !== undefined) {
        // A message from the add-on, not you: only to a chat that exists, text only, one short line shown.
        const from = String(input.from).replace(/\s+/g, " ").trim().slice(0, 120);
        if (!from || !input.sessionId || files.length)
          throw new JigError("invalid_args", "A message with from needs its text, a sessionId and no files");
        await deps.snapshot(input.sessionId);
        watch(addonId, input.sessionId);
        const sentAt = new Date().toISOString();
        await deps.sendFrom(input.sessionId, text, from, deps.icon(addonId));
        return { sessionId: input.sessionId, sentAt };
      }
      let sessionId = input.sessionId;
      if (sessionId) {
        await deps.snapshot(sessionId);
        watch(addonId, sessionId);
      } else sessionId = await create(addonId, input);
      const attachments = files.length ? await deps.copyAttachments(addonId, sessionId, files) : [];
      const sentAt = new Date().toISOString();
      await deps.send(sessionId, text, attachments);
      return { sessionId, sentAt };
    },
    async get(addonId: string, sessionId: string): Promise<AddonChatInfo> {
      check(addonId);
      const info = chatInfo(await deps.snapshot(String(sessionId)));
      watch(addonId, info.id);
      return info;
    },
    /** A chat's status changed: the add-ons following it hear about it. */
    statusChanged(meta: SessionMeta) {
      for (const addonId of owners.get(meta.id) ?? [])
        void deps.notify(addonId, { sessionId: meta.id, status: meta.status }).catch(() => undefined);
    },
  };
}
