import type { AuthSource, EngineEvent, PermissionRequest, Usage } from "../../shared/engine";
import { codexToolCardName } from "./codexTools";

/**
 * Codex app-server notifications → Jig engine events (D-311), the Codex counterpart of
 * normalize.ts. Pure and stateful per chat: it remembers streamed messages (an interrupted turn
 * never completes its message), running tools, file changes (their approval request names only the
 * item) and token totals. Messages are typed loosely on purpose: the protocol is marked experimental
 * and grows often (the generated types are in ./codex-protocol). Unknown messages are ignored, never
 * a crash.
 *
 * Codex's items reuse Claude's cards: a command is a Bash card, a file change an Edit or Write card
 * with its diff, an MCP call the generic tool card (`mcp__server__tool`).
 */
// biome-ignore lint/suspicious/noExplicitAny: app-server messages are a large, evolving union.
type Msg = any;

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * The command a shell item runs, without the shell Codex wraps it in (`powershell.exe -Command '…'`,
 * `bash -lc '…'`), so the Bash card shows what Codex meant to run.
 */
export function displayCommand(command: string): string {
  const trimmed = command.trim();
  const ps = PS_WRAPPER.exec(trimmed);
  if (ps) {
    const inner = ps[1]!.trim();
    // Only a single quoted string is unwrapped: `'a' ; 'b'` stays as it is.
    if (/^'(?:[^']|'')*'$/.test(inner)) return inner.slice(1, -1).replace(/''/g, "'");
    if (/^"(?:[^"\\]|\\.)*"$/.test(inner)) return inner.slice(1, -1).replace(/\\"/g, '"');
    return inner;
  }
  const sh = SH_WRAPPER.exec(trimmed);
  if (sh) {
    const inner = sh[1]!.trim();
    if (/^'(?:[^']|'\\'')*'$/.test(inner)) return inner.slice(1, -1).replace(/'\\''/g, "'");
    if (/^"(?:[^"\\]|\\.)*"$/.test(inner)) return inner.slice(1, -1).replace(/\\(["\\$`])/g, "$1");
    return inner;
  }
  return command;
}

/** A program by name, bare or as a path with `/` or `\` (in quotes when it has spaces). */
const program = (names: string) =>
  String.raw`(?:"(?:[^"]*[\\/])?(?:${names})(?:\.exe)?"|(?:[^\s"]*[\\/])?(?:${names})(?:\.exe)?)`;

/** `powershell.exe [-NoLogo -NoProfile -ExecutionPolicy Bypass …] -Command <script>`. */
const PS_WRAPPER = new RegExp(
  String.raw`^${program("powershell|pwsh")}(?:\s+-(?:NoProfile|NoLogo|NonInteractive|ExecutionPolicy\s+\S+|InputFormat\s+\S+|OutputFormat\s+\S+))*\s+-(?:Command|c)\s+([\s\S]+)$`,
  "i",
);

/** `bash -lc <script>`, `bash -l -c`, `bash --login -c`, `sh -c`. */
const SH_WRAPPER = new RegExp(
  String.raw`^${program("bash|zsh|sh")}(?:\s+(?:-l|--login))?\s+-l?c\s+([\s\S]+)$`,
);

/**
 * Codex asking before an MCP tool runs (an `mcpServer/elicitation/request` whose `_meta` says
 * `codex_approval_kind: "mcp_tool_call"`, D-313): which server and tool, with what input, and
 * whether it offers to remember the answer for the session. Other elicitations: undefined.
 */
export function mcpToolApproval(
  params: Msg,
):
  | { server: string; tool: string; input: Record<string, unknown>; message: string; canPersist: boolean }
  | undefined {
  const meta = params?._meta;
  if (meta?.codex_approval_kind !== "mcp_tool_call") return undefined;
  const message = str(params?.message) ?? "";
  const tool = str(meta.tool_name) ?? /run tool "([^"]+)"/.exec(message)?.[1];
  const server = str(params?.serverName);
  if (!tool || !server) return undefined;
  const input =
    meta.tool_params && typeof meta.tool_params === "object" && !Array.isArray(meta.tool_params)
      ? (meta.tool_params as Record<string, unknown>)
      : {};
  const persist = meta.persist;
  return {
    server,
    tool,
    input,
    message,
    canPersist: persist === "session" || (Array.isArray(persist) && persist.includes("session")),
  };
}

/**
 * A file change's diff as unified-diff hunks: a new file's content becomes one added hunk, a deleted
 * file's content one removed hunk.
 */
export function changeDiff(kind: string, diff: string): string {
  if (!diff || diff.startsWith("@@") || (kind !== "add" && kind !== "delete")) return diff;
  const body = diff.replace(/\r?\n$/, "").split(/\r?\n/);
  if (kind === "add") return [`@@ -0,0 +1,${body.length} @@`, ...body.map((l) => `+${l}`)].join("\n");
  return [`@@ -1,${body.length} +0,0 @@`, ...body.map((l) => `-${l}`)].join("\n");
}

/**
 * What a tool call returned: its text, and its images. MCP blocks are `{ type: "text" | "image", … }`;
 * a dynamic tool's items are `inputText`, `inputImage` (a URL, usually a data URL) and `inputAudio`.
 */
export function mcpOutput(content: unknown): {
  text: string;
  images: Array<{ mime: string; data: string }>;
} {
  if (!Array.isArray(content))
    return { text: content === undefined ? "" : JSON.stringify(content), images: [] };
  const images: Array<{ mime: string; data: string }> = [];
  const text = content
    .map((block: Msg) => {
      if (block?.type === "text" || block?.type === "inputText") return String(block.text ?? "");
      if (block?.type === "image" && typeof block.data === "string") {
        images.push({ mime: String(block.mimeType ?? "image/png"), data: block.data });
        return "[image]";
      }
      if (block?.type === "inputImage" && typeof block.imageUrl === "string") {
        const data = /^data:([^;,]+);base64,([\s\S]*)$/.exec(block.imageUrl);
        if (!data) return `[image: ${block.imageUrl}]`;
        images.push({ mime: data[1]!, data: data[2]! });
        return "[image]";
      }
      if (block?.type === "inputAudio") return "[audio]";
      return JSON.stringify(block);
    })
    .join("\n");
  return { text, images };
}

/** Codex's token counts → Jig's (Jig's input excludes what was read from the cache, like Claude's). */
function usageFrom(t: Msg): Usage {
  const cached = num(t?.cachedInputTokens);
  return {
    inputTokens: Math.max(0, num(t?.inputTokens) - cached),
    outputTokens: num(t?.outputTokens),
    cacheReadTokens: cached,
    cacheWriteTokens: num(t?.cacheWriteInputTokens),
  };
}

const minus = (a: Usage, b: Usage): Usage => ({
  inputTokens: Math.max(0, a.inputTokens - b.inputTokens),
  outputTokens: Math.max(0, a.outputTokens - b.outputTokens),
  cacheReadTokens: Math.max(0, a.cacheReadTokens - b.cacheReadTokens),
  cacheWriteTokens: Math.max(0, a.cacheWriteTokens - b.cacheWriteTokens),
});

const ZERO: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** Login failures, from Codex's error info or its message. */
const isLoginError = (error: Msg) =>
  error?.codexErrorInfo === "unauthorized" ||
  /not (logged|signed) in|log ?in again|unauthori[sz]ed/i.test(String(error?.message ?? ""));

const NOT_SIGNED_IN =
  "Codex isn't signed in with ChatGPT. Sign in from Get started → ChatGPT (Codex), then send again.";

interface FileChange {
  path: string;
  kind: string;
  movePath?: string;
  diff: string;
}

/** The cards of a file change item: the item's id for one file, `<id>:<n>` for each of several. */
const changeIds = (id: string, count: number): string[] =>
  count === 1 ? [id] : Array.from({ length: count }, (_, i) => `${id}:${i}`);

/** The tool card a file change shows as: Write for a new file, Edit for the rest. */
function changeTool(change: FileChange): { name: string; input: Record<string, unknown> } {
  if (change.kind === "add") {
    const content = change.diff.startsWith("@@") ? undefined : change.diff;
    return { name: "Write", input: { file_path: change.path, ...(content ? { content } : {}) } };
  }
  return {
    name: "Edit",
    input: {
      file_path: change.path,
      ...(change.kind === "delete" ? { delete: true } : {}),
      ...(change.movePath ? { new_path: change.movePath } : {}),
    },
  };
}

export interface CodexMcpServer {
  name: string;
  status: "connected" | "failed" | "pending";
  error?: string;
}

type CodexWindow = { usedPercent?: number; windowDurationMins?: number | null; resetsAt?: number | null };

/**
 * When a used-up ChatGPT plan has room again (D-338): the reset of the window that is full (the later
 * one when both are), else of the fullest. Codex's `resetsAt` is unix seconds.
 */
export function limitReset(
  limits: { primary?: CodexWindow | null; secondary?: CodexWindow | null } | undefined,
): { window: string; resetsAt: string } | undefined {
  const windows = (["primary", "secondary"] as const)
    .map((id) => ({ id, w: limits?.[id] }))
    .filter((x): x is { id: "primary" | "secondary"; w: CodexWindow } => typeof x.w?.resetsAt === "number");
  if (!windows.length) return undefined;
  const full = windows.filter((x) => (x.w.usedPercent ?? 0) >= 100);
  const pick = full.length
    ? full.sort((a, b) => b.w.resetsAt! - a.w.resetsAt!)[0]!
    : windows.sort((a, b) => (b.w.usedPercent ?? 0) - (a.w.usedPercent ?? 0))[0]!;
  return { window: pick.id, resetsAt: new Date(pick.w.resetsAt! * 1000).toISOString() };
}

export class CodexNormalizer {
  /** The model the thread runs on (Codex reports it when the thread starts). */
  model = "";
  /** The running turn, while one runs. */
  turnId: string | undefined;
  private turnStarted = 0;
  private authSource: AuthSource = "unknown";
  /** Codex's latest rate limits (`account/rateLimits/updated`), for when a limit resets. */
  private rateLimits: { primary?: CodexWindow | null; secondary?: CodexWindow | null } | undefined;
  private initialized = false;
  /** Streamed messages and reasoning not completed yet: item id → kind and text so far. */
  private open = new Map<string, { block: "text" | "thinking"; text: string }>();
  /** File changes by item id (approval requests name only the item). */
  private changes = new Map<string, FileChange[]>();
  /** Commands by item id, for their approval requests. */
  private commands = new Map<string, { command: string; cwd?: string }>();
  /** MCP calls in progress by `server/tool`: Codex's approval for one names no item (D-313). */
  private mcpCalls = new Map<string, string>();
  /** Output of running commands, as it streams. */
  private output = new Map<string, string>();
  /** Token totals: the latest, and at the end of the previous turn (a turn's usage is the difference). */
  private total: Usage = ZERO;
  private turnBase: Usage = ZERO;
  /** The last request's size and the model's window, for the context meter. */
  lastTokens = 0;
  contextWindow = 0;
  readonly mcpServers = new Map<string, CodexMcpServer>();

  /** The thread started or resumed (thread/start or thread/resume answered). */
  started(response: Msg, permissionMode: string): EngineEvent[] {
    this.model = str(response?.model) ?? this.model;
    this.initialized = true;
    return [
      {
        type: "init",
        engineSessionId: String(response?.thread?.id ?? ""),
        model: this.model,
        permissionMode,
        authSource: this.authSource,
        slashCommands: [],
        ...(this.mcpServers.size
          ? { mcpServers: [...this.mcpServers.values()].map((s) => ({ name: s.name, status: s.status })) }
          : {}),
      },
    ];
  }

  handle(message: Msg): EngineEvent[] {
    const p = message?.params ?? {};
    switch (message?.method) {
      case "turn/started":
        this.turnId = str(p.turn?.id);
        this.turnStarted = Date.now();
        return [];
      case "item/started":
        return this.itemStarted(p.item);
      case "item/completed":
        return this.itemCompleted(p.item);
      case "item/agentMessage/delta":
        return this.delta(p.itemId, "text", p.delta);
      case "item/reasoning/summaryTextDelta":
      case "item/reasoning/textDelta":
        return this.delta(p.itemId, "thinking", p.delta);
      case "item/reasoning/summaryPartAdded":
        return this.open.get(p.itemId)?.text ? this.delta(p.itemId, "thinking", "\n\n") : [];
      case "item/commandExecution/outputDelta":
        if (typeof p.itemId === "string" && typeof p.delta === "string")
          this.output.set(p.itemId, (this.output.get(p.itemId) ?? "") + p.delta);
        return [];
      case "thread/tokenUsage/updated": {
        const t = p.tokenUsage;
        if (t?.total) this.total = usageFrom(t.total);
        if (t?.last) this.lastTokens = num(t.last.totalTokens);
        if (typeof t?.modelContextWindow === "number") this.contextWindow = t.modelContextWindow;
        return [];
      }
      case "turn/completed":
        return this.turnCompleted(p.turn);
      case "error":
        return this.error(p);
      case "account/updated":
        return this.account(p);
      case "account/rateLimits/updated":
        // Sparse: merge what it says into what Codex said before.
        if (p.rateLimits && typeof p.rateLimits === "object")
          this.rateLimits = {
            primary: p.rateLimits.primary ?? this.rateLimits?.primary ?? null,
            secondary: p.rateLimits.secondary ?? this.rateLimits?.secondary ?? null,
          };
        return [];
      case "mcpServer/startupStatus/updated":
        return this.mcpStatus(p);
      case "model/rerouted":
        if (typeof p.toModel !== "string") return [];
        this.model = p.toModel;
        return [{ type: "notice", tone: "info", text: `Codex switched this turn to ${p.toModel}.` }];
      case "warning":
      case "configWarning":
        return typeof p.message === "string" && p.message
          ? [{ type: "notice", tone: "warning", text: `Codex: ${p.message}` }]
          : [];
      default:
        return [];
    }
  }

  /** A command or file-change approval as a permission card; undefined for any other request. */
  permissionRequest(method: string, params: Msg): PermissionRequest | undefined {
    const itemId = String(params?.itemId ?? "");
    const requestId = String(params?.approvalId ?? itemId);
    const description = str(params?.reason);
    if (method === "item/commandExecution/requestApproval") {
      const known = this.commands.get(itemId);
      const command = displayCommand(str(params?.command) ?? known?.command ?? "");
      return {
        requestId,
        toolName: "Bash",
        input: { command, ...(str(params?.cwd) ? { cwd: params.cwd } : {}) },
        title: command ? `Codex wants to run ${command}` : "Codex wants to run a command",
        description,
        canAlwaysAllow: true,
      };
    }
    if (method === "item/fileChange/requestApproval") {
      const changes = this.changes.get(itemId) ?? [];
      const first = changes[0];
      const tool = first ? changeTool(first) : { name: "Edit", input: {} };
      const names = changes.map((c) => c.path.split(/[\\/]/).pop()).join(", ");
      return {
        requestId,
        toolName: changes.length === 1 ? tool.name : "Edit",
        input: {
          ...tool.input,
          ...(changes.length > 1 ? { files: changes.map((c) => c.path) } : {}),
        },
        title: names ? `Codex wants to change ${names}` : "Codex wants to change files",
        description:
          description ?? (str(params?.grantRoot) ? `Write access to ${params.grantRoot}` : undefined),
        canAlwaysAllow: true,
      };
    }
    return undefined;
  }

  /** The tool card of the MCP call Codex asks about, so its permission shows on it. */
  mcpCallId(server: string, tool: string): string | undefined {
    return this.mcpCalls.get(`${server}/${tool}`);
  }

  /** How full the context window is, from the last request's size. */
  context(): { usedTokens: number; maxTokens: number } | undefined {
    if (!this.contextWindow || !this.lastTokens) return undefined;
    return { usedTokens: this.lastTokens, maxTokens: this.contextWindow };
  }

  private delta(itemId: unknown, block: "text" | "thinking", text: unknown): EngineEvent[] {
    if (typeof itemId !== "string" || typeof text !== "string" || !text) return [];
    const events: EngineEvent[] = [];
    let open = this.open.get(itemId);
    if (!open) {
      open = { block, text: "" };
      this.open.set(itemId, open);
      events.push({ type: "block_start", id: itemId, block });
    }
    open.text += text;
    events.push({ type: "block_delta", id: itemId, text });
    return events;
  }

  private itemStarted(item: Msg): EngineEvent[] {
    const id = str(item?.id);
    if (!id) return [];
    switch (item.type) {
      case "agentMessage":
        // Started now, so the message keeps its place even before its first words.
        if (this.open.has(id)) return [];
        this.open.set(id, { block: "text", text: "" });
        return [{ type: "block_start", id, block: "text" }];
      case "commandExecution": {
        const command = displayCommand(str(item.command) ?? "");
        this.commands.set(id, { command, cwd: str(item.cwd) });
        return [{ type: "tool_use", id, name: "Bash", input: { command }, model: this.model || undefined }];
      }
      case "fileChange": {
        const changes = this.fileChanges(item.changes);
        this.changes.set(id, changes);
        const ids = changeIds(id, changes.length);
        return changes.map((change, i) => ({
          type: "tool_use" as const,
          id: ids[i]!,
          ...changeTool(change),
          model: this.model || undefined,
        }));
      }
      case "mcpToolCall":
        this.mcpCalls.set(`${item.server}/${item.tool}`, id);
        return [
          {
            type: "tool_use",
            id,
            // Jig's stand-ins show as Claude's tools' cards (exit_plan → ExitPlanMode, D-315).
            name: codexToolCardName(String(item.server ?? "mcp"), String(item.tool ?? "tool")),
            input: this.args(item.arguments),
            model: this.model || undefined,
          },
        ];
      case "dynamicToolCall":
        return [
          {
            type: "tool_use",
            id,
            name: `mcp__${item.namespace ?? "codex"}__${item.tool ?? "tool"}`,
            input: this.args(item.arguments),
            model: this.model || undefined,
          },
        ];
      case "webSearch":
        return [
          {
            type: "tool_use",
            id,
            name: "WebSearch",
            input: { query: str(item.query) ?? "" },
            model: this.model || undefined,
          },
        ];
      case "imageView":
        return [
          {
            type: "tool_use",
            id,
            name: "Read",
            input: { file_path: str(item.path) ?? "" },
            model: this.model || undefined,
          },
        ];
      default:
        return [];
    }
  }

  private itemCompleted(item: Msg): EngineEvent[] {
    const id = str(item?.id);
    if (!id) return [];
    switch (item.type) {
      case "agentMessage": {
        const open = this.open.get(id);
        this.open.delete(id);
        const text = str(item.text) ?? open?.text ?? "";
        return [
          ...(open ? [] : [{ type: "block_start" as const, id, block: "text" as const }]),
          { type: "block_end", id, block: "text", text, ...(this.model ? { model: this.model } : {}) },
        ];
      }
      case "reasoning": {
        const open = this.open.get(id);
        this.open.delete(id);
        const parts = (a: unknown) => (Array.isArray(a) ? a.filter((s) => typeof s === "string" && s) : []);
        const text = parts(item.summary).join("\n\n") || parts(item.content).join("\n\n") || open?.text || "";
        // Codex often keeps its reasoning to itself: an empty item shows nothing.
        if (!text) return open ? [{ type: "block_end", id, block: "thinking", text: "" }] : [];
        return [
          ...(open ? [] : [{ type: "block_start" as const, id, block: "thinking" as const }]),
          { type: "block_end", id, block: "thinking", text, ...(this.model ? { model: this.model } : {}) },
        ];
      }
      case "commandExecution": {
        const streamed = this.output.get(id);
        this.output.delete(id);
        this.commands.delete(id);
        const status = str(item.status);
        const exitCode = typeof item.exitCode === "number" ? item.exitCode : undefined;
        let output = str(item.aggregatedOutput) ?? streamed ?? "";
        if (status === "declined") output = output || "You declined this command.";
        else if (exitCode)
          output = `${output}${output && !output.endsWith("\n") ? "\n" : ""}Exit code ${exitCode}`;
        return [
          {
            type: "tool_result",
            toolUseId: id,
            output,
            isError: status === "failed" || status === "declined" || Boolean(exitCode),
          },
        ];
      }
      case "fileChange": {
        const changes = this.fileChanges(item.changes);
        const known = this.changes.get(id);
        this.changes.delete(id);
        const list = changes.length ? changes : (known ?? []);
        const status = str(item.status);
        const isError = status === "failed" || status === "declined";
        const output =
          status === "declined"
            ? "You declined this change."
            : status === "failed"
              ? "Codex couldn't apply this change."
              : "";
        // A change the start didn't announce gets its card now; an announced card the completion
        // doesn't list (a different count) still gets a result, so none keeps running.
        const announced = changeIds(id, known?.length ?? 0);
        const listed = changeIds(id, list.length);
        const unlisted = announced
          .filter((toolUseId) => !listed.includes(toolUseId))
          .map((toolUseId) => ({ type: "tool_result" as const, toolUseId, output, isError }));
        const cards = list.flatMap((change, i) => {
          const toolUseId = listed[i]!;
          const start = announced.includes(toolUseId)
            ? []
            : [
                {
                  type: "tool_use" as const,
                  id: toolUseId,
                  ...changeTool(change),
                  model: this.model || undefined,
                },
              ];
          return [
            ...start,
            {
              type: "tool_result" as const,
              toolUseId,
              output,
              isError,
              ...(change.diff && !isError ? { diff: changeDiff(change.kind, change.diff) } : {}),
            },
          ];
        });
        return [...cards, ...unlisted];
      }
      case "mcpToolCall":
      case "dynamicToolCall": {
        if (this.mcpCalls.get(`${item.server}/${item.tool}`) === id)
          this.mcpCalls.delete(`${item.server}/${item.tool}`);
        if (item.error || item.success === false)
          return [
            {
              type: "tool_result",
              toolUseId: id,
              output: str(item.error?.message) ?? "The tool call failed.",
              isError: true,
            },
          ];
        const { text, images } = mcpOutput(item.result?.content ?? item.contentItems ?? []);
        return [
          {
            type: "tool_result",
            toolUseId: id,
            output: text,
            isError: false,
            ...(images.length ? { imageData: images } : {}),
          },
        ];
      }
      case "webSearch":
      case "imageView":
        return [{ type: "tool_result", toolUseId: id, output: "", isError: false }];
      case "contextCompaction":
        return [{ type: "compacted", trigger: "auto", preTokens: 0 }];
      default:
        return [];
    }
  }

  private turnCompleted(turn: Msg): EngineEvent[] {
    const events: EngineEvent[] = [];
    // An interrupted turn never completes its open message: it ends with what streamed.
    for (const [id, open] of this.open)
      events.push({
        type: "block_end",
        id,
        block: open.block,
        text: open.text,
        ...(this.model ? { model: this.model } : {}),
      });
    this.open.clear();
    this.output.clear();
    // What an interrupted turn left running is over too (the chat closes its cards on the result).
    this.commands.clear();
    this.changes.clear();
    this.mcpCalls.clear();
    const status = str(turn?.status);
    const usage = minus(this.total, this.turnBase);
    this.turnBase = this.total;
    const durationMs =
      typeof turn?.durationMs === "number"
        ? turn.durationMs
        : this.turnStarted
          ? Date.now() - this.turnStarted
          : 0;
    this.turnId = undefined;
    const stopped = status === "interrupted";
    const ok = status === "completed";
    events.push({
      type: "result",
      ok,
      durationMs,
      usage,
      numTurns: 1,
      ...(stopped ? { stopped: true } : {}),
      ...(!ok && !stopped ? { error: str(turn?.error?.message) ?? "Codex couldn't finish this turn." } : {}),
    });
    return events;
  }

  private error(p: Msg): EngineEvent[] {
    const error = p?.error;
    const message = str(error?.message) ?? "Codex reported an error.";
    if (p?.willRetry)
      return [{ type: "notice", tone: "warning", key: "codex-retry", text: `Codex is retrying: ${message}` }];
    if (isLoginError(error)) return [{ type: "error", code: "not_signed_in", message: NOT_SIGNED_IN }];
    const limit =
      error?.codexErrorInfo === "usageLimitExceeded" || error?.codexErrorInfo === "rateLimitExceeded";
    if (!limit) return [{ type: "notice", tone: "danger", text: message }];
    // The plan's limit, typed like Claude's (D-338): when it resets comes from the latest rate limits.
    const reset = limitReset(this.rateLimits);
    return [
      {
        type: "error",
        code: "rate_limit",
        message: `ChatGPT's limit is reached: ${message}`,
        ...(reset?.window ? { window: reset.window } : {}),
        ...(reset?.resetsAt ? { resetsAt: reset.resetsAt } : {}),
      },
    ];
  }

  private account(p: Msg): EngineEvent[] {
    const mode = str(p?.authMode);
    const before = this.authSource;
    this.authSource = !mode ? "unknown" : mode === "apikey" ? "api_key" : "subscription";
    if (!mode) return [{ type: "error", code: "not_signed_in", message: NOT_SIGNED_IN }];
    // The init notice covers a key known at start; one found later gets its own.
    if (this.initialized && this.authSource === "api_key" && before !== "api_key")
      return [
        {
          type: "notice",
          tone: "warning",
          key: "codex-api-key",
          text: "This chat uses an OpenAI API key, so usage is billed pay-as-you-go instead of your ChatGPT plan.",
        },
      ];
    return [];
  }

  private mcpStatus(p: Msg): EngineEvent[] {
    const name = str(p?.name);
    if (!name) return [];
    const state = str(p.status);
    const status = state === "ready" ? "connected" : state === "failed" ? "failed" : "pending";
    const error = str(p.error) ?? undefined;
    const before = this.mcpServers.get(name)?.status;
    this.mcpServers.set(name, { name, status, ...(error ? { error } : {}) });
    if (status !== "failed" || before === "failed") return [];
    return [
      {
        type: "notice",
        tone: "warning",
        key: `mcp-${name}`,
        text: `The MCP server “${name}” failed to start${error ? `: ${error}` : ""}.`,
      },
    ];
  }

  private fileChanges(raw: unknown): FileChange[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((c: Msg) => typeof c?.path === "string")
      .map((c: Msg) => ({
        path: c.path,
        kind: str(c.kind?.type) ?? "update",
        ...(str(c.kind?.move_path) ? { movePath: c.kind.move_path } : {}),
        diff: str(c.diff) ?? "",
      }));
  }

  private args(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
    return raw === undefined || raw === null ? {} : { value: raw };
  }
}
