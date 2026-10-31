import type { AddonChatInfo, AddonChatSend } from "@jig/sdk";
import type { PermissionMode, SessionMeta, SessionSnapshot } from "../../shared/engine";
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
  send(sessionId: string, text: string): Promise<void>;
  snapshot(sessionId: string): Promise<SessionSnapshot>;
  notify(addonId: string, change: { sessionId: string; status: SessionMeta["status"] }): Promise<unknown>;
}

const MODES = new Set(["default", "acceptEdits", "plan"]);

export function chatInfo({ meta, items, queue }: SessionSnapshot): AddonChatInfo {
  const answer = [...items].reverse().find((i) => i.kind === "assistant" && !i.parentId);
  return {
    id: meta.id,
    title: meta.title,
    status: meta.status,
    projectId: meta.projectId,
    cwd: meta.cwd,
    costUsd: meta.costUsd,
    queued: queue?.length ?? 0,
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
      if (!text) throw new JigError("invalid_args", "Nothing to send");
      let sessionId = input.sessionId;
      if (sessionId) {
        await deps.snapshot(sessionId);
        watch(addonId, sessionId);
      } else sessionId = await create(addonId, input);
      const sentAt = new Date().toISOString();
      await deps.send(sessionId, text);
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
