import { createHash, randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, nativeImage, powerMonitor, powerSaveBlocker, safeStorage } from "electron";
import { strToU8, zipSync } from "fflate";
import { z } from "zod";
import { MAX_IMAGE_BYTES } from "../../../../../relay/teams/src/protocol";
import type { PhoneChannelId } from "../../shared/phone";
import { addonService } from "../addons";
import { mainWindow, showInFolder } from "../appWindows";
import { azureContext } from "../azure/env";
import { runAz } from "../azure/run";
import { chatPageScreenshot } from "../browser";
import { getConfig, onConfigChange, updateConfig } from "../config";
import { registerJigTools } from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { logger } from "../log";
import { projectStore } from "../projects";
import { onChatUpdates, onPermissionCard, onSessionStatus, sessionManager } from "../sessions";
import { readJson, writeJson } from "../state/jsonStore";
import { jigHome, paths } from "../state/paths";
import { APP_PNG } from "../window";
import { conciergeChat, onConciergeStartedChat, registerConcierge } from "./concierge";
import type { QueueCounts, QueueView } from "./messages";
import { COMMANDS, PhoneService, type SavedPhone } from "./service";
import { teamsChannel } from "./teams";
import { SavedSetup, TeamsSetup } from "./teamsSetup";
import { teamsAppManifest } from "./teamsSetupPlan";
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
  threads: z.record(z.string(), z.object({ place: Ref, parent: Ref })).optional(),
  names: z.record(z.string(), z.string()).optional(),
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

const here = dirname(fileURLToPath(import.meta.url));

/** The relay's deployment package: in the installer's resources, or built in a clone (`npm run relay:build`). */
function relayZip(): string | undefined {
  if (process.env.JIG_ENGINE === "fake" && process.env.JIG_TEAMS_RELAY_ZIP)
    return process.env.JIG_TEAMS_RELAY_ZIP;
  const file = app.isPackaged
    ? join(process.resourcesPath, "relay", "teams-relay.zip")
    : join(here, "..", "..", "..", "..", "relay", "teams", "dist", "relay.zip");
  return existsSync(file) ? file : undefined;
}

/** Teams' two icons from Jig's logo: colour 192² (on the accent colour), outline 32² white on transparent. */
function teamsIcons(): { color: Buffer; outline: Buffer } {
  const logo = nativeImage.createFromPath(APP_PNG);
  const color = logo.resize({ width: 192, height: 192, quality: "best" }).toPNG();
  const small = logo.resize({ width: 32, height: 32, quality: "best" });
  const bitmap = Buffer.from(small.toBitmap());
  for (let i = 0; i < bitmap.length; i += 4) bitmap.fill(255, i, i + 3);
  const outline = nativeImage.createFromBitmap(bitmap, { width: 32, height: 32 }).toPNG();
  return { color, outline };
}

/** Writes the Teams app package (manifest and icons) into Jig's home and returns its path. */
async function writeTeamsPackage(appId: string, host: string): Promise<string> {
  const { color, outline } = teamsIcons();
  const manifest = teamsAppManifest({ appId, host, commands: COMMANDS });
  const zip = zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
    "color.png": color,
    "outline.png": outline,
  });
  const file = paths.phoneTeamsPackage();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, zip);
  return file;
}

/** The relay's settings with the bot's secret, for `--settings @file`: a private file, deleted right after. */
async function privateFile(contents: string): Promise<{ path: string; done: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "jig-teams-"));
  const file = join(dir, "settings.json");
  await writeFile(file, contents, { mode: 0o600 });
  return { path: file, done: () => rm(dir, { recursive: true, force: true }) };
}

/** Which Jig polls the Teams relay: the same on every start of this Jig home, apart from any other. */
const readerId = () =>
  createHash("sha256").update(`${hostname()}\n${jigHome()}`).digest("base64url").slice(0, 32);

/** A picture within Teams' inline limit (≤ 1024 × 1024, ≤ 1 MB): scaled down, then JPEG as needed. */
function fitForTeams(photo: Buffer): Buffer | undefined {
  let image = nativeImage.createFromBuffer(photo);
  const { width, height } = image.getSize();
  if (!width || !height) return undefined;
  const scale = Math.min(1, 1024 / Math.max(width, height));
  if (scale === 1 && photo.length <= MAX_IMAGE_BYTES) return photo;
  if (scale < 1)
    image = image.resize({
      width: Math.floor(width * scale),
      height: Math.floor(height * scale),
      quality: "best",
    });
  for (const quality of [85, 70, 55, 40]) {
    const jpeg = image.toJPEG(quality);
    if (jpeg.length <= MAX_IMAGE_BYTES) return jpeg;
  }
  return undefined;
}

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

/** Jig on your phone through your own Telegram bot (D-350) or Teams bot (D-370, D-379). */
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
    channel: (id, credential) =>
      id === "teams" ? teamsChannel(credential, { reader: readerId(), fit: fitForTeams }) : undefined,
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
  // Settings → Phone → Set up Teams (D-381): az only when you press Create; the secret and key in memory.
  const setup = new TeamsSetup({
    az: (args, timeoutMs) => runAz(args, { ...azureContext(), timeoutMs }),
    load: async () => readJson(paths.phoneTeamsSetup(), SavedSetup),
    save: async (saved) => {
      if (saved) await writeJson(paths.phoneTeamsSetup(), saved);
      else await rm(paths.phoneTeamsSetup(), { force: true });
    },
    relayZip,
    settingsFile: privateFile,
    connect: (credential) => s.connect(credential),
    installs: () => s.installs(),
    writePackage: writeTeamsPackage,
    onChange: (view) => emit("phone.teamsSetupChanged", view),
  });
  handle("phone.teamsSetup", (args) => setup.open(args));
  handle("phone.teamsSetupWhere", (args) => setup.setWhere(args));
  handle("phone.teamsSetupCreate", () => setup.create());
  handle("phone.teamsSetupManual", ({ appId, credential }) => setup.manual(appId, credential));
  handle("phone.teamsPackage", async () => {
    const view = await setup.writePackage();
    if (view.packagePath) showInFolder(view.packagePath);
    return view;
  });
  handle("phone.teamsSetupForget", () => setup.forget());
  // Disconnect forgets Teams setup too, after Settings listed what to delete (Jig never deletes it).
  handle("phone.disconnect", async () => {
    const teams = getConfig().phone.channel === "teams";
    const state = await s.disconnect();
    if (teams) await setup.forget().catch((error) => log.warn("Forgetting Teams setup failed", error));
    return state;
  });
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
  // A renamed project renames its place on the phone (a topic, a Teams channel; D-380).
  projectStore().onChange(
    () => void s.renameTopics().catch((error) => log.warn("Renaming a project's place failed", error)),
  );
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
        "Send a short message to the user's phone (Telegram or Teams, through Jig). Use it only when the user asked you to tell them on their phone, or when you're blocked on them during long work they left running. Their reply comes back to this chat as their next message. Jig already tells their phone by itself when this chat needs them, finishes or stops, so don't repeat those.",
      shape: {
        text: z.string().min(1).max(3000).describe("The message, in plain text"),
        image: z
          .string()
          .optional()
          .describe("A PNG or JPEG to send with it: a path, absolute or relative to this chat's folder"),
        browserScreenshot: z
          .boolean()
          .optional()
          .describe("Send a screenshot of this chat's page in Jig's browser with it"),
      },
      readOnly: true,
      handler: (args, meta) =>
        s.fromChat(meta, String(args.text ?? ""), {
          ...(typeof args.image === "string" && args.image ? { path: args.image } : {}),
          ...(args.browserScreenshot === true ? { browser: true } : {}),
        }),
    },
    {
      name: "jig_phone_close_room",
      description:
        "Close a chat's room on the user's phone (the topic or thread jig_chat_open or Open chat made, where it is followed live), as /close in that room does. Only the room closes: the chat and its work go on. Without chatId it closes this chat's own room. Says so when there is no room to close.",
      shape: {
        chatId: z
          .string()
          .optional()
          .describe("The chat whose room to close (an id from jig_chats_list); default: this chat"),
      },
      // Like /close: it only stops the phone following a chat, and the room can be opened again.
      readOnly: true,
      handler: (args, meta) =>
        s.closeRoomOf(typeof args.chatId === "string" && args.chatId ? args.chatId : meta.id),
    },
  ]);

  await s.start();
}

export function stopPhone(): void {
  service?.stop();
  keepAwake(false);
}
