import { randomUUID } from "node:crypto";
import { readdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { TenantTag } from "../../shared/azure";
import { type ChatState, reduceEvent } from "../../shared/chat";
import {
  type ChatAttachment,
  type ChatItem,
  type ChatLimit,
  type ChatProvider,
  type ChatUpdate,
  chatProvider,
  type EffortLevel,
  type EngineEvent,
  type HandoverPlan,
  type LimitPolicy,
  type McpServerInfo,
  type ModelInfo,
  otherProvider,
  type PermissionDecision,
  type PermissionMode,
  type PermissionRequest,
  type ProviderSpan,
  type QueuedMessage,
  type RewindResult,
  type SavedClaudeSession,
  type SessionMeta,
  type SessionSnapshot,
  type SlashCommandInfo,
} from "../../shared/engine";
import { buildHandoff, editedFiles, ownMessages } from "../../shared/handoff";
import { JigError } from "../../shared/ipc";
import { abortJigToolCalls } from "../engine/jigTools";
import { recordOfferedTools } from "../engine/offeredTools";
import type { ChatToolServer, Engine, EngineSession } from "../engine/types";
import { logger } from "../log";
import { readJson, writeJson } from "../state/jsonStore";
import {
  addAttachment,
  type EnginePart,
  readAttachments,
  removeAttachments,
  saveToolImages,
} from "./attachments";
import { savedChatItems } from "./savedChat";

const log = logger("sessions");

/** Most transcript items kept in the cache file (Claude Code keeps the full history itself). */
const MAX_ITEMS = 3000;
/** Longest time unsaved changes wait while a turn streams. */
const SAVE_MAX_WAIT_MS = 2000;
/** Requests that still wait for the user in "Don't ask" mode: they are questions, not checks. */
const WAITS_IN_DONT_ASK = new Set(["AskUserQuestion", "ExitPlanMode"]);
/** How long a request waits in "Don't ask" mode when no setting says (D-336). */
const DONT_ASK_WAIT_SECONDS = 60;
/** What Claude reads when Jig declines a request in "Don't ask" mode (D-293). */
const DONT_ASK_DENIAL =
  "Declined automatically: this chat runs in Don't ask mode, so nobody is there to approve it. Don't retry the same call; do it a safer way (for an rm -rf safety check, use a folder under the repository's .tmp/ or the system temp folder, never a drive root or the home folder) or skip it and say so in your reply.";

/** Providers by name, for the lines Jig writes in a chat. */
const NAME: Record<ChatProvider, string> = { claude: "Claude", codex: "ChatGPT" };
/** What the next provider is asked after the handoff when a chat continues with it (D-338). */
const CONTINUE_TEXT = "Carry on with this chat's work from where it stopped.";
/** What the same provider is asked when its limit has reset (D-338). */
const RESUME_TEXT = "Your usage limit has reset. Carry on from where you stopped.";
/** A little after the reset, so the plan has room when the message arrives. */
const RESUME_GRACE_MS = 30_000;
/** Longest a timer can wait (setTimeout's limit); a later reset waits again then. */
const MAX_TIMER_MS = 2_000_000_000;
/** Minutes an idle chat keeps its Claude Code or Codex process when no setting says (D-367). */
const IDLE_STOP_MINUTES = 20;
/** How often idle chats are looked at. */
const IDLE_SWEEP_MS = 60_000;

const QueuedSchema = z.object({
  id: z.string(),
  text: z.string(),
  attachments: z
    .array(
      z.object({
        path: z.string(),
        mime: z.string(),
        name: z.string().optional(),
        kind: z.enum(["image", "pdf", "office", "text"]).optional(),
      }),
    )
    .optional(),
});

/** A chat in the middle of a turn. */
const BUSY: SessionMeta["status"][] = ["working", "needs_you", "starting"];

const SessionFileSchema = z.object({
  meta: z.custom<SessionMeta>((v) => typeof v === "object" && v !== null && "id" in v),
  items: z.array(z.custom<ChatItem>()).default([]),
  queue: z.array(QueuedSchema).default([]),
  /** Messages you parked (D-365). */
  parked: z.array(QueuedSchema).default([]),
});

export interface SessionManagerOptions {
  dir: string;
  /** Images sent in chats (`~/.jig/attachments`). */
  attachmentsDir: string;
  /** Claude's engine: Claude chats, and saved Claude Code conversations. */
  engine: Engine;
  /** The engine for a chat's provider (D-309); without it every chat runs on `engine`. */
  engineFor?: (provider: ChatProvider) => Engine;
  /** Settings at the time a Claude Code process starts. */
  engineSettings: () => {
    claudePath: string;
    codexPath?: string;
    allowApiKey: boolean;
    codexAllowApiKey?: boolean;
    codexInstructions?: "claude" | "off";
    codexSkills?: "claude" | "off";
    env: Record<string, string | undefined>;
    promptSuggestions?: boolean;
    fileCheckpoints?: boolean;
    /** Seconds a request waits for you in "Don't ask" mode before it's declined; 0 = at once (D-336). */
    dontAskWaitSeconds?: number;
    /** The Azure tenant `env` points at (recorded on the chat while its process runs). */
    azureTenant?: TenantTag;
    /** Minutes an idle chat keeps its process before Jig stops it (it resumes on the next use); 0 = never. */
    idleStopMinutes?: number;
  };
  appendSystemPrompt: (meta: SessionMeta) => string;
  /** Changes in selected skills restart an idle process before the next message, preserving resume. */
  configurationKey?: (meta: SessionMeta) => string;
  plugins?: (meta: SessionMeta) => Array<{ type: "local"; path: string }>;

  /** Text that goes with each message to Claude, not shown in the transcript (add-ons' context). */
  /** Context for one message (`text` is what you wrote). */
  turnContext?: (meta: SessionMeta, text: string) => Promise<string>;
  /** Jig's tools for the chat by MCP server name (`jig`, `jig-builder`), for any engine (D-313). */
  toolServers?: (meta: SessionMeta) => Record<string, ChatToolServer> | undefined;
  /** Claude Code's built-in tools a chat may use; undefined: all. */
  builtinTools?: (meta: SessionMeta) => string[] | undefined;
  agents?: (meta: SessionMeta) => Record<string, unknown> | undefined;
  /** Claude Code reported plan rate-limit state (the usage meter refreshes). */
  onRateLimit?: (event: Extract<EngineEvent, { type: "rate_limit" }>) => void;
  /** What a chat does when its plan's limit stops it (D-338); without it, the limit card asks. */
  limitPolicy?: (meta: SessionMeta) => LimitPolicy;
  /** Whether a provider's plan has room for a chat to carry on with it (the usage meter, D-338). */
  providerRoom?: (provider: ChatProvider) => { ok: boolean; reason?: string };
  /** When a provider's used-up plan has room again (the usage meter), for a limit that didn't say. */
  providerResetsAt?: (provider: ChatProvider) => string | undefined;
  /** The model, effort and mode a chat gets when it continues with a provider (D-338). */
  providerDefaults?: (
    meta: SessionMeta,
    provider: ChatProvider,
  ) => { model: string; effort?: EffortLevel; permissionMode: PermissionMode };
  /** `git diff --stat` in the chat's folder for the handoff; "" when it isn't a repository. */
  diffStat?: (cwd: string) => Promise<string>;
  /**
   * A short name for a new chat from its first message (the quick model, D-288). Until it answers the
   * chat is called by the message's first words; a name you gave meanwhile is kept.
   */
  nameChat?: (meta: SessionMeta, text: string) => Promise<string | undefined>;
  /** A next message after a turn, for engines that don't suggest one themselves (Codex, D-315). */
  suggestNext?: (meta: SessionMeta, turn: { message: string; reply: string }) => Promise<string | undefined>;
  /**
   * Whether something outside the chat still counts on its process (a queued task running in it): an
   * idle chat it answers true for keeps its process (D-367).
   */
  keepAwake?: (meta: SessionMeta) => boolean | Promise<boolean>;
  /** A turn ended (result or process exit), e.g. to notice a builder that stopped. */
  onTurnEnd?: (meta: SessionMeta) => void;
  /** A chat was archived or deleted (what it holds open elsewhere, like its browser page, closes). */
  onClosed?: (id: string) => void;
  onUpdate: (sessionId: string, updates: ChatUpdate[]) => void;
  /** Runs a shell command you typed with `!` in the chat's folder. */
  runShell?: (cwd: string, command: string) => Promise<{ output: string; exitCode: number }>;
  /** Activity for the learning log (phase 9): prompts and tool calls. */
  onActivity?: (event: {
    kind: "prompt" | "tool" | "friction";
    session: SessionMeta;
    text: string;
    tool?: string;
    /** Shared files only; input method and paths are not recorded for learning. */
    imageAttachments?: number;
    fileAttachments?: number;
    /** The tool's input (to record the lines Claude writes). */
    input?: Record<string, unknown>;
    /** Friction (Learning 2): interrupt, rewind, denied, tool-errors. */
    signal?: string;
  }) => void;
}

interface PendingPermission {
  resolve: (d: PermissionDecision) => void;
  request: PermissionRequest;
  /** "Don't ask": declines the request when nobody answered in time (D-336). */
  timer?: NodeJS.Timeout;
}

interface Live {
  state: ChatState;
  queue: QueuedMessage[];
  /** Messages you parked (D-365): saved with the chat, sent only when you send one. */
  parked: QueuedMessage[];
  engine?: EngineSession;
  permissions: Map<string, PendingPermission>;
  saveTimer?: NodeJS.Timeout;
  loaded: boolean;
  /** Identifies the current Claude Code process: events from a stopped or replaced one are ignored. */
  engineToken?: object;
  configurationKey?: string;
  /** Deleted: nothing is emitted or saved for it any more (a late event can't bring it back). */
  deleted?: boolean;
  lastSave?: number;
  saving?: Promise<void>;
  /** Failed tool calls in the current turn (friction when it reaches 3). */
  toolErrors?: number;
  /** A turn being started (attachments read, add-ons' context asked): settles once its message is sent. */
  starting?: Promise<void>;
  /** This turn was stopped by the plan's limit: its queued messages wait (D-338). */
  limited?: boolean;
  /** Carry on with the other provider when this turn ends (`engine.onLimit` is switch). */
  autoContinue?: boolean;
  /** Resumes the chat when its limit resets. */
  limitTimer?: NodeJS.Timeout;
  /** When its process last did or was asked something (idle chats' processes stop after a while). */
  lastActive?: number;
}

/**
 * Owns every chat session: metadata and a transcript cache in `~/.jig/sessions/<id>.json`, one Claude
 * Code process per session while it is in use (started on the first message, resumed with Claude
 * Code's own session id after a restart), the follow-up queue and permission prompts.
 */
export class SessionManager {
  private sessions = new Map<string, Live>();
  private ready: Promise<void> | undefined;
  /** Slash commands and skills by provider and folder, and each provider's model list, as last told. */
  private commandCache = new Map<string, SlashCommandInfo[]>();
  private modelCache = new Map<ChatProvider, ModelInfo[]>();
  private idleSweep?: NodeJS.Timeout;

  constructor(private readonly options: SessionManagerOptions) {}

  /** How long a request waits in "Don't ask" mode before Jig declines it (D-336). */
  private dontAskWaitMs(): number {
    const seconds = this.options.engineSettings().dontAskWaitSeconds ?? DONT_ASK_WAIT_SECONDS;
    return Math.max(0, seconds) * 1000;
  }

  private load(): Promise<void> {
    this.ready ??= (async () => {
      let files: string[] = [];
      try {
        files = (await readdir(this.options.dir)).filter((f) => f.endsWith(".json"));
      } catch {
        return;
      }
      for (const file of files) {
        try {
          const data = await readJson(join(this.options.dir, file), SessionFileSchema, null);
          const legacyEmpty =
            data.meta.draft === undefined &&
            !data.meta.kind &&
            !data.meta.importedFrom &&
            !data.meta.turns &&
            data.queue.length === 0 &&
            data.parked.length === 0 &&
            !data.items.some(
              (item) => item.kind === "user" || item.kind === "assistant" || item.kind === "tool",
            );
          if (data.meta.draft || legacyEmpty) continue;
          // A process can't survive a restart: anything "working" is idle now, its turn cut off (D-394;
          // a clean quit marked it already, a crash or a killed process didn't).
          const status = data.meta.status === "error" ? "error" : "idle";
          const cutOffAt =
            data.meta.cutOffAt ?? (BUSY.includes(data.meta.status) ? new Date().toISOString() : undefined);
          // A chat that was carrying on with the other provider when Jig closed asks again (D-338).
          const limit: ChatLimit | undefined =
            data.meta.limit?.state === "continuing" ? { ...data.meta.limit, state: "ask" } : data.meta.limit;
          const live: Live = {
            // Nor do its background tasks.
            state: {
              meta: {
                ...data.meta,
                status,
                limit,
                cutOffAt,
                backgroundTasks: undefined,
                azureTenant: undefined,
              },
              items: data.items,
            },
            queue: data.queue,
            parked: data.parked,
            permissions: new Map(),
            loaded: true,
          };
          this.sessions.set(data.meta.id, live);
          if (limit?.state === "waiting") this.armWait(live);
        } catch (error) {
          log.warn(`Skipping unreadable session file ${file}`, error);
        }
      }
    })();
    return this.ready;
  }

  private async live(id: string): Promise<Live> {
    await this.load();
    const live = this.sessions.get(id);
    if (!live) throw new JigError("not_found", "Session not found");
    return live;
  }

  private file(id: string) {
    return join(this.options.dir, `${id}.json`);
  }

  /**
   * Saves the session file 500 ms after the last change, but at least every 2 s while changes keep
   * coming (a long streamed turn), so a crash loses little.
   */
  private scheduleSave(live: Live, immediate = false): Promise<void> | undefined {
    if (live.deleted || live.state.meta.draft) return undefined;
    clearTimeout(live.saveTimer);
    live.saveTimer = undefined;
    const save = () => {
      if (live.deleted) return Promise.resolve();
      live.lastSave = Date.now();
      live.saving = writeJson(this.file(live.state.meta.id), {
        meta: live.state.meta,
        items: live.state.items.slice(-MAX_ITEMS),
        queue: live.queue,
        parked: live.parked,
      }).catch((error) => log.error("Saving session failed", error));
      return live.saving;
    };
    if (immediate || Date.now() - (live.lastSave ?? Date.now()) > SAVE_MAX_WAIT_MS) return save();
    live.lastSave ??= Date.now();
    live.saveTimer = setTimeout(() => void save(), 500);
    return undefined;
  }

  private emit(live: Live, updates: ChatUpdate[]) {
    if (updates.length === 0 || live.deleted) return;
    this.options.onUpdate(live.state.meta.id, updates);
    this.scheduleSave(live);
  }

  private setMeta(live: Live, patch: Partial<SessionMeta>) {
    live.state.meta = { ...live.state.meta, ...patch, updatedAt: new Date().toISOString() };
    this.emit(live, [{ op: "meta", meta: live.state.meta }]);
  }

  async list(): Promise<SessionMeta[]> {
    await this.load();
    return [...this.sessions.values()]
      .map((l) => l.state.meta)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(input: {
    projectId?: string;
    cwd: string;
    title?: string;
    model: string;
    permissionMode: PermissionMode;
    /** Who runs it at first (D-309); default Claude. A handover changes it later (D-338, D-339). */
    provider?: ChatProvider;
    kind?: SessionMeta["kind"];
    buildId?: string;
    effort?: SessionMeta["effort"];
  }): Promise<SessionMeta> {
    await this.load();
    const at = new Date().toISOString();
    const meta: SessionMeta = {
      id: randomUUID(),
      provider: input.provider ?? "claude",
      draft: !input.kind,
      projectId: input.projectId,
      cwd: input.cwd,
      title: input.title ?? "New chat",
      createdAt: at,
      updatedAt: at,
      model: input.model,
      permissionMode: input.permissionMode,
      status: "idle",
      authSource: "unknown",
      costUsd: 0,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      turns: 0,
      kind: input.kind,
      buildId: input.buildId,
      ...(input.effort ? { effort: input.effort } : {}),
    };
    const live: Live = {
      state: { meta, items: [] },
      queue: [],
      parked: [],
      permissions: new Map(),
      loaded: true,
    };
    this.sessions.set(meta.id, live);
    this.scheduleSave(live, true);
    this.options.onUpdate(meta.id, [{ op: "meta", meta }]);
    return meta;
  }

  async snapshot(id: string): Promise<SessionSnapshot> {
    const live = await this.live(id);
    return { meta: live.state.meta, items: live.state.items, queue: live.queue, parked: live.parked };
  }

  /** The engine that runs this chat: its provider's (D-309). */
  private engineOf(meta: SessionMeta): Engine {
    return this.options.engineFor?.(chatProvider(meta)) ?? this.options.engine;
  }

  private startEngine(live: Live): EngineSession {
    live.lastActive = Date.now();
    if (live.engine) return live.engine;
    this.armIdleSweep();
    const token = {};
    live.engineToken = token;
    const meta = live.state.meta;
    const settings = this.options.engineSettings();
    live.configurationKey = this.options.configurationKey?.(meta);
    // Which tenant this process runs `az` with; not a change of the chat (its time stays).
    const tenant = settings.azureTenant;
    if (tenant?.key !== meta.azureTenant?.key || tenant?.label !== meta.azureTenant?.label) {
      live.state.meta = { ...live.state.meta, azureTenant: tenant };
      this.emit(live, [{ op: "meta", meta: live.state.meta }]);
    }
    const session = this.engineOf(meta).start(
      {
        cwd: meta.cwd,
        model: meta.model,
        permissionMode: meta.permissionMode,
        resume: meta.resetPending ? undefined : meta.engineSessionId,
        resumeSessionAt: meta.resetPending ? undefined : meta.resumeAt,
        effort: meta.effort,
        additionalDirectories: meta.addDirs,
        appendSystemPrompt: this.options.appendSystemPrompt(meta),
        env: settings.env,
        claudePath: settings.claudePath,
        codexPath: settings.codexPath,
        codexAllowApiKey: settings.codexAllowApiKey,
        codexInstructions: settings.codexInstructions,
        codexSkills: settings.codexSkills,
        promptSuggestions: settings.promptSuggestions,
        suggestNext: this.options.suggestNext
          ? (turn) => this.options.suggestNext!(live.state.meta, turn)
          : undefined,
        forkSession: meta.forkPending,
        fileCheckpoints: settings.fileCheckpoints,
        toolServers: this.options.toolServers?.(meta),
        tools: this.options.builtinTools?.(meta),
        agents: this.options.agents?.(meta),
        plugins: this.options.plugins?.(meta),
        askPermission: (request, signal) =>
          new Promise<PermissionDecision>((resolve) => {
            // "Don't ask": Claude Code's own safety checks (rm -rf on a drive root…) still ask. Jig
            // shows them for a while (`engine.dontAskWaitSeconds`) and declines them when nobody
            // answers, so Claude carries on; 0 declines at once. Questions just wait (D-293, D-336).
            const dontAsk =
              live.state.meta.permissionMode === "bypassPermissions" &&
              !WAITS_IN_DONT_ASK.has(request.toolName);
            const waitMs = dontAsk ? this.dontAskWaitMs() : 0;
            if (dontAsk && waitMs <= 0) {
              this.handleEvent(live, {
                type: "notice",
                tone: "warning",
                text: `Declined automatically in Don't ask mode: ${request.title ?? request.toolName}${request.description ? ` (${request.description})` : ""}.`,
              });
              resolve({ behavior: "deny", message: DONT_ASK_DENIAL });
              return;
            }
            const pending: PendingPermission = { resolve, request };
            live.permissions.set(request.requestId, pending);
            if (dontAsk) {
              pending.timer = setTimeout(() => {
                if (live.permissions.get(request.requestId) !== pending) return;
                live.permissions.delete(request.requestId);
                this.handleEvent(live, {
                  type: "permission_resolved",
                  requestId: request.requestId,
                  status: "denied",
                  timedOut: true,
                });
                resolve({ behavior: "deny", message: DONT_ASK_DENIAL });
              }, waitMs);
            }
            this.handleEvent(live, {
              type: "permission",
              request,
              ...(dontAsk ? { declineAt: new Date(Date.now() + waitMs).toISOString() } : {}),
            });
            signal.addEventListener("abort", () => {
              if (live.permissions.get(request.requestId) !== pending) return;
              live.permissions.delete(request.requestId);
              clearTimeout(pending.timer);
              this.handleEvent(live, {
                type: "permission_resolved",
                requestId: request.requestId,
                status: "cancelled",
              });
              resolve({ behavior: "deny", message: "Cancelled" });
            });
          }),
      },
      (event) => {
        // A process that was stopped or replaced may still send its last events (its exit above all).
        if (live.engineToken === token) this.handleEvent(live, event);
      },
    );
    live.engine = session;
    return session;
  }

  private handleEvent(live: Live, incoming: EngineEvent) {
    let event = incoming;
    live.lastActive = Date.now();
    // Images in tool results go to the chat's attachments; the transcript keeps their paths.
    if (event.type === "tool_result" && event.imageData?.length) {
      const { imageData, ...rest } = event;
      try {
        event = {
          ...rest,
          images: saveToolImages(this.options.attachmentsDir, live.state.meta.id, event.toolUseId, imageData),
        };
      } catch (error) {
        log.warn("Couldn't save tool images", error);
        event = rest;
      }
    }
    if (event.type === "rate_limit") {
      this.options.onRateLimit?.(event);
      return;
    }
    if (event.type === "commands") {
      this.commandCache.set(JSON.stringify([live.state.meta.cwd, live.configurationKey]), event.commands);
      return;
    }
    if (event.type === "exit") {
      live.engine = undefined;
      // Background tasks ran in that Claude Code process: they're gone with it.
      if (live.state.meta.backgroundTasks?.length) this.setMeta(live, { backgroundTasks: undefined });
      // The next process starts with the tenant active then.
      if (live.state.meta.azureTenant) {
        live.state.meta = { ...live.state.meta, azureTenant: undefined };
        this.emit(live, [{ op: "meta", meta: live.state.meta }]);
      }
      for (const [requestId, pending] of live.permissions) {
        clearTimeout(pending.timer);
        pending.resolve({ behavior: "deny", message: "Session ended" });
        live.permissions.delete(requestId);
      }
    }
    if (event.type === "tool_use" && !event.parentId)
      this.options.onActivity?.({
        kind: "tool",
        session: live.state.meta,
        tool: event.name,
        text: typeof event.input.command === "string" ? event.input.command : JSON.stringify(event.input),
        input: event.input,
      });
    if (event.type === "tool_result" && event.isError) {
      live.toolErrors = (live.toolErrors ?? 0) + 1;
      if (live.toolErrors === 3) this.friction(live, "tool-errors", "3 failed tool calls in one turn");
    }
    this.emit(live, reduceEvent(live.state, event));
    if (event.type === "error" && event.code === "rate_limit") this.limitHit(live);
    // Stopped by its limit with `switch`: the chat carries on with the other provider (D-338).
    if ((event.type === "result" || event.type === "exit") && live.autoContinue) {
      live.autoContinue = false;
      const to = otherProvider(chatProvider(live.state.meta));
      void this.continueWith(live, to, "limit").catch((error: Error) => {
        log.warn("Couldn't continue with the other provider", error);
        this.limitState(live, "ask");
      });
    }
    // A fork has its own Claude Code session id from its first start on.
    if (event.type === "init" && live.state.meta.forkPending) this.setMeta(live, { forkPending: undefined });
    if (event.type === "init" && event.tools) recordOfferedTools(event.tools);
    if (event.type === "result" || event.type === "exit") this.options.onTurnEnd?.(live.state.meta);
    if (event.type === "result") {
      this.scheduleSave(live, true);
      void this.refreshContext(live);
      // A turn its limit stopped leaves the queue for later: the next message would hit it too.
      const next = live.limited ? undefined : live.queue.shift();
      if (next) {
        this.emit(live, [{ op: "queue", queue: live.queue }]);
        void this.startTurn(live, next.text, next.attachments);
      }
    }
  }

  /** Replaces the first-words title with the quick model's name, unless the chat was renamed since. */
  private async nameChat(live: Live, text: string, placeholder: string) {
    if (!this.options.nameChat) return;
    const name = await this.options.nameChat(live.state.meta, text).catch((error: Error) => {
      log.warn("Couldn't name a chat", error);
      return undefined;
    });
    const title = name ? cleanTitle(name) : "";
    if (!title || live.deleted || live.state.meta.title !== placeholder) return;
    this.setMeta(live, { title });
  }

  /** Asks Claude Code how full the context window is and keeps it on the session. */
  private async refreshContext(live: Live) {
    const context = await live.engine?.contextUsage().catch(() => undefined);
    if (!context) return;
    live.state.meta = { ...live.state.meta, context };
    this.emit(live, [{ op: "meta", meta: live.state.meta }]);
    this.scheduleSave(live);
  }

  /** Starts a turn; while it starts, `live.starting` lets a message sent "now" wait to join it. */
  private async startTurn(
    live: Live,
    text: string,
    attachments: ChatAttachment[] = [],
    from?: string,
    icon?: string,
  ) {
    let started = () => {};
    const starting = new Promise<void>((resolve) => {
      started = resolve;
    });
    live.starting = starting;
    try {
      await this.beginTurn(live, text, attachments, from, icon);
    } finally {
      if (live.starting === starting) live.starting = undefined;
      started();
    }
  }

  private async beginTurn(
    live: Live,
    text: string,
    attachments: ChatAttachment[],
    from?: string,
    icon?: string,
  ) {
    // Never interrupt in-flight work for a library change. At a turn boundary, resume the same
    // conversation with the new plugins and prompt. Old process events are ignored by stop().
    if (live.engine && live.configurationKey !== this.options.configurationKey?.(live.state.meta)) {
      this.stop(live);
      this.commandCache.clear();
    }

    // A new turn ends the limit's wait: a card still open or waiting is passed by (D-338).
    live.limited = false;
    if (live.state.meta.limit) {
      clearTimeout(live.limitTimer);
      const card = live.state.items.find((i) => i.id === live.state.meta.limit?.itemId);
      if (card?.kind === "limit" && (card.status === "open" || card.status === "waiting"))
        this.replaceItem(live, { ...card, status: "dismissed" });
      live.state.meta = { ...live.state.meta, limit: undefined };
    }
    // Busy from now on, before any await: a second send right away is queued, not started twice. A
    // turn cut off by Jig closing is behind it now (D-394).
    live.state.meta = { ...live.state.meta, status: "starting", cutOffAt: undefined };
    let data: EnginePart[] = [];
    try {
      data = await readAttachments(this.options.attachmentsDir, live.state.meta.id, attachments);
    } catch (error) {
      // Keep the message in the transcript (it's no longer in the queue), say why it wasn't sent, and
      // go on with the next queued message.
      const kept: ChatItem = { kind: "user", id: `user-${randomUUID()}`, text, at: new Date().toISOString() };
      live.state.items.push(kept);
      this.emit(live, [{ op: "upsert", item: kept }]);
      this.handleEvent(live, {
        type: "error",
        code: "process",
        message: `Not sent — attachments: ${(error as Error).message}`,
      });
      const next = live.queue.shift();
      if (next) {
        this.emit(live, [{ op: "queue", queue: live.queue }]);
        void this.startTurn(live, next.text, next.attachments);
      }
      return;
    }
    const item: ChatItem = {
      kind: "user",
      id: `user-${randomUUID()}`,
      text,
      at: new Date().toISOString(),
      ...(attachments.length ? { attachments } : {}),
      ...(from ? { from } : {}),
      ...(from && icon ? { fromIcon: icon } : {}),
    };
    const updates: ChatUpdate[] = [{ op: "upsert", item }];
    live.state.items.push(item);
    const meta = live.state.meta;
    const unnamed = meta.turns === 0 && (meta.title === "New chat" || meta.title === "New session");
    const title = unnamed ? summarize(text || attachments[0]?.name || "Attachment") : meta.title;
    if (unnamed && text.trim()) void this.nameChat(live, text, title);
    live.state.meta = {
      ...meta,
      title,
      status: "working",
      lastError: undefined,
      suggestion: undefined,
      updatedAt: new Date().toISOString(),
    };
    updates.push({ op: "meta", meta: live.state.meta });
    this.emit(live, updates);
    this.options.onActivity?.({
      kind: "prompt",
      session: live.state.meta,
      text,
      imageAttachments: attachments.filter((a) => (a.kind ?? "image") === "image").length,
      fileAttachments: attachments.filter((a) => (a.kind ?? "image") !== "image").length,
    });
    live.toolErrors = 0;
    // Output of `!` commands you ran since the last message goes with it, as Claude Code sends it.
    const shells = live.state.items.filter(
      (i): i is Extract<ChatItem, { kind: "shell" }> => i.kind === "shell" && !i.sent && i.status === "done",
    );
    for (const shell of shells) {
      const sent = { ...shell, sent: true };
      live.state.items[live.state.items.indexOf(shell)] = sent;
      this.emit(live, [{ op: "upsert", item: sent }]);
    }
    let withShell = shells.length ? `${shells.map(shellContext).join("\n")}\n\n${text}` : text;
    // The first message to a provider the chat continued with brings the handoff (D-338).
    const handoff = live.state.meta.handoffPending;
    if (handoff) {
      const diffStat = (await this.options.diffStat?.(live.state.meta.cwd).catch(() => "")) ?? "";
      const summary = buildHandoff({
        items: live.state.items,
        from: handoff.from,
        to: chatProvider(live.state.meta),
        reason: handoff.reason,
        diffStat,
      });
      live.state.meta = { ...live.state.meta, handoffPending: undefined };
      if (summary) withShell = `${summary}\n\n${withShell}`;
    }
    const context = (await this.options.turnContext?.(live.state.meta, text).catch(() => "")) ?? "";
    const message = context
      ? `<jig-context>\nWhat Jig's add-ons tell you for this message (not written by the user):\n${context}\n</jig-context>\n\n${withShell}`
      : withShell;
    try {
      const messageId = this.startEngine(live).send(message, data);
      const sent = { ...item, messageId };
      const at = live.state.items.indexOf(item);
      if (at >= 0) live.state.items[at] = sent;
      this.emit(live, [{ op: "upsert", item: sent }]);
    } catch (error) {
      this.handleEvent(live, { type: "error", code: "process", message: (error as Error).message });
    }
  }

  /**
   * Sends a message, or queues it while Claude is busy. With `now`, a message sent while Claude works
   * goes into the running turn instead (Claude reads it at its next step), as typing in Claude Code does.
   */
  async send(id: string, text: string, attachments: ChatAttachment[] = [], now = false): Promise<void> {
    const live = await this.live(id);
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    if (live.state.meta.draft) this.setMeta(live, { draft: false });
    const busy = ["working", "needs_you", "starting"].includes(live.state.meta.status);
    // Sent "now" while the turn is still starting: wait until its message has gone, then join it.
    if (busy && now && !live.engine && live.starting) await live.starting;
    if (busy && now && live.engine) {
      // Attachments that can't be read go to the queue instead, where starting the turn reports why.
      const data = await readAttachments(this.options.attachmentsDir, live.state.meta.id, attachments).catch(
        () => undefined,
      );
      if (data && live.engine) {
        const item: ChatItem = {
          kind: "user",
          id: `user-${randomUUID()}`,
          text: trimmed,
          at: new Date().toISOString(),
          ...(attachments.length ? { attachments } : {}),
        };
        live.state.items.push(item);
        this.emit(live, [{ op: "upsert", item }]);
        const messageId = live.engine.send(trimmed, data, "next");
        const sent = { ...item, messageId };
        live.state.items[live.state.items.indexOf(item)] = sent;
        this.emit(live, [{ op: "upsert", item: sent }]);
        return;
      }
    }
    // Messages still queued (Claude stopped or restarted before reaching them) go first.
    if (busy || live.queue.length) {
      live.queue.push({ id: randomUUID(), text: trimmed, ...(attachments.length ? { attachments } : {}) });
      if (!busy) {
        const next = live.queue.shift()!;
        this.emit(live, [{ op: "queue", queue: live.queue }]);
        return this.startTurn(live, next.text, next.attachments);
      }
      this.emit(live, [{ op: "queue", queue: live.queue }]);
      return;
    }
    await this.startTurn(live, trimmed, attachments);
  }

  /**
   * A message from Jig, not the user (a terminal Claude started has finished): it starts a turn in an
   * idle chat, or goes into the running turn, so Claude reacts without polling. `from` is the line the
   * transcript shows for it, `icon` the Lucide icon beside it (an add-on's; a terminal by default). A
   * chat that no longer exists is skipped.
   */
  async notify(id: string, text: string, from: string, icon?: string): Promise<void> {
    const live = await this.live(id).catch(() => undefined);
    if (!live) return;
    if (live.starting) await live.starting;
    // A new chat an add-on starts with its own message (Factory's stage chats) is kept from then on.
    if (live.state.meta.draft) this.setMeta(live, { draft: false });
    if (["working", "needs_you", "starting"].includes(live.state.meta.status) && live.engine) {
      const item: ChatItem = {
        kind: "user",
        id: `user-${randomUUID()}`,
        text,
        at: new Date().toISOString(),
        from,
        ...(icon ? { fromIcon: icon } : {}),
      };
      live.state.items.push(item);
      this.emit(live, [{ op: "upsert", item }]);
      const messageId = live.engine.send(text, [], "next");
      live.state.items[live.state.items.indexOf(item)] = { ...item, messageId };
      this.emit(live, [{ op: "upsert", item: { ...item, messageId } }]);
      return;
    }
    await this.startTurn(live, text, [], from, icon);
  }

  /**
   * A new chat that continues this one as a branch (Claude Code's fork): same transcript, and its
   * first message resumes the conversation under a new Claude Code session id.
   */
  async fork(id: string): Promise<SessionMeta> {
    const source = (await this.live(id)).state;
    if (!source.meta.engineSessionId)
      throw new JigError("invalid_args", "Send a message before forking this chat");
    const meta = await this.create({
      projectId: source.meta.projectId,
      cwd: source.meta.cwd,
      title: `${source.meta.title} (fork)`,
      model: source.meta.model,
      permissionMode: source.meta.permissionMode,
      provider: chatProvider(source.meta),
    });
    const live = await this.live(meta.id);
    live.state.items = source.items
      .filter((i) => i.kind !== "permission" || i.status !== "pending")
      .map((i) => structuredClone(i));
    live.state.items.push({
      kind: "notice",
      id: `fork-${Date.now()}`,
      at: new Date().toISOString(),
      tone: "info",
      text: `Forked from “${source.meta.title}”. What you send here doesn't change the original chat.`,
    });
    this.setMeta(live, {
      engineSessionId: source.meta.engineSessionId,
      draft: false,
      forkPending: true,
      turns: source.meta.turns,
      context: source.meta.context,
    });
    this.scheduleSave(live, true);
    return live.state.meta;
  }

  /** The engine whose saved conversation it is (Claude Code's, or Codex's thread, D-315). */
  private savedEngine(saved: { provider?: ChatProvider }): Engine {
    return saved.provider === "codex"
      ? (this.options.engineFor?.("codex") ?? this.options.engine)
      : this.options.engine;
  }

  /**
   * The conversations Claude Code and Codex saved on this machine (D-150, D-315), newest first; one
   * already in Jig (as a chat Jig ran, or opened before) says which chat.
   */
  async savedSessions(limit = 300): Promise<SavedClaudeSession[]> {
    await this.load();
    const chats = new Map<string, string>();
    for (const { state } of this.sessions.values()) {
      if (state.meta.engineSessionId) chats.set(state.meta.engineSessionId, state.meta.id);
      for (const span of state.meta.providers ?? [])
        if (span.engineSessionId) chats.set(span.engineSessionId, state.meta.id);
      if (state.meta.importedFrom) chats.set(state.meta.importedFrom, state.meta.id);
    }
    const codex = this.options.engineFor?.("codex");
    const lists = await Promise.all([
      this.options.engine.savedSessions({ limit }),
      codex?.capabilities.history && codex !== this.options.engine
        ? codex.savedSessions({ limit }).catch(() => [])
        : [],
    ]);
    return lists
      .flat()
      .sort((a, b) => b.lastModified - a.lastModified)
      .slice(0, limit)
      .map((s) => (chats.has(s.sessionId) ? { ...s, chatId: chats.get(s.sessionId) } : s));
  }

  /**
   * A chat from a conversation Claude Code saved (D-150), in No project: its history, and its first
   * message continues it as a branch (Claude Code's fork), so the original is left as it was. One
   * opened before is returned as it is.
   */
  async openSaved(input: {
    saved: SavedClaudeSession;
    model: string;
    permissionMode: PermissionMode;
    effort?: SessionMeta["effort"];
  }): Promise<SessionMeta> {
    const { saved } = input;
    const known = (await this.savedSessions()).find((s) => s.sessionId === saved.sessionId)?.chatId;
    if (known && this.sessions.has(known)) return (await this.live(known)).state.meta;
    const provider = saved.provider ?? "claude";
    const from = provider === "codex" ? "Codex" : "Claude Code";
    const messages = await this.savedEngine(saved).savedMessages(saved.sessionId, saved.cwd);
    if (messages.length === 0) throw new JigError("not_found", `${from} has no messages saved for that chat`);
    const cwd =
      saved.cwd && (await stat(saved.cwd).catch(() => undefined))?.isDirectory() ? saved.cwd : homedir();
    const meta = await this.create({
      cwd,
      title: summarize(saved.title) || `${from} chat`,
      model: input.model,
      permissionMode: input.permissionMode,
      provider,
      effort: input.effort,
    });
    const live = await this.live(meta.id);
    const at = new Date(saved.lastModified || Date.now()).toISOString();
    live.state.items = savedChatItems(messages, meta, at);
    live.state.items.push({
      kind: "notice",
      id: `opened-${Date.now()}`,
      at: new Date().toISOString(),
      tone: "info",
      text:
        cwd === saved.cwd
          ? `Opened from ${from}. What you send here continues it as a copy; the original chat stays as it was.`
          : `Opened from ${from}. Its folder (${saved.cwd ?? "unknown"}) isn't there any more, so this chat works in your home folder.`,
    });
    this.setMeta(live, {
      engineSessionId: saved.sessionId,
      draft: false,
      forkPending: true,
      importedFrom: saved.sessionId,
      turns: live.state.items.filter((i) => i.kind === "user").length,
    });
    await this.scheduleSave(live, true);
    return live.state.meta;
  }

  /**
   * Restores the files Claude changed since a message to how they were before it (Claude Code's file
   * checkpoints). `dryRun` only reports what would change. Starts Claude Code if it isn't running.
   */
  async rewindFiles(id: string, itemId: string, dryRun: boolean): Promise<RewindResult> {
    const live = await this.live(id);
    const item = live.state.items.find((i) => i.id === itemId);
    if (item?.kind !== "user" || !item.messageId)
      return {
        canRewind: false,
        error: "Jig has no checkpoint for this message (sent before checkpoints were on).",
      };
    const handoff = this.handoffAfter(live, live.state.items.indexOf(item));
    if (handoff)
      return {
        canRewind: false,
        error: `This message is from before the chat continued with ${NAME[handoff.to]}.`,
      };
    if (["working", "needs_you", "starting"].includes(live.state.meta.status))
      return { canRewind: false, error: "Wait until Jig has finished, or stop it first." };
    const result = await this.startEngine(live).rewindFiles(item.messageId, dryRun);
    if (!dryRun && result.canRewind) {
      const n = result.filesChanged?.length ?? 0;
      const notice: ChatItem = {
        kind: "notice",
        id: `rewind-${Date.now()}`,
        at: new Date().toISOString(),
        tone: "info",
        text: `Restored ${n} file${n === 1 ? "" : "s"} to how they were before “${summarize(item.text || "this message")}”.`,
      };
      live.state.items.push(notice);
      this.emit(live, [{ op: "upsert", item: notice }]);
      this.scheduleSave(live);
    }
    return result;
  }

  /**
   * Rewinds the conversation to before one of your messages (Claude Code's Esc Esc / rewind): the
   * transcript drops that message and everything after it, and the next message continues from the
   * turn before it. With `files`, the files Claude changed since then are restored too. Returns the
   * message's text, for the message box.
   */
  async rewind(id: string, itemId: string, files: boolean): Promise<{ text: string; files?: RewindResult }> {
    const live = await this.live(id);
    if (["working", "needs_you", "starting"].includes(live.state.meta.status))
      throw new JigError("invalid_args", "Wait until Jig has finished, or stop it first.");
    const index = live.state.items.findIndex((i) => i.id === itemId);
    const item = live.state.items[index];
    if (item?.kind !== "user") throw new JigError("not_found", "That message isn't in this chat");
    this.beforeHandoffCheck(live, index);
    this.friction(live, "rewind", files ? "rewound the chat and its files" : "rewound the chat");
    let restored: RewindResult | undefined;
    if (files) {
      restored = await this.rewindFiles(id, itemId, false);
      if (!restored.canRewind)
        throw new JigError("invalid_args", restored.error ?? "Can't restore the files");
    }
    const before = live.state.items.slice(0, index);
    const previous = [...before].reverse().find((i) => i.kind === "result" && i.chainUuid);
    const earlierMessage = before.some((i) => i.kind === "user");
    if (earlierMessage && previous?.kind !== "result")
      throw new JigError(
        "invalid_args",
        "This chat is too old to rewind (Jig didn't record where its turns end).",
      );
    this.stop(live);
    live.queue = [];
    const notice: ChatItem = {
      kind: "notice",
      id: `rewind-${Date.now()}`,
      at: new Date().toISOString(),
      tone: "info",
      text: `Rewound to before “${summarize(item.text || "your message")}”${restored ? `; ${restored.filesChanged?.length ?? 0} file(s) restored` : ""}. Jig doesn't remember what came after.`,
    };
    live.state.items = [...before, notice];
    live.state.meta = {
      ...live.state.meta,
      resumeAt: previous?.kind === "result" ? previous.chainUuid : undefined,
      resetPending: earlierMessage ? undefined : true,
      suggestion: undefined,
      updatedAt: new Date().toISOString(),
    };
    this.emit(live, [
      { op: "reset", items: live.state.items },
      { op: "queue", queue: live.queue },
      { op: "meta", meta: live.state.meta },
    ]);
    this.scheduleSave(live, true);
    return { text: item.text, ...(restored ? { files: restored } : {}) };
  }

  /** Runs a `!` command in the chat's folder; its output goes to Claude with your next message. */
  async runShell(id: string, command: string): Promise<void> {
    const live = await this.live(id);
    const run = this.options.runShell;
    if (!run) throw new JigError("invalid_args", "Shell commands aren't available here");
    const item: Extract<ChatItem, { kind: "shell" }> = {
      kind: "shell",
      id: `shell-${randomUUID()}`,
      at: new Date().toISOString(),
      command,
      output: "",
      status: "running",
    };
    live.state.items.push(item);
    this.emit(live, [{ op: "upsert", item }]);
    const result = await run(live.state.meta.cwd, command).catch((error: Error) => ({
      output: error.message,
      exitCode: 1,
    }));
    const done = { ...item, output: result.output, exitCode: result.exitCode, status: "done" as const };
    const at = live.state.items.findIndex((i) => i.id === item.id);
    if (at < 0) return;
    live.state.items[at] = done;
    this.emit(live, [{ op: "upsert", item: done }]);
    this.scheduleSave(live);
  }

  /** Claude Code's slash commands and skills for this chat (starts Claude Code if needed). */
  async commands(id: string): Promise<SlashCommandInfo[]> {
    const live = await this.live(id);
    const key = JSON.stringify([
      chatProvider(live.state.meta),
      live.state.meta.cwd,
      live.engine ? live.configurationKey : this.options.configurationKey?.(live.state.meta),
    ]);
    const cached = this.commandCache.get(key);
    if (cached && !live.engine) return cached;
    try {
      const list = await withTimeout(this.startEngine(live).commands(), 20_000);
      this.commandCache.set(key, list);
      return list;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  }

  /** The models the chat's provider offers (asked once per provider, then remembered). */
  async models(id: string): Promise<ModelInfo[]> {
    const live = await this.live(id);
    const provider = chatProvider(live.state.meta);
    const cached = this.modelCache.get(provider);
    if (cached) return cached;
    const list = await withTimeout(this.startEngine(live).models(), 20_000);
    this.modelCache.set(provider, list);
    return list;
  }

  async setEffort(id: string, effort: EffortLevel | undefined): Promise<void> {
    const live = await this.live(id);
    await live.engine?.setEffort(effort ?? null);
    this.setMeta(live, { effort });
  }

  /** Extra folders Claude may use; Claude Code restarts with them at the next message. */
  async setDirs(id: string, dirs: string[]): Promise<void> {
    const live = await this.live(id);
    if (["working", "needs_you", "starting"].includes(live.state.meta.status))
      throw new JigError("invalid_args", "Wait until Jig has finished, or stop it first.");
    this.stop(live);
    this.setMeta(live, { addDirs: dirs.length ? dirs : undefined });
  }

  async mcpStatus(id: string): Promise<McpServerInfo[]> {
    return withTimeout(this.startEngine(await this.live(id)).mcpStatus(), 30_000);
  }

  async mcpReconnect(id: string, name: string): Promise<void> {
    await this.startEngine(await this.live(id)).mcpReconnect(name);
  }

  async mcpToggle(id: string, name: string, enabled: boolean): Promise<void> {
    await this.startEngine(await this.live(id)).mcpToggle(name, enabled);
  }

  /** Moves running commands and subagents (or one) to the background, like Ctrl+B in Claude Code. */
  async background(id: string, toolUseId?: string): Promise<boolean> {
    const live = await this.live(id);
    return live.engine ? live.engine.background(toolUseId) : false;
  }

  /** Stops a background task; one Claude Code no longer runs (it ended, or its process did) just leaves the list. */
  async stopTask(id: string, taskId: string): Promise<void> {
    const live = await this.live(id);
    const forget = () => {
      const tasks = live.state.meta.backgroundTasks ?? [];
      if (tasks.some((t) => t.id === taskId))
        this.setMeta(live, { backgroundTasks: tasks.filter((t) => t.id !== taskId) });
    };
    if (!live.engine) return forget();
    try {
      await live.engine.stopTask(taskId);
    } catch {
      forget();
    }
  }

  /** Keeps a pasted, dropped or picked file for the next message of a session. */
  async addAttachment(
    id: string,
    input: { data?: string; mime?: string; name?: string; path?: string },
  ): Promise<ChatAttachment> {
    await this.live(id);
    return addAttachment(this.options.attachmentsDir, id, input);
  }

  /** Adds an item to a transcript (e.g. a build card in the chat that asked for it). */
  async addItem(id: string, item: ChatItem): Promise<void> {
    const live = await this.live(id);
    live.state.items.push(item);
    this.emit(live, [{ op: "upsert", item }]);
  }

  /** Replaces a transcript item by id (e.g. a change card after Undo). */
  async updateItem(id: string, item: ChatItem): Promise<void> {
    const live = await this.live(id);
    const index = live.state.items.findIndex((i) => i.id === item.id);
    if (index < 0) throw new JigError("not_found", "That message isn't in this chat");
    live.state.items[index] = item;
    this.emit(live, [{ op: "upsert", item }]);
    this.scheduleSave(live, true);
  }

  /**
   * Changes a queued or parked message before it is sent: its text, and with `attachments` its files
   * too (left out, it keeps them). It keeps its place in its list.
   */
  async editQueued(
    id: string,
    queuedId: string,
    text: string,
    attachments?: ChatAttachment[],
  ): Promise<void> {
    const live = await this.live(id);
    const list = live.queue.some((q) => q.id === queuedId) ? "queue" : "parked";
    const queued = live[list].find((q) => q.id === queuedId);
    if (!queued) throw new JigError("not_found", "That message has already been sent");
    const trimmed = text.trim();
    const files = attachments ?? queued.attachments ?? [];
    if (!trimmed && files.length === 0) throw new JigError("invalid_args", "The message is empty");
    const edited: QueuedMessage = {
      id: queued.id,
      text: trimmed,
      ...(files.length ? { attachments: files } : {}),
    };
    live[list] = live[list].map((q) => (q.id === queuedId ? edited : q));
    this.emitLists(live);
  }

  /** Removes a queued or a parked message. */
  async removeQueued(id: string, queuedId: string): Promise<void> {
    const live = await this.live(id);
    live.queue = live.queue.filter((q) => q.id !== queuedId);
    live.parked = live.parked.filter((q) => q.id !== queuedId);
    this.emitLists(live);
  }

  /**
   * Parks a message (D-365): it stays with the chat, saved, until you send or remove it; nothing sends
   * it by itself. With `queuedId`, that queued message moves to the end of the parked ones.
   */
  async park(id: string, text = "", attachments: ChatAttachment[] = [], queuedId?: string): Promise<void> {
    const live = await this.live(id);
    let message: QueuedMessage;
    if (queuedId) {
      const queued = live.queue.find((q) => q.id === queuedId);
      if (!queued) throw new JigError("not_found", "That message has already been sent");
      live.queue = live.queue.filter((q) => q.id !== queuedId);
      message = queued;
    } else {
      const trimmed = text.trim();
      if (!trimmed && attachments.length === 0) throw new JigError("invalid_args", "The message is empty");
      message = { id: randomUUID(), text: trimmed, ...(attachments.length ? { attachments } : {}) };
    }
    // A new chat holding only a parked message is kept, like one you've sent from.
    if (live.state.meta.draft) this.setMeta(live, { draft: false });
    live.parked = [...live.parked, message];
    this.emitLists(live);
    await this.scheduleSave(live, true);
  }

  /** Sends a parked message as `send` would: now, into the queue while busy, or into the running turn. */
  async sendParked(id: string, parkedId: string, now = false): Promise<void> {
    const live = await this.live(id);
    const parked = live.parked.find((q) => q.id === parkedId);
    if (!parked) throw new JigError("not_found", "That message has already been sent");
    live.parked = live.parked.filter((q) => q.id !== parkedId);
    this.emit(live, [{ op: "parked", parked: live.parked }]);
    try {
      await this.send(id, parked.text, parked.attachments ?? [], now);
    } catch (error) {
      // Not sent: it stays parked.
      if (!live.parked.some((q) => q.id === parkedId)) {
        live.parked = [parked, ...live.parked];
        this.emit(live, [{ op: "parked", parked: live.parked }]);
      }
      throw error;
    }
  }

  private emitLists(live: Live) {
    this.emit(live, [
      { op: "queue", queue: live.queue },
      { op: "parked", parked: live.parked },
    ]);
  }

  /** Replaces a transcript item (by id) and sends it. */
  private replaceItem(live: Live, item: ChatItem) {
    const index = live.state.items.findIndex((i) => i.id === item.id);
    if (index < 0) return;
    live.state.items[index] = item;
    this.emit(live, [{ op: "upsert", item }]);
  }

  /** The first handoff divider after an item: the chat continued with another provider since (D-338). */
  private handoffAfter(live: Live, index: number): Extract<ChatItem, { kind: "handoff" }> | undefined {
    return live.state.items
      .slice(index + 1)
      .find((i): i is Extract<ChatItem, { kind: "handoff" }> => i.kind === "handoff");
  }

  /** Rewinding goes back only as far as the last handoff: the provider before it has its own conversation. */
  private beforeHandoffCheck(live: Live, index: number) {
    const handoff = this.handoffAfter(live, index);
    if (handoff)
      throw new JigError(
        "invalid_args",
        `This message is from before the chat continued with ${NAME[handoff.to]}: rewind to one after that.`,
      );
  }

  /**
   * The chat's provider hit its plan limit (D-338; the card is the latest `limit` item). What happens
   * follows `engine.onLimit`: carry on with the other provider when it has room, wait for the reset,
   * or ask on the card. Builder chats only ask (they stay on Claude Code).
   */
  private limitHit(live: Live) {
    const card = [...live.state.items].reverse().find((i) => i.kind === "limit");
    if (card?.kind !== "limit") return;
    live.limited = true;
    const meta = live.state.meta;
    const provider = chatProvider(meta);
    const policy: LimitPolicy = meta.kind ? "ask" : (this.options.limitPolicy?.(meta) ?? "ask");
    const resetsAt = card.resetsAt ?? this.options.providerResetsAt?.(provider);
    // A reset already past is a stale meter: resuming at it would only hit the limit again.
    const ahead = resetsAt && new Date(resetsAt).getTime() > Date.now() ? resetsAt : undefined;
    const room = this.options.providerRoom?.(otherProvider(provider));
    let state: ChatLimit["state"] = "ask";
    if (policy === "switch" && room?.ok && this.options.engineFor) state = "continuing";
    else if (ahead) state = "waiting";
    // With `ask` the card still asks; nobody answering resumes the chat at the reset (D-376).
    const auto = state === "waiting" && policy === "ask";
    live.autoContinue = state === "continuing";
    this.replaceItem(live, {
      ...card,
      ...(resetsAt ? { resetsAt } : {}),
      status: state === "waiting" ? "waiting" : "open",
    });
    this.setMeta(live, {
      limit: {
        itemId: card.id,
        provider,
        state,
        ...(resetsAt ? { resetsAt } : {}),
        ...(auto ? { auto } : {}),
      },
    });
    if (state === "waiting") this.armWait(live);
  }

  /** Changes the open limit's state and its card. */
  private limitState(live: Live, state: ChatLimit["state"]) {
    const limit = live.state.meta.limit;
    if (!limit) return;
    const card = live.state.items.find((i) => i.id === limit.itemId);
    if (card?.kind === "limit")
      this.replaceItem(live, { ...card, status: state === "waiting" ? "waiting" : "open" });
    if (state !== "waiting") clearTimeout(live.limitTimer);
    // A choice of yours: the wait is no longer the one nobody answered (D-376).
    const { auto: _auto, ...chosen } = limit;
    this.setMeta(live, { limit: { ...chosen, state } });
    if (state === "waiting") this.armWait(live);
  }

  /**
   * After the computer slept (or the screen was locked): resumes the chats whose reset passed
   * meanwhile and sets the others' timers again from the clock, which a sleep can put off (D-376).
   */
  wake(now = Date.now()): void {
    for (const live of this.sessions.values()) {
      const limit = live.state.meta.limit;
      if (live.deleted || limit?.state !== "waiting" || !limit.resetsAt) continue;
      if (new Date(limit.resetsAt).getTime() + RESUME_GRACE_MS <= now) {
        clearTimeout(live.limitTimer);
        void this.resumeAfterLimit(live);
      } else this.armWait(live);
    }
  }

  /** Resumes the chat on its own provider shortly after its limit resets. */
  private armWait(live: Live) {
    clearTimeout(live.limitTimer);
    const resetsAt = live.state.meta.limit?.resetsAt;
    if (!resetsAt) return;
    const ms = new Date(resetsAt).getTime() + RESUME_GRACE_MS - Date.now();
    live.limitTimer = setTimeout(
      () => {
        if (ms > MAX_TIMER_MS) return this.armWait(live);
        void this.resumeAfterLimit(live);
      },
      Math.min(MAX_TIMER_MS, Math.max(1_000, ms)),
    );
    live.limitTimer.unref?.();
  }

  private async resumeAfterLimit(live: Live) {
    const limit = live.state.meta.limit;
    if (live.deleted || limit?.state !== "waiting") return;
    if (["working", "needs_you", "starting"].includes(live.state.meta.status)) return;
    const card = live.state.items.find((i) => i.id === limit.itemId);
    if (card?.kind === "limit") this.replaceItem(live, { ...card, status: "resumed" });
    live.state.meta = { ...live.state.meta, limit: undefined };
    await this.startTurn(
      live,
      RESUME_TEXT,
      [],
      `Resumed: ${NAME[limit.provider]}'s limit has reset`,
      "clock",
    );
  }

  /**
   * The chat carries on with another provider (D-338): the old one's process ends, a divider goes into
   * the transcript, the chat's provider, model and effort become the new one's, and its first message
   * brings the handoff Jig builds from the transcript. After a limit Jig sends that message itself.
   * The old provider's session is kept in `providers`; the new one starts its own.
   */
  private async continueWith(live: Live, to: ChatProvider, reason: ProviderSpan["reason"]) {
    const meta = live.state.meta;
    const from = chatProvider(meta);
    if (from === to) return;
    if (["working", "needs_you", "starting"].includes(meta.status))
      throw new JigError("invalid_args", "Wait until the chat has finished, or stop it first.");
    live.autoContinue = false;
    clearTimeout(live.limitTimer);
    this.stop(live);
    const at = new Date().toISOString();
    const limit = live.state.meta.limit;
    const card = limit && live.state.items.find((i) => i.id === limit.itemId);
    if (card?.kind === "limit") this.replaceItem(live, { ...card, status: "continued", to });
    const divider: ChatItem = { kind: "handoff", id: `handoff-${randomUUID()}`, at, from, to, reason };
    live.state.items.push(divider);
    this.emit(live, [{ op: "upsert", item: divider }]);
    const defaults = this.options.providerDefaults?.(meta, to) ?? {
      model: "",
      permissionMode: meta.permissionMode,
    };
    const span: ProviderSpan = {
      provider: from,
      ...(meta.engineSessionId ? { engineSessionId: meta.engineSessionId } : {}),
      model: meta.activeModel ?? meta.model,
      until: at,
      reason,
    };
    this.setMeta(live, {
      provider: to,
      providers: [...(meta.providers ?? []), span],
      handoffPending: { from, reason },
      model: defaults.model,
      effort: defaults.effort,
      permissionMode: defaults.permissionMode,
      engineSessionId: undefined,
      activeModel: undefined,
      authSource: "unknown",
      resumeAt: undefined,
      resetPending: undefined,
      forkPending: undefined,
      context: undefined,
      mcpServers: undefined,
      suggestion: undefined,
      limit: undefined,
      lastError: undefined,
      needsLogin: false,
      status: "idle",
    });
    this.scheduleSave(live, true);
    if (reason === "limit")
      await this.startTurn(
        live,
        CONTINUE_TEXT,
        [],
        `Continued with ${NAME[to]}: ${NAME[from]}'s limit is reached`,
        "arrow-right-left",
      );
  }

  /**
   * What handing the chat over to `to` would do (D-339), for the confirmation dialog: the same
   * settings `handOver` applies, so the dialog says exactly what happens.
   */
  async handOverPlan(id: string, to: ChatProvider): Promise<HandoverPlan> {
    const live = await this.live(id);
    const meta = live.state.meta;
    const from = chatProvider(meta);
    const after = this.options.providerDefaults?.(meta, to) ?? {
      model: "",
      permissionMode: meta.permissionMode,
    };
    return {
      from,
      to,
      before: {
        model: meta.activeModel ?? meta.model,
        effort: meta.effort,
        permissionMode: meta.permissionMode,
      },
      after,
      room: this.options.providerRoom?.(to) ?? { ok: true },
      messages: ownMessages(live.state.items).length,
      files: editedFiles(live.state.items).length,
      blocked: this.handOverBlocked(live, from, to),
    };
  }

  /** Why the chat can't be handed over now, or undefined when it can. */
  private handOverBlocked(live: Live, from: ChatProvider, to: ChatProvider): string | undefined {
    if (live.state.meta.kind) return "This chat stays on Claude Code";
    if (from === to) return `This chat already runs on ${NAME[to]}`;
    if (["working", "needs_you", "starting"].includes(live.state.meta.status))
      return `${NAME[from]} is working: hand over once this turn has finished`;
    return undefined;
  }

  /**
   * You hand the chat over to the other provider (D-339): the same handover as after a limit, but
   * nothing is sent; your next message brings the handoff. Only between turns.
   */
  async handOver(id: string, to: ChatProvider): Promise<SessionMeta> {
    const live = await this.live(id);
    const blocked = this.handOverBlocked(live, chatProvider(live.state.meta), to);
    if (blocked) throw new JigError(live.state.meta.kind ? "not_allowed" : "invalid_args", blocked);
    await this.continueWith(live, to, "manual");
    return live.state.meta;
  }

  /**
   * What you chose on a limit card (D-338): carry on with the other provider, wait for the reset and
   * resume, stop waiting (the card asks again), or dismiss it.
   */
  async limitAction(
    id: string,
    itemId: string,
    action: "continue" | "wait" | "cancel" | "dismiss",
  ): Promise<void> {
    const live = await this.live(id);
    const limit = live.state.meta.limit;
    if (!limit || limit.itemId !== itemId) throw new JigError("not_found", "This limit is no longer current");
    if (action === "continue") {
      if (live.state.meta.kind) throw new JigError("not_allowed", "This chat stays on Claude Code");
      const to = otherProvider(limit.provider);
      const room = this.options.providerRoom?.(to);
      if (room && !room.ok) throw new JigError("unavailable", room.reason ?? `${NAME[to]} has no room now`);
      return this.continueWith(live, to, "limit");
    }
    if (action === "wait") {
      if (!limit.resetsAt)
        throw new JigError("invalid_args", `${NAME[limit.provider]} didn't say when it resets`);
      return this.limitState(live, "waiting");
    }
    if (action === "cancel") return this.limitState(live, "ask");
    clearTimeout(live.limitTimer);
    const card = live.state.items.find((i) => i.id === itemId);
    if (card?.kind === "limit") this.replaceItem(live, { ...card, status: "dismissed" });
    live.limited = false;
    this.setMeta(live, { limit: undefined });
  }

  /** Friction for the learning log (no AI): what made a chat harder. */
  private friction(live: Live, signal: string, text: string) {
    this.options.onActivity?.({ kind: "friction", session: live.state.meta, text, signal });
  }

  async interrupt(id: string): Promise<void> {
    const live = await this.live(id);
    // Stopped while its turn is still being put together (add-ons' context, the engine starting):
    // stop that turn once it has been sent, rather than not at all.
    if (!live.engine && live.starting) await live.starting;
    if (!live.engine) return;
    if (live.state.meta.status === "working") this.friction(live, "interrupt", "stopped Jig mid-turn");
    abortJigToolCalls(id);
    await live.engine.interrupt().catch((error) => log.warn("Interrupt failed", error));
  }

  async answerPermission(id: string, requestId: string, decision: PermissionDecision): Promise<void> {
    const live = await this.live(id);
    const pending = live.permissions.get(requestId);
    if (!pending) throw new JigError("not_found", "This request is no longer waiting");
    live.permissions.delete(requestId);
    clearTimeout(pending.timer);
    const status = decision.behavior === "deny" ? "denied" : decision.always ? "always" : "allowed";
    if (status === "denied") this.friction(live, "denied", `denied ${pending.request.toolName}`);
    this.handleEvent(live, { type: "permission_resolved", requestId, status });
    pending.resolve(decision);
  }

  async setModel(id: string, model: string): Promise<void> {
    const live = await this.live(id);
    await live.engine?.setModel(model);
    this.setMeta(live, { model });
  }

  /**
   * Another provider for a chat that hasn't started (D-314), with that provider's model and effort.
   * A chat that has sent a message changes provider through a handover instead (`handOver`, D-339).
   */
  async setProvider(
    id: string,
    provider: ChatProvider,
    defaults: { model: string; effort?: EffortLevel; permissionMode: PermissionMode },
  ): Promise<SessionMeta> {
    const live = await this.live(id);
    const meta = live.state.meta;
    if (chatProvider(meta) === provider) return meta;
    if (
      meta.kind ||
      meta.turns > 0 ||
      meta.engineSessionId ||
      live.state.items.length > 0 ||
      live.queue.length > 0
    )
      throw new JigError("not_allowed", "A chat keeps the provider it started with");
    // A model list may have started the old provider's engine: it goes, the next message starts the new one.
    this.stop(live);
    this.setMeta(live, { provider, ...defaults, activeModel: undefined });
    return live.state.meta;
  }

  async setPermissionMode(id: string, permissionMode: PermissionMode): Promise<void> {
    const live = await this.live(id);
    await live.engine?.setPermissionMode(permissionMode);
    this.setMeta(live, { permissionMode });
  }

  async rename(id: string, title: string): Promise<void> {
    const live = await this.live(id);
    if (!title.trim()) throw new JigError("invalid_args", "A session needs a title");
    this.setMeta(live, { title: title.trim() });
  }

  /** Puts a chat in a project, moves it, or takes it out (`undefined`). */
  async setProject(id: string, projectId: string | undefined): Promise<void> {
    const live = await this.live(id);
    this.setMeta(live, { projectId });
  }

  /**
   * A chat nobody has written in yet goes to another project as if it had been started there (D-341):
   * its folder, provider, model, effort and permission mode become the new project's. Once its first
   * message is sent it stays where it is (`not_allowed`); `setProject` still files it elsewhere.
   */
  async switchProject(
    id: string,
    target: {
      projectId: string;
      cwd: string;
      provider: ChatProvider;
      model: string;
      effort?: EffortLevel;
      permissionMode: PermissionMode;
    },
  ): Promise<SessionMeta> {
    const live = await this.live(id);
    const meta = live.state.meta;
    if (
      !meta.draft ||
      meta.kind ||
      meta.turns > 0 ||
      meta.engineSessionId ||
      live.state.items.length > 0 ||
      live.queue.length > 0
    )
      throw new JigError("not_allowed", "A chat stays in its project once its first message is sent");
    if (meta.projectId === target.projectId) return meta;
    // A model list may have started an engine in the old folder: it goes, the first message starts anew.
    this.stop(live);
    this.setMeta(live, { ...target, effort: target.effort, activeModel: undefined });
    return live.state.meta;
  }

  async setPinned(id: string, pinned: boolean): Promise<void> {
    const live = await this.live(id);
    this.setMeta(live, { pinned: pinned || undefined });
  }

  async setVoice(id: string, voice: boolean): Promise<void> {
    const live = await this.live(id);
    this.setMeta(live, { voice: voice || undefined });
  }

  /** A project was removed: its chats move to "No project". */
  async leaveProject(projectId: string): Promise<void> {
    await this.load();
    for (const live of this.sessions.values())
      if (live.state.meta.projectId === projectId) this.setMeta(live, { projectId: undefined });
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    const live = await this.live(id);
    if (archived) this.stop(live);
    this.setMeta(live, { archived });
    if (archived) this.options.onClosed?.(id);
  }

  /** Looks at idle chats every minute while any process runs (the timer never keeps Jig alive). */
  private armIdleSweep() {
    if (this.idleSweep) return;
    this.idleSweep = setInterval(() => void this.sweepIdle(), IDLE_SWEEP_MS);
    this.idleSweep.unref?.();
  }

  /**
   * Stops the processes of chats idle for `engine.idleStopMinutes` (D-367): no turn running or
   * starting, nothing waiting for you, no background task, no queued message, nothing outside counting
   * on it (`keepAwake`). The chat doesn't change: its next message, or anything else that needs the
   * process, resumes the same conversation. Returns how many it stopped.
   */
  async sweepIdle(now = Date.now()): Promise<number> {
    const minutes = this.options.engineSettings().idleStopMinutes ?? IDLE_STOP_MINUTES;
    let stopped = 0;
    let running = 0;
    for (const live of [...this.sessions.values()]) {
      if (!live.engine) continue;
      running++;
      if (minutes <= 0 || now - (live.lastActive ?? now) < minutes * 60_000 || !this.isIdle(live)) continue;
      const kept = await Promise.resolve(this.options.keepAwake?.(live.state.meta)).catch(() => true);
      // Something may have started while the check ran.
      if (kept || !this.isIdle(live) || now - (live.lastActive ?? now) < minutes * 60_000) continue;
      this.sleep(live);
      stopped++;
    }
    if (running === stopped) {
      clearInterval(this.idleSweep);
      this.idleSweep = undefined;
    }
    return stopped;
  }

  /** Nothing runs in or waits on the chat's process. */
  private isIdle(live: Live): boolean {
    const meta = live.state.meta;
    return (
      (meta.status === "idle" || meta.status === "error") &&
      !live.starting &&
      !live.autoContinue &&
      live.permissions.size === 0 &&
      live.queue.length === 0 &&
      !meta.backgroundTasks?.length
    );
  }

  /**
   * Ends an idle chat's process quietly: unlike `stop` it is no turn ending (no exit event, no
   * `onTurnEnd`, the status stays), so nothing following the chat (the task queue) reacts to it.
   */
  private sleep(live: Live) {
    const engine = live.engine;
    if (!engine) return;
    live.engine = undefined;
    live.engineToken = undefined;
    engine.close();
    log.info(`Stopped the idle process of chat ${live.state.meta.id}`);
    // The next process starts with the tenant active then.
    if (live.state.meta.azureTenant) {
      live.state.meta = { ...live.state.meta, azureTenant: undefined };
      this.emit(live, [{ op: "meta", meta: live.state.meta }]);
    }
  }

  /** Ends the Claude Code process (the conversation can continue later; it resumes). */
  async stopProcess(id: string): Promise<void> {
    this.stop(await this.live(id));
  }

  /** Ends the Claude Code process now: its pending prompts are cancelled and the turn ends here. */
  private stop(live: Live) {
    if (!live.engine) return;
    const engine = live.engine;
    abortJigToolCalls(live.state.meta.id);
    this.handleEvent(live, { type: "exit" });
    live.engineToken = undefined;
    engine.close();
  }

  async delete(id: string): Promise<void> {
    const live = await this.live(id);
    live.deleted = true;
    clearTimeout(live.limitTimer);
    this.stop(live);
    clearTimeout(live.saveTimer);
    this.sessions.delete(id);
    await live.saving;
    await rm(this.file(id), { force: true });
    await removeAttachments(this.options.attachmentsDir, id).catch(() => {});
    this.options.onClosed?.(id);
  }

  /** Ends every Claude Code process and writes what isn't saved yet (app quit). */
  async shutdown(): Promise<void> {
    clearInterval(this.idleSweep);
    this.idleSweep = undefined;
    const writes: Array<Promise<void> | undefined> = [];
    for (const live of this.sessions.values()) {
      clearTimeout(live.limitTimer);
      const unsaved = Boolean(live.saveTimer) || Boolean(live.engine);
      // A turn still going is cut off: saved with the chat, so the task queue carries on with it (D-394).
      if (BUSY.includes(live.state.meta.status))
        live.state.meta = { ...live.state.meta, cutOffAt: new Date().toISOString() };
      this.stop(live);
      writes.push(live.saving);
      if (unsaved || live.saveTimer) writes.push(this.scheduleSave(live, true));
    }
    await Promise.all(writes);
  }

  runningCount(): number {
    return [...this.sessions.values()].filter((l) => l.engine).length;
  }
}

/** A `!` command as Claude Code puts it in the conversation. */
export function shellContext(shell: { command: string; output: string; exitCode?: number }): string {
  return `<bash-input>${shell.command}</bash-input>\n<bash-stdout>${shell.output}</bash-stdout>${
    shell.exitCode ? `\n<bash-stderr>Exit code ${shell.exitCode}</bash-stderr>` : ""
  }`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new JigError("unavailable", "Claude Code didn't answer in time")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** A short title from the first message. */
export function summarize(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line || "New chat";
}

/** A model's chat name as a title: its first line, without quotes, a "Title:" label or a full stop. */
export function cleanTitle(answer: string): string {
  const line = (answer.split("\n").find((l) => l.trim()) ?? "")
    .replace(/^\s*(title|name)\s*:\s*/i, "")
    .replace(/^[\s"'`*#]+|[\s"'`*.]+$/g, "")
    .replace(/\s+/g, " ");
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line;
}
