import { randomInt, randomUUID } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { powerMonitor, powerSaveBlocker, safeStorage } from "electron";
import { z } from "zod";
import type { PhoneChannelId } from "../../shared/phone";
import { addonService } from "../addons";
import { mainWindow } from "../appWindows";
import { chatPageScreenshot } from "../browser";
import { getConfig, onConfigChange, updateConfig } from "../config";
import { registerJigTools } from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { logger } from "../log";
import { projectStore } from "../projects";
import { onChatUpdates, onPermissionCard, onSessionStatus, sessionManager } from "../sessions";
import { readJson, writeJson } from "../state/jsonStore";
import { paths } from "../state/paths";
import { conciergeChat, onConciergeStartedChat, registerConcierge } from "./concierge";
import type { QueueCounts, QueueView } from "./messages";
import { PhoneService, type SavedPhone } from "./service";
import { telegramApi } from "./telegram";

const log = logger("phone");

/** A message's or place's id: Telegram's numbers, Teams' strings. */
const Ref = z.union([z.number(), z.string()]);

/** One channel's saved state (D-377). */
const SavedChannel = z.object({
  /** The channel's credential (the bot's token, the relay's key), encrypted with the OS (safeStorage), base64. */
  token: z.string().optional(),
  bot: z.string().default(""),
  owner: z.object({ chatId: Ref, name: z.string() }).optional(),
  replies: z.array(z.tuple([Ref, z.string()])).optional(),
  targets: z.array(z.tuple([Ref, z.string()])).optional(),
  topics: z.object({ jig: Ref.optional(), projects: z.record(z.string(), Ref).optional() }).optional(),
  rooms: z.record(z.string(), Ref).optional(),
});

/** `phone.json`: each channel's state apart; the flat file from before D-377 is Telegram's. */
const SavedFile = SavedChannel.partial().extend({
  telegram: SavedChannel.optional(),
  teams: SavedChannel.optional(),
});
type Channels = Partial<Record<PhoneChannelId, z.infer<typeof SavedChannel>>>;

function channelsOf(file: z.infer<typeof SavedFile>): Channels {
  const { telegram, teams, ...flat } = file;
  return {
    ...(telegram ? { telegram } : flat.token ? { telegram: { ...flat, bot: flat.bot ?? "" } } : {}),
    ...(teams ? { teams } : {}),
  };
}

/** Like Microsoft's sign-in (D-232): only with the OS's own encryption, never as plain text. */
function canEncrypt(): boolean {
  return (
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text")
  );
}

/**
 * `phone.json`: each channel's state, its credential encrypted; without the OS's encryption nothing
 * is written (kept until Jig closes). Forgetting a channel keeps the other's; the file goes with the last.
 */
function phoneStore() {
  const remembered = canEncrypt();
  const read = async () => channelsOf(await readJson(paths.phone(), SavedFile));
  return {
    remembered,
    async load(channel: PhoneChannelId = "telegram"): Promise<SavedPhone | undefined> {
      if (!remembered) return undefined;
      const saved = (await read())[channel];
      if (!saved?.token) return undefined;
      try {
        const token = safeStorage.decryptString(Buffer.from(saved.token, "base64"));
        const { token: _, ...rest } = saved;
        return { ...rest, token };
      } catch {
        return undefined;
      }
    },
    async save(saved: SavedPhone | undefined, channel: PhoneChannelId = "telegram"): Promise<void> {
      if (!remembered && saved) return;
      const { [channel]: _old, ...others } = remembered ? await read().catch(() => ({}) as Channels) : {};
      const next: Channels = saved
        ? {
            ...others,
            [channel]: { ...saved, token: safeStorage.encryptString(saved.token).toString("base64") },
          }
        : others;
      if (!Object.keys(next).length) return rm(paths.phone(), { force: true });
      await writeJson(paths.phone(), next);
    },
  };
}

let service: PhoneService | undefined;

/** Voice work the window does (Whisper, the natural voice, Opus): asked by event, answered by call. */
const voiceJobs = new Map<
  string,
  {
    resolve: (result: { text?: string; data?: string }) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function voiceJob(kind: "transcribe" | "speak", data: string): Promise<{ text?: string; data?: string }> {
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      voiceJobs.delete(id);
      reject(new Error("Jig's window didn't answer (is it open?)."));
    }, 180_000);
    voiceJobs.set(id, { resolve, reject, timer });
    emit("phone.voiceJob", { id, kind, data });
  });
}
let blocker: number | undefined;

/** Windows (and macOS) don't sleep while a chat works for you and the phone is connected. */
function keepAwake(on: boolean): void {
  if (on && blocker === undefined) blocker = powerSaveBlocker.start("prevent-app-suspension");
  else if (!on && blocker !== undefined) {
    powerSaveBlocker.stop(blocker);
    blocker = undefined;
  }
}

/** Jig on your phone through your own Telegram bot (D-350). */
export async function startPhone(): Promise<void> {
  const m = sessionManager();
  registerConcierge();
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
    concierge: {
      ask: async (text) => {
        const chat = await conciergeChat();
        await m.send(chat.id, text, [], true);
        return chat.id;
      },
    },
    screens: {
      window: async () => {
        const win = mainWindow();
        if (!win || win.isDestroyed()) return undefined;
        const image = await win.webContents.capturePage();
        const size = image.getSize();
        return (size.width > 1600 ? image.resize({ width: 1600 }) : image).toJPEG(85);
      },
      browser: (sessionId) => chatPageScreenshot(sessionId),
      file: async (meta, path) => {
        const full = isAbsolute(path) ? path : join(meta.cwd, path);
        if (!/\.(png|jpe?g)$/i.test(full)) throw new Error("only PNG and JPEG pictures can be sent.");
        const info = await stat(full).catch(() => undefined);
        if (!info?.isFile()) throw new Error(`there is no file at ${full}.`);
        if (info.size > 10_000_000) throw new Error("the picture is over Telegram's 10 MB.");
        return readFile(full);
      },
    },
    voice: {
      transcribe: async (ogg) => (await voiceJob("transcribe", ogg.toString("base64"))).text ?? "",
      speak: async (text) => {
        const data = (await voiceJob("speak", text)).data;
        if (!data) throw new Error("No audio came back.");
        return Buffer.from(data, "base64");
      },
    },
    projects: async () => (await projectStore().list()).map((p) => ({ id: p.id, name: p.name })),
    queues: {
      overview: async () => (await addonService().call("tasks", "overview", {})) as QueueCounts[],
      list: async (projectId) => (await addonService().call("tasks", "list", { projectId })) as QueueView,
      start: async (projectId) => void (await addonService().call("tasks", "start", { projectId })),
      pause: async (projectId) => void (await addonService().call("tasks", "pause", { projectId })),
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
  handle("phone.open", ({ sessionId }) => s.openRoom(sessionId));
  handle("phone.voiceDone", ({ id, ...result }) => {
    const job = voiceJobs.get(id);
    if (!job) return;
    voiceJobs.delete(id);
    clearTimeout(job.timer);
    if (result.error) job.reject(new Error(result.error));
    else job.resolve(result);
  });
  onChatUpdates((sessionId, updates) => {
    if (updates.some((u) => u.op !== "meta" && u.op !== "queue" && u.op !== "parked"))
      s.chatChanged(sessionId);
  });
  // A chat Jig starts for you from the phone opens as a room there.
  onConciergeStartedChat((sessionId) => s.openRoom(sessionId, s.askedIn()));

  onConfigChange(() => s.refresh());
  // Back from sleep or the lock screen: ask Telegram now instead of after a stale poll or a backoff.
  // Electron's main process has no "online" event (only net.isOnline()), so a network that returns
  // while awake is caught by the next backoff round or a send that gets through.
  powerMonitor.on("resume", () => s.wake());
  powerMonitor.on("unlock-screen", () => s.wake());
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
      shape: {
        text: z.string().min(1).max(3000).describe("The message, in plain text"),
        image: z
          .string()
          .optional()
          .describe("A PNG or JPEG to send with it: a path, absolute or relative to this chat's folder"),
        browserScreenshot: z
          .boolean()
          .optional()
          .describe("Send a screenshot of this chat's page in Claude's browser with it"),
      },
      readOnly: true,
      handler: (args, meta) =>
        s.fromChat(meta, String(args.text ?? ""), {
          ...(typeof args.image === "string" && args.image ? { path: args.image } : {}),
          ...(args.browserScreenshot === true ? { browser: true } : {}),
        }),
    },
  ]);

  await s.start();
}

export function stopPhone(): void {
  service?.stop();
  keepAwake(false);
}
