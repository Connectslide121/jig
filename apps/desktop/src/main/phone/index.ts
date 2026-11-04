import { randomInt } from "node:crypto";
import { rm } from "node:fs/promises";
import { powerMonitor, powerSaveBlocker, safeStorage } from "electron";
import { z } from "zod";
import { getConfig, onConfigChange, updateConfig } from "../config";
import { registerJigTools } from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { logger } from "../log";
import { projectStore } from "../projects";
import { onPermissionCard, onSessionStatus, sessionManager } from "../sessions";
import { readJson, writeJson } from "../state/jsonStore";
import { paths } from "../state/paths";
import { PhoneService, type SavedPhone } from "./service";
import { telegramApi } from "./telegram";

const log = logger("phone");

const SavedFile = z.object({
  /** The bot's token, encrypted with the OS (safeStorage), base64. */
  token: z.string().optional(),
  bot: z.string().default(""),
  owner: z.object({ chatId: z.number(), name: z.string() }).optional(),
  replies: z.array(z.tuple([z.number(), z.string()])).optional(),
  targets: z.array(z.tuple([z.number(), z.string()])).optional(),
  topics: z
    .object({ jig: z.number().optional(), projects: z.record(z.string(), z.number()).optional() })
    .optional(),
});

/** Like Microsoft's sign-in (D-232): only with the OS's own encryption, never as plain text. */
function canEncrypt(): boolean {
  return (
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text")
  );
}

/** `phone.json`: the token encrypted; without the OS's encryption nothing is written (kept until Jig closes). */
function phoneStore() {
  const remembered = canEncrypt();
  return {
    remembered,
    async load(): Promise<SavedPhone | undefined> {
      if (!remembered) return undefined;
      const saved = await readJson(paths.phone(), SavedFile);
      if (!saved.token) return undefined;
      try {
        const token = safeStorage.decryptString(Buffer.from(saved.token, "base64"));
        const { token: _, ...rest } = saved;
        return { ...rest, token };
      } catch {
        return undefined;
      }
    },
    async save(saved: SavedPhone | undefined): Promise<void> {
      if (!saved) return rm(paths.phone(), { force: true });
      if (!remembered) return;
      await writeJson(paths.phone(), {
        ...saved,
        token: safeStorage.encryptString(saved.token).toString("base64"),
      });
    },
  };
}

let service: PhoneService | undefined;
let blocker: number | undefined;

/** Windows (and macOS) don't sleep while a chat works for you and the phone is connected. */
function keepAwake(on: boolean): void {
  if (on && blocker === undefined) blocker = powerSaveBlocker.start("prevent-app-suspension");
  else if (!on && blocker !== undefined) {
    powerSaveBlocker.stop(blocker);
    blocker = undefined;
  }
}

/** Jig on your phone through your own Telegram bot (D-348). */
export async function startPhone(): Promise<void> {
  const m = sessionManager();
  const s = new PhoneService({
    chats: {
      list: () => m.list(),
      snapshot: (id) => m.snapshot(id),
      send: (id, text) => m.send(id, text, [], true),
      answer: (id, requestId, decision) => m.answerPermission(id, requestId, decision),
    },
    store: phoneStore(),
    api: (token) => telegramApi(token),
    project: async (id) => {
      const project = await projectStore().get(id);
      return { name: project.name, color: project.color };
    },
    settings: () => getConfig().phone,
    away: (minutes) => powerMonitor.getSystemIdleState(minutes * 60) !== "active",
    keepAwake,
    enable: async () => {
      await updateConfig({ phone: { enabled: true } });
    },
    onChange: (state) => emit("phone.changed", state),
    code: () => String(randomInt(100000, 1000000)),
    log,
  });
  service = s;

  // Settings asks: also whether topics were turned on in @BotFather since.
  handle("phone.state", async () => {
    await s.checkTopics().catch(() => undefined);
    return s.state();
  });
  handle("phone.connect", ({ token }) => s.connect(token));
  handle("phone.test", () => s.test());
  handle("phone.disconnect", () => s.disconnect());

  onConfigChange(() => s.refresh());
  onSessionStatus((meta) => void s.chatStatus(meta).catch((error) => log.warn("Phone status failed", error)));
  onPermissionCard((sessionId, item) => {
    void m
      .snapshot(sessionId)
      .then(({ meta }) => s.permission(meta, item))
      .catch((error) => log.warn("Phone request failed", error));
  });
  setInterval(() => void s.sweep().catch((error) => log.warn("Phone sweep failed", error)), 30_000).unref();

  registerJigTools([
    {
      name: "jig_phone_send",
      description:
        "Send a short message to the user's phone (Telegram, through Jig). Use it only when the user asked you to tell them on their phone, or when you're blocked on them during long work they left running. Their reply comes back to this chat as their next message. Jig already tells their phone by itself when this chat needs them, finishes or stops, so don't repeat those.",
      shape: { text: z.string().min(1).max(3000).describe("The message, in plain text") },
      readOnly: true,
      handler: (args, meta) => s.fromChat(meta, String(args.text ?? "")),
    },
  ]);

  await s.start();
}

export function stopPhone(): void {
  service?.stop();
  keepAwake(false);
}
