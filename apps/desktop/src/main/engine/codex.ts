import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import {
  ENGINE_CAPABILITIES,
  type EngineEvent,
  type ModelInfo,
  type PermissionMode,
  type SavedClaudeMessage,
  type SavedClaudeSession,
  type SavedToolUse,
} from "../../shared/engine";
import { resolveChatGptModel } from "../../shared/providers";
import type { RawUsage } from "../../shared/usage";
import { resolveCommand } from "../addons/winCommand";
import { logger } from "../log";
import { findCodex } from "../providers/codex";
import { makeWhich } from "../terminals/shell";
import { isReadOnlyChatTool } from "./chatTools";
import type {
  AskForApproval,
  CommandExecutionApprovalDecision,
  FileChangeApprovalDecision,
  Model,
  ModelListResponse,
  SandboxMode,
  SandboxPolicy,
  SkillsListResponse,
  ThreadForkParams,
  ThreadListParams,
  ThreadListResponse,
  ThreadReadParams,
  ThreadReadResponse,
  ThreadResumeParams,
  ThreadStartParams,
  ThreadStartResponse,
  TurnStartParams,
  TurnStartResponse,
  UserInput,
} from "./codex-protocol/v2";
import { CODEX_PROTOCOL_VERSION } from "./codex-protocol/version";
import { savedThread, threadMessages } from "./codexHistory";
import { personalInstructions } from "./codexInstructions";
import { jigMcpConfig } from "./codexMcp";
import { CodexNormalizer, mcpToolApproval } from "./codexNormalize";
import { claudeSkillFolders, missingSkills } from "./codexSkills";
import {
  JIG_ADDED_TEXT,
  PLAN_APPROVED_PROMPT,
  PLAN_MODE_PROMPT,
  STAND_IN_INSTRUCTIONS,
  standInTools,
  withStandIns,
} from "./codexTools";
import { type LocalMcp, newMcpToken, startLocalMcp } from "./localMcp";
import { projectMcpConfig } from "./projectMcp";
import {
  type Completer,
  codexSessionEnv,
  type Engine,
  type EngineSession,
  type OneShotOptions,
  type StartOptions,
  type ToolCallOptions,
} from "./types";

const log = logger("engine");

/**
 * How each permission mode runs in Codex (D-311, D-315).
 * - plan (Plan only): read-only sandbox; Jig declines anything that writes or leaves it, and each turn
 *   tells Codex to plan and present it with Jig's exit_plan tool (`PLAN_MODE_PROMPT`).
 * - default (Ask before changes): workspace-write sandbox with `untrusted` approvals: Codex asks
 *   before every file change and every command it doesn't know to only read, and what you approve can
 *   write in the project. (A read-only sandbox with `on-request` left it to the model to ask, and on
 *   Windows it often reported the sandbox's "access denied" instead; an approved command still ran
 *   read-only. Checked with Codex 0.166.0, D-315.)
 * - acceptEdits: workspace-write sandbox, file changes it still asks about are accepted.
 * - bypassPermissions (Don't ask): workspace-write with network, Codex never asks.
 */
export function codexPolicy(
  mode: PermissionMode,
  extraRoots: string[] = [],
): { approvalPolicy: AskForApproval; sandbox: SandboxMode; sandboxPolicy: SandboxPolicy } {
  if (mode !== "plan")
    return {
      approvalPolicy:
        mode === "bypassPermissions" ? "never" : mode === "default" ? "untrusted" : "on-request",
      sandbox: "workspace-write",
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: extraRoots,
        networkAccess: mode === "bypassPermissions",
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
    };
  return {
    approvalPolicy: "on-request",
    sandbox: "read-only",
    sandboxPolicy: { type: "readOnly", networkAccess: false },
  };
}

/** Codex's models (`model/list`) in Jig's shape, with their reasoning levels. */
export function modelsFrom(list: readonly Model[]): ModelInfo[] {
  return list
    .filter((m) => !m.hidden)
    .map((m) => ({
      value: m.model,
      displayName: m.displayName || m.model,
      description: m.description,
      ...(m.supportedReasoningEfforts?.length
        ? { efforts: m.supportedReasoningEfforts.map((e) => e.reasoningEffort) as ModelInfo["efforts"] }
        : {}),
    }));
}

/** The Codex version in app-server's user agent (`jig/0.166.0 (Windows …)`). */
export function versionFromUserAgent(userAgent: unknown): string | undefined {
  return typeof userAgent === "string" ? /\/(\d+\.\d+\.\d+[\w.-]*)/.exec(userAgent)?.[1] : undefined;
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

/**
 * `codex app-server` over stdio: JSON-RPC, one message per line. Requests get numbered ids;
 * notifications and Codex's own requests (approvals) go to the handlers.
 */
class CodexRpc {
  private readonly child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private stderr = "";
  closed = false;

  constructor(
    binary: string,
    cwd: string,
    env: Record<string, string | undefined>,
    handlers: {
      notification: (message: { method: string; params?: unknown }) => void;
      request: (message: { id: string | number; method: string; params?: unknown }) => void;
      exit: (error: string | undefined) => void;
    },
  ) {
    const r = resolveCommand(binary, ["app-server"], process.platform, env as NodeJS.ProcessEnv);
    this.child = spawn(r.file, r.args, {
      cwd,
      env: env as NodeJS.ProcessEnv,
      windowsHide: true,
      windowsVerbatimArguments: r.verbatim,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdin.on("error", () => {});
    this.child.stderr.on("data", (d: Buffer) => {
      // Codex logs to stderr; keep the tail for an error message and the debug log.
      const text = d.toString("utf8");
      this.stderr = (this.stderr + text).slice(-4000);
      log.debug(`codex stderr: ${text.trimEnd()}`);
    });
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      if (!line.trim().startsWith("{")) return;
      let message: {
        id?: string | number;
        method?: string;
        params?: unknown;
        result?: unknown;
        error?: { message?: unknown };
      };
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      try {
        if (message.method && message.id !== undefined)
          handlers.request(message as { id: string | number; method: string });
        else if (message.method) handlers.notification(message as { method: string });
        else if (typeof message.id === "number") {
          const p = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error)
            p?.reject(new Error(String(message.error.message ?? "Codex refused the request")));
          else p?.resolve(message.result);
        }
      } catch (error) {
        log.warn("Codex message handling failed", error);
      }
    });
    let ended = false;
    const end = (error: string | undefined) => {
      if (ended) return;
      ended = true;
      this.closed = true;
      for (const p of this.pending.values()) p.reject(new Error(error ?? "Codex stopped"));
      this.pending.clear();
      handlers.exit(error);
    };
    this.child.on("error", (error) => end(`Codex could not be started (${error.message})`));
    this.child.on("exit", (code) => {
      const tail = this.stderr.trim().split(/\r?\n/).pop();
      end(code && !this.closed ? `Codex stopped (exit code ${code})${tail ? `: ${tail}` : ""}` : undefined);
    });
  }

  request<T>(method: string, params: unknown): Promise<T> {
    if (this.closed) return Promise.reject(new Error("Codex isn't running"));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.write({ id, method, params });
    });
  }

  notify(method: string, params?: unknown): void {
    this.write(params === undefined ? { method } : { method, params });
  }

  respond(id: string | number, result: unknown): void {
    this.write({ id, result });
  }

  fail(id: string | number, message: string): void {
    this.write({ id, error: { code: -32601, message } });
  }

  private write(message: unknown) {
    if (this.closed) return;
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  kill(): void {
    this.closed = true;
    try {
      this.child.stdin.end();
    } catch {
      // Already closed.
    }
    this.child.kill();
  }

  /** initialize + initialized; resolves with Codex's version. */
  async initialize(): Promise<string | undefined> {
    const result = await this.request<{ userAgent?: string }>("initialize", {
      clientInfo: { name: "jig", title: "Jig", version: process.env.npm_package_version ?? "0.0.0" },
      capabilities: { experimentalApi: false, requestAttestation: false },
    });
    this.notify("initialized");
    return versionFromUserAgent(result?.userAgent);
  }
}

/** The Codex CLI to run: the user's own (`engine.codexPath`), else the one on PATH. */
function codexBinary(own: string | undefined, env: Record<string, string | undefined>): string | undefined {
  if (own?.trim()) return own.trim();
  return findCodex({
    platform: process.platform,
    arch: process.arch,
    which: makeWhich(env as NodeJS.ProcessEnv),
    exists: existsSync,
  });
}

const NO_CODEX = "The Codex CLI isn't installed. See Get started → ChatGPT (Codex).";

/**
 * OpenAI's Codex as a chat engine (D-309, D-311): one `codex app-server` process per chat, one
 * thread in it. Codex signs in on its own (`codex login`, ChatGPT); Jig never touches its
 * credentials. Codex reads its own config, AGENTS.md files, skills and MCP servers as in the CLI;
 * Jig's context and your personal instructions go in as developer instructions (D-312).
 * Non-chat calls (one-shots, usage) go through main/providers, not this engine.
 */
export class CodexEngine implements Engine {
  readonly kind = "codex" as const;
  readonly provider = "codex" as const;
  readonly capabilities = ENGINE_CAPABILITIES.codex;

  start(options: StartOptions, onEvent: (event: EngineEvent) => void): EngineSession {
    const normalizer = new CodexNormalizer();
    /** Aborted when a turn ends or the chat closes: a stand-in's card waiting for you goes away. */
    let turnAbort = new AbortController();
    const endTurn = () => {
      turnAbort.abort();
      turnAbort = new AbortController();
    };
    /** The plan was approved during this turn: when it ends, the next one carries it out (D-315). */
    let carryOutPlan = false;
    /** The planning turn's result, added to the next turn's so the chat shows one turn. */
    let heldResult: ResultEvent | undefined;
    /** For the next-message suggestion: your last message, Codex's last reply, and turns so far. */
    let lastMessage = "";
    let lastReply = "";
    let turns = 0;
    /** After a turn that ended well: a suggested next message, unless another turn started (D-315). */
    const suggest = () => {
      const turn = ++turns;
      if (!options.promptSuggestions || !options.suggestNext || !lastMessage || !lastReply) return;
      void options
        .suggestNext({ message: lastMessage, reply: lastReply })
        .then((text) => {
          if (text && turn === turns && !ended) onEvent({ type: "suggestion", text });
        })
        .catch((error: Error) => log.debug(`No suggestion for a Codex chat: ${error.message}`));
    };
    // Jig's tools reach Codex over a local MCP server with this chat's own token (D-313), with the
    // stand-ins for Claude Code's own tools (D-315).
    const toolServers = withStandIns(
      options.toolServers,
      standInTools({
        askPermission: options.askPermission,
        callId: (tool) => waitFor(() => normalizer.mcpCallId("jig", tool)),
        signal: () => turnAbort.signal,
        planApproved: () => {
          carryOutPlan = true;
        },
      }),
    );
    const mcpToken = newMcpToken();
    let localMcp: LocalMcp | undefined;
    let ended = false;
    const closeMcp = () => {
      ended = true;
      void localMcp?.close();
      localMcp = undefined;
    };
    const env = codexSessionEnv(options.env, Boolean(options.codexAllowApiKey));
    const binary = codexBinary(options.codexPath, env);
    let permissionMode = options.permissionMode;
    let threadId: string | undefined;
    let models: ModelInfo[] = [];
    /** Overrides for the next turn (Codex keeps them for the turns after it). */
    let next: Partial<Pick<TurnStartParams, "model" | "effort" | "approvalPolicy" | "sandboxPolicy">> = {
      ...(options.effort ? { effort: options.effort } : {}),
    };
    /** Codex's approval requests waiting for you, by JSON-RPC id. */
    const asking = new Map<string, AbortController>();
    const emit = (events: EngineEvent[]) => {
      for (const event of events) {
        if (event.type !== "result") {
          if (event.type === "block_end" && event.block === "text" && event.text) lastReply = event.text;
          onEvent(event);
          continue;
        }
        endTurn();
        // An approved plan: this turn's result waits for the turn that carries it out.
        if (carryOutPlan && event.ok) {
          carryOutPlan = false;
          heldResult = event;
          startTurn([{ type: "text", text: PLAN_APPROVED_PROMPT, text_elements: [] }]);
          continue;
        }
        carryOutPlan = false;
        const held = heldResult;
        heldResult = undefined;
        onEvent(held ? mergeResults(held, event) : event);
        if (event.ok) suggest();
      }
    };

    if (!binary) {
      queueMicrotask(() => {
        onEvent({ type: "error", code: "process", message: NO_CODEX });
        onEvent({ type: "exit" });
      });
      return deadSession(NO_CODEX);
    }

    const rpc: CodexRpc = new CodexRpc(binary, options.cwd, env, {
      notification: (message) => {
        const p = (message.params ?? {}) as { requestId?: string | number };
        // Codex settled a request itself (the turn ended): its card closes.
        if (message.method === "serverRequest/resolved" && p.requestId !== undefined) {
          asking.get(String(p.requestId))?.abort();
          asking.delete(String(p.requestId));
        }
        emit(normalizer.handle(message));
      },
      request: (message) => void answer(message),
      exit: (error) => {
        closeMcp();
        endTurn();
        for (const controller of asking.values()) controller.abort();
        asking.clear();
        if (error) onEvent({ type: "error", code: "process", message: error });
        onEvent({ type: "exit" });
      },
    });

    /** Codex asks before a command or file change: the permission card, unless the mode decides. */
    const answer = async (message: { id: string | number; method: string; params?: unknown }) => {
      if (message.method === "mcpServer/elicitation/request") {
        await answerMcp(message);
        return;
      }
      const request = normalizer.permissionRequest(message.method, message.params);
      if (!request) {
        // Questions and other requests come with Codex chats' later phases.
        rpc.fail(message.id, `Jig doesn't handle ${message.method} yet`);
        return;
      }
      // Plan only: nothing that writes or leaves the read-only sandbox (Codex hears "declined").
      if (permissionMode === "plan") {
        rpc.respond(message.id, { decision: "decline" satisfies CommandExecutionApprovalDecision });
        return;
      }
      const isEdit = message.method === "item/fileChange/requestApproval";
      if (isEdit && permissionMode === "acceptEdits") {
        rpc.respond(message.id, { decision: "accept" satisfies FileChangeApprovalDecision });
        return;
      }
      const controller = new AbortController();
      asking.set(String(message.id), controller);
      const decision = await options.askPermission(request, controller.signal);
      asking.delete(String(message.id));
      if (controller.signal.aborted) return;
      const reply: CommandExecutionApprovalDecision & FileChangeApprovalDecision =
        decision.behavior === "deny" ? "decline" : decision.always ? "acceptForSession" : "accept";
      rpc.respond(message.id, { decision: reply });
    };

    /**
     * Codex asks before an MCP tool runs: Jig's read-only tools and Don't ask mode run unasked, like
     * in Claude chats; the rest get the usual permission card. Other elicitations are declined.
     */
    const answerMcp = async (message: { id: string | number; params?: unknown }) => {
      const decline = () => rpc.respond(message.id, { action: "decline", content: null, _meta: null });
      const call = mcpToolApproval(message.params);
      if (!call) return decline();
      const toolName = `mcp__${call.server}__${call.tool}`;
      const accept = (always = false) =>
        rpc.respond(message.id, {
          action: "accept",
          content: {},
          _meta: always && call.canPersist ? { persist: "session" } : null,
        });
      if (permissionMode === "bypassPermissions" || isReadOnlyChatTool(toolServers, toolName))
        return accept();
      const controller = new AbortController();
      asking.set(String(message.id), controller);
      const decision = await options.askPermission(
        {
          requestId: normalizer.mcpCallId(call.server, call.tool) ?? `mcp-${message.id}`,
          toolName,
          input: call.input,
          title: call.message || undefined,
          canAlwaysAllow: call.canPersist,
        },
        controller.signal,
      );
      asking.delete(String(message.id));
      if (controller.signal.aborted) return;
      if (decision.behavior === "deny") decline();
      else accept(Boolean(decision.always));
    };

    const instructions = () =>
      [
        options.codexInstructions === "claude"
          ? (() => {
              const text = personalInstructions({ env: options.env });
              return text ? `# Your personal instructions\n\n${text}` : "";
            })()
          : "",
        options.appendSystemPrompt,
        STAND_IN_INSTRUCTIONS,
      ]
        .filter(Boolean)
        .join("\n\n") || undefined;

    /** Starts (or resumes) the thread; every turn waits for it. */
    const ready: Promise<void> = (async () => {
      const version = await rpc.initialize();
      if (version && version !== CODEX_PROTOCOL_VERSION)
        log.info(
          `Codex ${version} runs a chat; Jig's protocol types are from ${CODEX_PROTOCOL_VERSION} (npm run codex:protocol).`,
        );
      models = await rpc
        .request<ModelListResponse>("model/list", {})
        .then((r) => modelsFrom(r.data))
        .catch(() => []);
      if (options.codexSkills === "claude") await addClaudeSkills(rpc, options);
      const resolved = resolveChatGptModel(options.model, models);
      if (resolved.notice) onEvent({ type: "notice", tone: "warning", text: resolved.notice });
      const policy = codexPolicy(permissionMode, options.additionalDirectories);
      {
        const started = await startLocalMcp(toolServers, mcpToken).catch((error: Error) => {
          log.warn("Jig's MCP server for a Codex chat didn't start", error);
          onEvent({
            type: "notice",
            tone: "warning",
            text: `Jig's tools aren't available in this chat: ${error.message}`,
          });
          return undefined;
        });
        // The chat may have closed while the server started.
        if (ended) void started?.close();
        else localMcp = started;
      }
      const common = {
        cwd: options.cwd,
        config: {
          // The project's approved .mcp.json servers, as a Claude chat here gets them; Jig's last.
          ...projectMcpConfig(options.cwd, options.env),
          ...(localMcp ? jigMcpConfig(toolServers, (name) => localMcp!.url(name), mcpToken) : {}),
        },
        model: resolved.model || null,
        approvalPolicy: policy.approvalPolicy,
        sandbox: policy.sandbox,
        developerInstructions: instructions() ?? null,
      };
      let response: ThreadStartResponse | undefined;
      if (options.resume) {
        // A saved thread opened in Jig continues as a copy (thread/fork), like Claude's (D-315).
        response = await rpc
          .request<ThreadStartResponse>(options.forkSession ? "thread/fork" : "thread/resume", {
            threadId: options.resume,
            ...common,
            excludeTurns: true,
          } satisfies ThreadResumeParams & ThreadForkParams)
          .catch((error: Error) => {
            log.warn("Couldn't resume a Codex thread", error);
            onEvent({
              type: "notice",
              tone: "warning",
              text: "Codex couldn't continue the earlier conversation, so this message starts a new one.",
            });
            return undefined;
          });
      }
      response ??= await rpc.request<ThreadStartResponse>("thread/start", common satisfies ThreadStartParams);
      threadId = response.thread.id;
      // The first turn sends the sandbox with its extra folders.
      next = { ...next, sandboxPolicy: policy.sandboxPolicy };
      emit(normalizer.started(response, permissionMode));
    })();
    ready.catch((error: Error) => {
      if (rpc.closed) return;
      log.warn("Codex chat didn't start", error);
      onEvent({
        type: "error",
        code: "process",
        message: `Codex couldn't start this chat: ${error.message}`,
      });
      rpc.kill();
    });

    const inputFrom = (text: string, attachments: Parameters<EngineSession["send"]>[1] = []): UserInput[] => {
      const input: UserInput[] = [];
      for (const part of attachments) {
        if (part.type === "image")
          input.push({ type: "image", url: `data:${part.mime};base64,${part.data}` });
        else if (part.type === "text") input.push({ type: "text", text: part.text, text_elements: [] });
        else {
          onEvent({
            type: "notice",
            tone: "warning",
            text: `Codex chats can't read PDFs, so ${part.name ?? "the PDF"} wasn't sent.`,
          });
        }
      }
      if (text) input.push({ type: "text", text, text_elements: [] });
      return input;
    };

    /** A turn's request with the overrides waiting for it; in Plan only, the instruction to plan first. */
    const turnParams = (input: UserInput[], clientUserMessageId: string): TurnStartParams => {
      const overrides = next;
      next = {};
      return {
        threadId: threadId!,
        clientUserMessageId,
        input:
          permissionMode === "plan"
            ? [{ type: "text", text: PLAN_MODE_PROMPT, text_elements: [] }, ...input]
            : input,
        summary: "auto",
        ...overrides,
      };
    };
    const turnFailed = (error: Error) => {
      if (rpc.closed) return;
      log.warn("Codex didn't take a message", error);
      onEvent({
        type: "result",
        ok: false,
        durationMs: 0,
        error: `Codex didn't take the message: ${error.message}`,
      });
    };
    /** A turn Jig starts itself (carrying out an approved plan), in the chat's mode now. */
    const startTurn = (input: UserInput[]) =>
      void ready
        .then(async () => {
          if (threadId) await rpc.request<TurnStartResponse>("turn/start", turnParams(input, randomUUID()));
        })
        .catch(turnFailed);

    const session: EngineSession = {
      send(text, attachments, priority) {
        const clientUserMessageId = randomUUID();
        // A suggestion still on its way is for a turn that's over now.
        turns++;
        lastMessage = text.replace(JIG_ADDED_TEXT, "").trim() || lastMessage;
        lastReply = "";
        const input = inputFrom(text, attachments);
        void ready
          .then(async () => {
            if (!threadId) return;
            // A message sent while Codex works joins the running turn.
            if (normalizer.turnId && priority) {
              await rpc.request("turn/steer", {
                threadId,
                clientUserMessageId,
                input,
                expectedTurnId: normalizer.turnId,
              });
              return;
            }
            await rpc.request<TurnStartResponse>("turn/start", turnParams(input, clientUserMessageId));
          })
          .catch(turnFailed);
        return clientUserMessageId;
      },
      async interrupt() {
        await ready.catch(() => {});
        if (threadId && normalizer.turnId)
          await rpc.request("turn/interrupt", { threadId, turnId: normalizer.turnId }).catch(() => {});
      },
      async setModel(model) {
        await ready.catch(() => {});
        next = { ...next, model: resolveChatGptModel(model, models).model || null };
      },
      async setEffort(effort) {
        next = { ...next, effort: effort ?? null };
      },
      async setPermissionMode(mode) {
        permissionMode = mode;
        const policy = codexPolicy(mode, options.additionalDirectories);
        next = { ...next, approvalPolicy: policy.approvalPolicy, sandboxPolicy: policy.sandboxPolicy };
      },
      async models() {
        await ready.catch(() => {});
        return models;
      },
      async contextUsage() {
        const c = normalizer.context();
        if (!c) return undefined;
        const used = Math.min(c.usedTokens, c.maxTokens);
        return {
          usedTokens: used,
          maxTokens: c.maxTokens,
          percent: Math.round((used / c.maxTokens) * 100),
          categories: [
            { name: "Conversation", tokens: used, kind: "used" },
            { name: "Free space", tokens: c.maxTokens - used, kind: "free" },
          ],
          at: new Date().toISOString(),
        };
      },
      async commands() {
        return [];
      },
      async mcpStatus() {
        return [...normalizer.mcpServers.values()];
      },
      async mcpReconnect() {
        throw new Error("Codex chats can't reconnect MCP servers yet.");
      },
      async mcpToggle() {
        throw new Error("Codex chats can't switch MCP servers on or off yet.");
      },
      async background() {
        return false;
      },
      async stopTask() {},
      async rewindFiles() {
        return { canRewind: false, error: "Codex chats can't restore files." };
      },
      close() {
        endTurn();
        if (threadId) rpc.request("thread/unsubscribe", { threadId }).catch(() => {});
        rpc.kill();
        closeMcp();
      },
    };
    return session;
  }

  /** The models Codex offers, from a short-lived app-server (no thread). */
  async models(options: {
    env: Record<string, string | undefined>;
    claudePath: string;
  }): Promise<ModelInfo[]> {
    return oneOff(options.env, async (rpc) =>
      modelsFrom((await rpc.request<ModelListResponse>("model/list", {})).data),
    );
  }

  /**
   * Codex's saved threads, newest first (D-315): the ones you had in Codex's terminal, its IDE
   * extensions and Jig's own Codex chats; not `codex exec` runs (Jig's one-shots). Empty when Codex
   * isn't installed.
   */
  async savedSessions(options: { limit: number }): Promise<SavedClaudeSession[]> {
    return oneOff(process.env, async (rpc) => {
      const list = await rpc.request<ThreadListResponse>("thread/list", {
        limit: Math.min(options.limit, 200),
        sortKey: "updated_at",
        sourceKinds: ["cli", "vscode", "appServer"],
      } satisfies ThreadListParams);
      return list.data.flatMap((t) => savedThread(t) ?? []);
    }).catch((error: Error) => {
      if (error.message !== NO_CODEX) log.warn("Couldn't list Codex's saved threads", error);
      return [];
    });
  }

  /** A saved thread's messages, as Claude Code transcript messages (codexHistory.ts). */
  async savedMessages(threadId: string): Promise<SavedClaudeMessage[]> {
    return oneOff(process.env, async (rpc) => {
      const read = await rpc.request<ThreadReadResponse>("thread/read", {
        threadId,
        includeTurns: true,
      } satisfies ThreadReadParams);
      return threadMessages(read.thread);
    });
  }

  async savedToolUses(threadId: string): Promise<SavedToolUse[]> {
    return (await this.savedMessages(threadId).catch(() => [])).flatMap((m) =>
      m.type !== "assistant"
        ? []
        : (
            (
              m.message as {
                content?: Array<{ type?: string; name?: string; input?: Record<string, unknown> }>;
              }
            ).content ?? []
          )
            .filter((b) => b.type === "tool_use" && b.name)
            .map((b) => ({ name: b.name!, input: b.input ?? {} })),
    );
  }

  // Jig's non-chat calls run on Claude's engine or through main/providers (D-294, D-309).
  oneShot(_prompt: string, _options: OneShotOptions): Promise<string> {
    return Promise.reject(new Error("Codex answers one-shots through main/providers."));
  }
  completer(): Completer {
    throw new Error("Code completion runs on Claude Code.");
  }
  callTool(_request: unknown, _options: ToolCallOptions): never {
    throw new Error("Claude Code's own tools run on Claude Code.");
  }
  planUsage(): Promise<RawUsage> {
    return Promise.reject(new Error("ChatGPT's plan usage comes from main/providers."));
  }
}

/**
 * Claude Code's skills for this chat that Codex doesn't have under the same name, as extra skill roots
 * of this chat's app-server (D-315). A failure only costs those skills.
 */
async function addClaudeSkills(rpc: CodexRpc, options: StartOptions): Promise<void> {
  try {
    const listed = await rpc.request<SkillsListResponse>("skills/list", { cwds: [options.cwd] });
    const roots = missingSkills(
      claudeSkillFolders({ cwd: options.cwd, home: homedir(), plugins: options.plugins }),
      listed.data.flatMap((entry) => entry.skills.map((s) => s.name)),
    );
    if (roots.length) await rpc.request("skills/extraRoots/set", { extraRoots: roots });
  } catch (error) {
    log.warn("Claude Code's skills weren't added to a Codex chat", error);
  }
}

/** Runs `fn` against a short-lived app-server (no thread), stopped afterwards or after 45 seconds. */
async function oneOff<T>(
  baseEnv: Record<string, string | undefined>,
  fn: (rpc: CodexRpc) => Promise<T>,
): Promise<T> {
  const env = codexSessionEnv(baseEnv, false);
  const binary = codexBinary(undefined, env);
  if (!binary) throw new Error(NO_CODEX);
  let rpc: CodexRpc | undefined;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      (async () => {
        rpc = new CodexRpc(binary, process.cwd(), env, {
          notification: () => {},
          request: (m) => rpc?.fail(m.id, "Not now"),
          exit: () => {},
        });
        await rpc.initialize();
        return fn(rpc);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Codex didn't answer in time")), 45_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    rpc?.kill();
  }
}

/** Waits up to a second for a value another message brings (Codex announces a tool call before making it). */
async function waitFor<T>(get: () => T | undefined, ms = 1000): Promise<T | undefined> {
  for (let waited = 0; ; waited += 50) {
    const value = get();
    if (value !== undefined || waited >= ms) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
}

type ResultEvent = Extract<EngineEvent, { type: "result" }>;

/** Two turns shown as one: the planning turn and the one that carried the plan out (D-315). */
export function mergeResults(first: ResultEvent, second: ResultEvent): ResultEvent {
  const a = first.usage;
  const b = second.usage;
  return {
    ...second,
    durationMs: first.durationMs + second.durationMs,
    ...(a && b
      ? {
          usage: {
            inputTokens: a.inputTokens + b.inputTokens,
            outputTokens: a.outputTokens + b.outputTokens,
            cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
            cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
          },
        }
      : {}),
  };
}

/** A chat whose Codex couldn't start: every call fails with the reason. */
function deadSession(reason: string): EngineSession {
  const fail = () => Promise.reject(new Error(reason));
  return {
    send: () => randomUUID(),
    interrupt: async () => {},
    setModel: fail,
    setEffort: fail,
    setPermissionMode: fail,
    models: async () => [],
    contextUsage: async () => undefined,
    commands: async () => [],
    mcpStatus: async () => [],
    mcpReconnect: fail,
    mcpToggle: fail,
    background: async () => false,
    stopTask: async () => {},
    rewindFiles: async () => ({ canRewind: false, error: reason }),
    close: () => {},
  };
}
