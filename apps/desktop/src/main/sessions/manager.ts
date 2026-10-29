import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type ChatState, reduceEvent } from "../../shared/chat";
import type {
  ChatAttachment,
  ChatItem,
  ChatUpdate,
  EffortLevel,
  EngineEvent,
  McpServerInfo,
  ModelInfo,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  QueuedMessage,
  RewindResult,
  SessionMeta,
  SessionSnapshot,
  SlashCommandInfo,
} from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import type { Engine, EngineSession, ToolOutput } from "../engine/types";
import { logger } from "../log";
import { readJson, writeJson } from "../state/jsonStore";
import {
  addAttachment,
  type EnginePart,
  readAttachments,
  removeAttachments,
  saveToolImages,
} from "./attachments";

const log = logger("sessions");

/** Most transcript items kept in the cache file (Claude Code keeps the full history itself). */
const MAX_ITEMS = 3000;
/** Longest time unsaved changes wait while a turn streams. */
const SAVE_MAX_WAIT_MS = 2000;

const SessionFileSchema = z.object({
  meta: z.custom<SessionMeta>((v) => typeof v === "object" && v !== null && "id" in v),
  items: z.array(z.custom<ChatItem>()).default([]),
  queue: z
    .array(
      z.object({
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
      }),
    )
    .default([]),
});

export interface SessionManagerOptions {
  dir: string;
  /** Images sent in chats (`~/.jig/attachments`). */
  attachmentsDir: string;
  engine: Engine;
  /** Settings at the time a Claude Code process starts. */
  engineSettings: () => {
    claudePath: string;
    allowApiKey: boolean;
    env: Record<string, string | undefined>;
    promptSuggestions?: boolean;
    fileCheckpoints?: boolean;
  };
  appendSystemPrompt: (meta: SessionMeta) => string;
  mcpServers?: (meta: SessionMeta) => Record<string, unknown> | undefined;
  agents?: (meta: SessionMeta) => Record<string, unknown> | undefined;
  toolHandlers?: (
    meta: SessionMeta,
  ) => Record<string, (args: Record<string, unknown>) => Promise<ToolOutput>> | undefined;
  /** Claude Code reported plan rate-limit state (the usage meter refreshes). */
  onRateLimit?: (event: Extract<EngineEvent, { type: "rate_limit" }>) => void;
  /** A turn ended (result or process exit), e.g. to notice a builder that stopped. */
  onTurnEnd?: (meta: SessionMeta) => void;
  onUpdate: (sessionId: string, updates: ChatUpdate[]) => void;
  /** Runs a shell command you typed with `!` in the chat's folder. */
  runShell?: (cwd: string, command: string) => Promise<{ output: string; exitCode: number }>;
  /** Activity for the learning log (phase 9): prompts and tool calls. */
  onActivity?: (event: {
    kind: "prompt" | "tool" | "friction";
    session: SessionMeta;
    text: string;
    tool?: string;
    /** The tool's input (to record the lines Claude writes). */
    input?: Record<string, unknown>;
    /** Friction (Learning 2): interrupt, rewind, denied, tool-errors. */
    signal?: string;
  }) => void;
}

interface Live {
  state: ChatState;
  queue: QueuedMessage[];
  engine?: EngineSession;
  permissions: Map<string, { resolve: (d: PermissionDecision) => void; request: PermissionRequest }>;
  saveTimer?: NodeJS.Timeout;
  loaded: boolean;
  /** Identifies the current Claude Code process: events from a stopped or replaced one are ignored. */
  engineToken?: object;
  /** Deleted: nothing is emitted or saved for it any more (a late event can't bring it back). */
  deleted?: boolean;
  lastSave?: number;
  saving?: Promise<void>;
  /** Failed tool calls in the current turn (friction when it reaches 3). */
  toolErrors?: number;
}

/**
 * Owns every chat session: metadata and a transcript cache in `~/.jig/sessions/<id>.json`, one Claude
 * Code process per session while it is in use (started on the first message, resumed with Claude
 * Code's own session id after a restart), the follow-up queue and permission prompts.
 */
export class SessionManager {
  private sessions = new Map<string, Live>();
  private ready: Promise<void> | undefined;
  /** Slash commands and skills by folder, and the model list, from the last Claude Code that told us. */
  private commandCache = new Map<string, SlashCommandInfo[]>();
  private modelCache: ModelInfo[] | undefined;

  constructor(private readonly options: SessionManagerOptions) {}

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
          // A process can't survive a restart: anything "working" is idle now.
          const status = data.meta.status === "error" ? "error" : "idle";
          this.sessions.set(data.meta.id, {
            state: { meta: { ...data.meta, status }, items: data.items },
            queue: data.queue,
            permissions: new Map(),
            loaded: true,
          });
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
    if (live.deleted) return undefined;
    clearTimeout(live.saveTimer);
    live.saveTimer = undefined;
    const save = () => {
      if (live.deleted) return Promise.resolve();
      live.lastSave = Date.now();
      live.saving = writeJson(this.file(live.state.meta.id), {
        meta: live.state.meta,
        items: live.state.items.slice(-MAX_ITEMS),
        queue: live.queue,
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
    kind?: SessionMeta["kind"];
    buildId?: string;
    effort?: SessionMeta["effort"];
  }): Promise<SessionMeta> {
    await this.load();
    const at = new Date().toISOString();
    const meta: SessionMeta = {
      id: randomUUID(),
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
    const live: Live = { state: { meta, items: [] }, queue: [], permissions: new Map(), loaded: true };
    this.sessions.set(meta.id, live);
    this.scheduleSave(live, true);
    this.options.onUpdate(meta.id, [{ op: "meta", meta }]);
    return meta;
  }

  async snapshot(id: string): Promise<SessionSnapshot> {
    const live = await this.live(id);
    return { meta: live.state.meta, items: live.state.items, queue: live.queue };
  }

  private startEngine(live: Live): EngineSession {
    if (live.engine) return live.engine;
    const token = {};
    live.engineToken = token;
    const meta = live.state.meta;
    const settings = this.options.engineSettings();
    const session = this.options.engine.start(
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
        promptSuggestions: settings.promptSuggestions,
        forkSession: meta.forkPending,
        fileCheckpoints: settings.fileCheckpoints,
        mcpServers: this.options.mcpServers?.(meta),
        agents: this.options.agents?.(meta),
        toolHandlers: this.options.toolHandlers?.(meta),
        askPermission: (request, signal) =>
          new Promise<PermissionDecision>((resolve) => {
            live.permissions.set(request.requestId, { resolve, request });
            this.handleEvent(live, { type: "permission", request });
            signal.addEventListener("abort", () => {
              if (!live.permissions.delete(request.requestId)) return;
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
      this.commandCache.set(live.state.meta.cwd, event.commands);
      return;
    }
    if (event.type === "exit") {
      live.engine = undefined;
      for (const [requestId, pending] of live.permissions) {
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
    // A fork has its own Claude Code session id from its first start on.
    if (event.type === "init" && live.state.meta.forkPending) this.setMeta(live, { forkPending: undefined });
    if (event.type === "result" || event.type === "exit") this.options.onTurnEnd?.(live.state.meta);
    if (event.type === "result") {
      this.scheduleSave(live, true);
      void this.refreshContext(live);
      const next = live.queue.shift();
      if (next) {
        this.emit(live, [{ op: "queue", queue: live.queue }]);
        void this.startTurn(live, next.text, next.attachments);
      }
    }
  }

  /** Asks Claude Code how full the context window is and keeps it on the session. */
  private async refreshContext(live: Live) {
    const context = await live.engine?.contextUsage().catch(() => undefined);
    if (!context) return;
    live.state.meta = { ...live.state.meta, context };
    this.emit(live, [{ op: "meta", meta: live.state.meta }]);
    this.scheduleSave(live);
  }

  private async startTurn(live: Live, text: string, attachments: ChatAttachment[] = []) {
    // Busy from now on, before any await: a second send right away is queued, not started twice.
    live.state.meta = { ...live.state.meta, status: "starting" };
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
    };
    const updates: ChatUpdate[] = [{ op: "upsert", item }];
    live.state.items.push(item);
    const meta = live.state.meta;
    const title =
      meta.turns === 0 && (meta.title === "New chat" || meta.title === "New session")
        ? summarize(text || attachments[0]?.name || "Attachment")
        : meta.title;
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
    this.options.onActivity?.({ kind: "prompt", session: live.state.meta, text });
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
    const withShell = shells.length ? `${shells.map(shellContext).join("\n")}\n\n${text}` : text;
    try {
      const messageId = this.startEngine(live).send(withShell, data);
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
    const busy = ["working", "needs_you", "starting"].includes(live.state.meta.status);
    if (busy && now && live.engine && attachments.length === 0) {
      const item: ChatItem = {
        kind: "user",
        id: `user-${randomUUID()}`,
        text: trimmed,
        at: new Date().toISOString(),
      };
      live.state.items.push(item);
      this.emit(live, [{ op: "upsert", item }]);
      const messageId = live.engine.send(trimmed, [], "next");
      const sent = { ...item, messageId };
      live.state.items[live.state.items.indexOf(item)] = sent;
      this.emit(live, [{ op: "upsert", item: sent }]);
      return;
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
      forkPending: true,
      turns: source.meta.turns,
      context: source.meta.context,
    });
    this.scheduleSave(live, true);
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
    if (["working", "needs_you", "starting"].includes(live.state.meta.status))
      return { canRewind: false, error: "Wait until Claude has finished, or stop it first." };
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
      throw new JigError("invalid_args", "Wait until Claude has finished, or stop it first.");
    const index = live.state.items.findIndex((i) => i.id === itemId);
    const item = live.state.items[index];
    if (item?.kind !== "user") throw new JigError("not_found", "That message isn't in this chat");
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
      text: `Rewound to before “${summarize(item.text || "your message")}”${restored ? `; ${restored.filesChanged?.length ?? 0} file(s) restored` : ""}. Claude doesn't remember what came after.`,
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
    const cached = this.commandCache.get(live.state.meta.cwd);
    if (cached && !live.engine) return cached;
    try {
      const list = await withTimeout(this.startEngine(live).commands(), 20_000);
      this.commandCache.set(live.state.meta.cwd, list);
      return list;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  }

  /** The models Claude Code offers (asked once, then remembered). */
  async models(id: string): Promise<ModelInfo[]> {
    if (this.modelCache) return this.modelCache;
    const live = await this.live(id);
    this.modelCache = await withTimeout(this.startEngine(live).models(), 20_000);
    return this.modelCache;
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
      throw new JigError("invalid_args", "Wait until Claude has finished, or stop it first.");
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

  async stopTask(id: string, taskId: string): Promise<void> {
    const live = await this.live(id);
    await live.engine?.stopTask(taskId);
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

  async removeQueued(id: string, queuedId: string): Promise<void> {
    const live = await this.live(id);
    live.queue = live.queue.filter((q) => q.id !== queuedId);
    this.emit(live, [{ op: "queue", queue: live.queue }]);
  }

  /** Friction for the learning log (no AI): what made a chat harder. */
  private friction(live: Live, signal: string, text: string) {
    this.options.onActivity?.({ kind: "friction", session: live.state.meta, text, signal });
  }

  async interrupt(id: string): Promise<void> {
    const live = await this.live(id);
    if (!live.engine) return;
    if (live.state.meta.status === "working") this.friction(live, "interrupt", "stopped Claude mid-turn");
    await live.engine.interrupt().catch((error) => log.warn("Interrupt failed", error));
  }

  async answerPermission(id: string, requestId: string, decision: PermissionDecision): Promise<void> {
    const live = await this.live(id);
    const pending = live.permissions.get(requestId);
    if (!pending) throw new JigError("not_found", "This request is no longer waiting");
    live.permissions.delete(requestId);
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

  async setPinned(id: string, pinned: boolean): Promise<void> {
    const live = await this.live(id);
    this.setMeta(live, { pinned: pinned || undefined });
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
  }

  /** Ends the Claude Code process (the conversation can continue later; it resumes). */
  async stopProcess(id: string): Promise<void> {
    this.stop(await this.live(id));
  }

  /** Ends the Claude Code process now: its pending prompts are cancelled and the turn ends here. */
  private stop(live: Live) {
    if (!live.engine) return;
    const engine = live.engine;
    this.handleEvent(live, { type: "exit" });
    live.engineToken = undefined;
    engine.close();
  }

  async delete(id: string): Promise<void> {
    const live = await this.live(id);
    live.deleted = true;
    this.stop(live);
    clearTimeout(live.saveTimer);
    this.sessions.delete(id);
    await live.saving;
    await rm(this.file(id), { force: true });
    await removeAttachments(this.options.attachmentsDir, id).catch(() => {});
  }

  /** Ends every Claude Code process and writes what isn't saved yet (app quit). */
  async shutdown(): Promise<void> {
    const writes: Array<Promise<void> | undefined> = [];
    for (const live of this.sessions.values()) {
      const unsaved = Boolean(live.saveTimer) || Boolean(live.engine);
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
