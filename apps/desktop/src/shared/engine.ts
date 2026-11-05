/**
 * Chat sessions: what the renderer sees. The host turns Claude Code's messages into `EngineEvent`s
 * (main/engine/normalize.ts) and reduces them into `ChatItem`s (shared/chat.ts). Documented in
 * docs/reference/engine.md.
 */

import type { TenantTag } from "./azure";
export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "bypassPermissions"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  default: "Ask before changes",
  acceptEdits: "Accept edits",
  plan: "Plan only",
  bypassPermissions: "Don't ask",
};

/** Claude Code's effort levels (how hard the model thinks), for models that support them. */
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
/** Codex's reasoning levels (`codex debug models`): Claude's and one more. */
export const CODEX_EFFORT_LEVELS = [...EFFORT_LEVELS, "ultra"] as const;
/** Every engine's levels; a chat's picker offers only its provider's (`ENGINE_CAPABILITIES`). */
export const ANY_EFFORT_LEVELS = CODEX_EFFORT_LEVELS;
export type EffortLevel = (typeof ANY_EFFORT_LEVELS)[number];

/**
 * Which agent runs a chat (D-309): Claude Code (the default) or OpenAI's Codex. A chat saved without
 * one runs on Claude. A chat that hits its plan's limit can carry on with the other one (D-338).
 */
export const CHAT_PROVIDERS = ["claude", "codex"] as const;
export type ChatProvider = (typeof CHAT_PROVIDERS)[number];

/** A chat's provider; chats from before D-309 have none and run on Claude. */
export const chatProvider = (meta: { provider?: ChatProvider }): ChatProvider => meta.provider ?? "claude";

/** The other provider: who a chat carries on with when its own hits its limit (D-338). */
export const otherProvider = (provider: ChatProvider): ChatProvider =>
  provider === "codex" ? "claude" : "codex";

/**
 * What a chat does when its provider's plan limit stops it (D-338): `ask` shows the limit card with
 * its choices, `switch` carries on with the other provider when it has room (else waits, else asks),
 * `wait` resumes on the same provider when the limit resets.
 */
export const LIMIT_POLICIES = ["ask", "switch", "wait"] as const;
export type LimitPolicy = (typeof LIMIT_POLICIES)[number];

export const LIMIT_POLICY_LABELS: Record<LimitPolicy, string> = {
  ask: "Ask me",
  switch: "Continue with the other provider",
  wait: "Wait for the reset, then resume",
};

/**
 * A chat stopped by its plan's limit, while that matters (D-338): `ask` waits for your choice on the
 * limit card, `waiting` resumes at `resetsAt`, `continuing` is carrying on with the other provider.
 * Cleared when the chat's next turn starts.
 */
export interface ChatLimit {
  /** The limit card's item id. */
  itemId: string;
  provider: ChatProvider;
  state: "ask" | "waiting" | "continuing";
  resetsAt?: string;
  /**
   * Waiting because nobody answered the card (D-376): with `ask` a chat still resumes at the reset,
   * unless you choose first. Missing when you (or the setting) chose to wait.
   */
  auto?: boolean;
}

/** One stretch of a chat on one provider, kept when it continued with the other (D-338). */
export interface ProviderSpan {
  provider: ChatProvider;
  /** That provider's own session id then (its CLI keeps the conversation). */
  engineSessionId?: string;
  model: string;
  /** When the chat left it. */
  until: string;
  reason: "limit" | "manual";
}

/**
 * What handing a chat over to the other provider would do (D-339), for the confirmation dialog:
 * the model, effort and mode before and after, whether the other plan has room, and why it can't
 * happen now (`blocked`: a turn runs, or a builder chat stays on Claude Code).
 */
export interface HandoverPlan {
  from: ChatProvider;
  to: ChatProvider;
  before: { model: string; effort?: EffortLevel; permissionMode: PermissionMode };
  after: { model: string; effort?: EffortLevel; permissionMode: PermissionMode };
  /** The other plan's room on the usage meter; a warning only, the handover still works. */
  room: { ok: boolean; reason?: string };
  /** Messages the chat has had: 0 means nothing to carry over (the composer picker just switches). */
  messages: number;
  /** Files the chat edited, for the summary of what carries over. */
  files: number;
  blocked?: string;
}

/** What a chat engine can do, so the UI hides controls a provider doesn't have (D-309). */
export interface EngineCapabilities {
  /** Plan mode and its approve-the-plan card (ExitPlanMode). */
  planMode: boolean;
  /** Questions with choices (AskUserQuestion). */
  questions: boolean;
  /** Subagents Jig defines (jig-tester, jig-search). */
  subagents: boolean;
  /** Without subagents: Jig's search helper tool, a separate scoped call (`jig_search_code`, D-337). */
  searchHelper: boolean;
  /** Without subagents: Jig's tester helper tool, a separate scoped call (`jig_test_page`, D-337). */
  testerHelper: boolean;
  /** Restoring files and the conversation to an earlier message (file checkpoints). */
  rewind: boolean;
  /** Forking a chat into a new branch of the conversation. */
  fork: boolean;
  /** Opening conversations the provider's CLI saved on this machine. */
  history: boolean;
  /** The effort (reasoning) levels it accepts; empty = no effort picker. */
  effortLevels: readonly string[];
  /** It suggests the next message after a turn. */
  promptSuggestions: boolean;
}

/**
 * Each provider's capabilities. Codex starts with the basics (D-309); flip a flag when its engine
 * gains the feature. Codex's reasoning levels are the ones `codex debug models` lists.
 */
export const ENGINE_CAPABILITIES: Record<ChatProvider, EngineCapabilities> = {
  claude: {
    planMode: true,
    questions: true,
    subagents: true,
    searchHelper: false,
    testerHelper: false,
    rewind: true,
    fork: true,
    history: true,
    effortLevels: EFFORT_LEVELS,
    promptSuggestions: true,
  },
  codex: {
    planMode: true,
    questions: true,
    subagents: false,
    searchHelper: true,
    testerHelper: true,
    rewind: false,
    fork: false,
    history: true,
    effortLevels: CODEX_EFFORT_LEVELS,
    promptSuggestions: true,
  },
};

/** A Claude Code slash command or skill (built in, or from the user, project, a plugin or an MCP server). */
export interface SlashCommandInfo {
  name: string;
  description: string;
  argumentHint: string;
  aliases?: string[];
  /** Claude Code's own command (absent for skills and custom commands). */
  builtin?: boolean;
}

/** A model Claude Code offers. */
export interface ModelInfo {
  value: string;
  displayName: string;
  description: string;
  efforts?: EffortLevel[];
}

export interface McpServerInfo {
  name: string;
  status: "connected" | "failed" | "needs-auth" | "pending" | "disabled";
  error?: string;
  /** Where it is configured (user, project, local, a plugin…). */
  scope?: string;
  tools?: number;
}

/** A subagent or shell command Claude Code runs (in the foreground or the background). */
export interface TaskInfo {
  id: string;
  status: "running" | "completed" | "failed" | "stopped";
  description: string;
  summary?: string;
  tokens?: number;
  toolUses?: number;
  durationMs?: number;
  lastTool?: string;
  background?: boolean;
}

export interface BackgroundTask {
  id: string;
  description: string;
  /** `local_bash`, `local_agent`… as Claude Code names them. */
  type: string;
}

/** idle = waiting for you; working = Claude is busy; needs_you = a permission/question is waiting. */
export type SessionStatus = "idle" | "starting" | "working" | "needs_you" | "error";

/** Where the session's usage is billed: your Claude plan, or an API key (pay-as-you-go). */
export type AuthSource = "subscription" | "api_key" | "unknown";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** One model's share of a chat, as Claude Code totals it (main chat, subagents, compaction). */
export interface ModelUsage extends Usage {
  costUsd: number;
}

/** How full a session's context window is, as Claude Code's `/context` reports it. */
export interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
  /** 0–100. */
  percent: number;
  /** What fills it (system prompt, tools, messages, …), largest first; `free`/`buffer` are the rest. */
  categories: Array<{
    name: string;
    tokens: number;
    kind: "used" | "free" | "buffer";
  }>;
  /** When it was measured (after the last turn). */
  at: string;
}

/**
 * A conversation Claude Code saved on this machine (its CLI, the Claude desktop app's Code tab, an IDE),
 * which Jig can open as a chat (D-150).
 */
export interface SavedClaudeSession {
  sessionId: string;
  /** Whose saved conversation it is (D-315): Claude Code's (missing) or Codex's thread. */
  provider?: ChatProvider;
  /** Its /rename title, Claude Code's summary or the first prompt. */
  title: string;
  /** The folder it ran in. */
  cwd?: string;
  gitBranch?: string;
  /** ms since the epoch. */
  lastModified: number;
  createdAt?: number;
  fileSize?: number;
  /** The Jig chat it was opened as, when it was. */
  chatId?: string;
}

/** A tool call Claude made in a saved conversation (its name and what it was given). */
export interface SavedToolUse {
  name: string;
  input: Record<string, unknown>;
}

/** One message of a saved conversation, as Claude Code's transcript has it. */
export interface SavedClaudeMessage {
  type: "user" | "assistant" | "system";
  uuid: string;
  message: unknown;
  /** Set for a subagent's message. */
  parent_tool_use_id: string | null;
  /** A tool result's structured result (an Edit's `structuredPatch`), for its diff. */
  tool_use_result?: unknown;
}

export interface SessionMeta {
  id: string;
  /** Which agent runs it now (D-309); missing = Claude (chats from before). Changes only by a handoff (D-338). */
  provider?: ChatProvider;
  /** The providers it ran on before the current one, oldest first (D-338). */
  providers?: ProviderSpan[];
  /** It continued with another provider: the next message goes with the handoff Jig builds (D-338). */
  handoffPending?: { from: ChatProvider; reason: ProviderSpan["reason"] };
  /** Its provider's plan limit stopped it (D-338). */
  limit?: ChatLimit;
  /** New regular chat with no submitted prompt yet: memory-only, absent from saved layout/history. */
  draft?: boolean;
  /** The project you put the chat in (D-101); none = the "No project" group. Never set by the folder. */
  projectId?: string;
  /** Stays at the top of its project in the Chats list. */
  pinned?: boolean;
  cwd: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Model alias/id chosen for the session; empty = Claude Code's default. */
  model: string;
  /** The model Claude Code reported in its init message. */
  activeModel?: string;
  permissionMode: PermissionMode;
  /** Claude Code's own session id, used to resume after a restart. */
  engineSessionId?: string;
  status: SessionStatus;
  authSource: AuthSource;
  /** Cumulative cost estimate reported by Claude Code (USD). */
  costUsd: number;
  usage: Usage;
  /** Tokens and cost per model id, from Claude Code's latest result (its running totals). */
  modelUsage?: Record<string, ModelUsage>;
  turns: number;
  lastError?: string;
  /** Set when Claude Code isn't signed in; the UI shows the sign-in guidance. */
  needsLogin?: boolean;
  archived?: boolean;
  /** `builder` sessions run a build job (hidden from the Sessions list, opened from the build). */
  /** `concierge`: Jig itself, answering you on your phone (D-350). */
  kind?: "chat" | "builder" | "concierge";
  buildId?: string;
  /** A fork not started yet: the first start resumes `engineSessionId` as a new branch. */
  forkPending?: boolean;
  /** Claude Code's suggestion for your next message (after a turn; cleared when you send). */
  suggestion?: string;
  /** The context window after the last turn (kept while no Claude Code process runs). */
  context?: ContextUsage;
  /** Effort level for this chat; empty = the model's default. */
  effort?: EffortLevel;
  /** Folders Claude may use besides `cwd` (Claude Code's additional directories, `/add-dir`). */
  addDirs?: string[];
  /** Tasks running in the background (shell commands, subagents). */
  backgroundTasks?: BackgroundTask[];
  /** MCP servers as Claude Code reported them when it started. */
  mcpServers?: Array<{ name: string; status: string }>;
  /** The conversation was rewound: the next start resumes only up to this Claude Code message. */
  resumeAt?: string;
  /** Rewound to before the first message: the next message starts a new conversation. */
  resetPending?: boolean;
  /** Opened from a conversation Claude Code saved (its session id; D-150). */
  importedFrom?: string;
  /** You are talking with Claude: its replies are read aloud, so it answers briefly (D-209). */
  voice?: boolean;
  /** Drafts the notes of this Jig meeting (its id): its plan saves notes for review, nothing runs (D-268). */
  meetingNotes?: string;
  /** The Azure tenant its running Claude Code process started with (none while no process runs). */
  azureTenant?: TenantTag;
}

/** What restoring files to before a message changes (Claude Code's file checkpoints). */
export interface RewindResult {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  /** Claude Code's own sentence, e.g. "Claude wants to run npm test". */
  title?: string;
  description?: string;
  /** "Always allow" is possible (Claude Code offered permission rules). */
  canAlwaysAllow: boolean;
}

export type PermissionDecision =
  | {
      behavior: "allow";
      always?: boolean;
      updatedInput?: Record<string, unknown>;
    }
  | { behavior: "deny"; message?: string };

export type ChatItem =
  | {
      kind: "user";
      id: string;
      text: string;
      at: string;
      /** The id Claude Code knows this message by (file checkpoints: restore to before it). */
      messageId?: string;
      attachments?: ChatAttachment[];
      /** Older transcripts (images only). */
      images?: ChatAttachment[];
      /** Sent by Jig, not typed by you (a terminal Claude started has finished): the line shown for it. */
      from?: string;
      /** The Lucide icon beside `from`: the add-on's that sent it (a terminal when absent). */
      fromIcon?: string;
    }
  | {
      kind: "assistant";
      id: string;
      text: string;
      at: string;
      streaming?: boolean;
      parentId?: string;
      model?: string;
    }
  | {
      kind: "thinking";
      id: string;
      text: string;
      at: string;
      streaming?: boolean;
      parentId?: string;
      model?: string;
    }
  | {
      kind: "tool";
      /** Reported model of the assistant that called this tool, not a model run by the tool. */
      model?: string;
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: "running" | "done" | "error";
      output?: string;
      /** Images the tool returned (screenshots, charts), saved with the chat's attachments. */
      images?: ChatAttachment[];
      /** What an edit changed, as unified-diff hunks (from Claude Code's structured patch). */
      diff?: string;
      /** A subagent's progress (Task/Agent tools). */
      task?: TaskInfo;
      at: string;
      parentId?: string;
    }
  | {
      /** A shell command you ran from the message box (`!`); its output goes with your next message. */
      kind: "shell";
      id: string;
      at: string;
      command: string;
      output: string;
      exitCode?: number;
      status: "running" | "done";
      /** Sent to Claude with a message already. */
      sent?: boolean;
    }
  | {
      kind: "permission";
      id: string;
      request: PermissionRequest;
      status: "pending" | "allowed" | "always" | "denied" | "cancelled";
      at: string;
      /** "Don't ask" mode: Jig declines it at this time when nobody answered (D-336). */
      declineAt?: string;
      /** Declined because nobody answered in time, not by you (D-336). */
      timedOut?: boolean;
    }
  | {
      kind: "result";
      id: string;
      at: string;
      ok: boolean;
      durationMs: number;
      /** Cost of this turn (difference of the cumulative totals). */
      costUsd?: number;
      usage?: Usage;
      error?: string;
      /** The last Claude Code message of this turn: rewinding to after this turn resumes here. */
      /** The user stopped the turn (not an error). */
      stopped?: boolean;
      chainUuid?: string;
    }
  | {
      kind: "notice";
      id: string;
      at: string;
      text: string;
      tone: "info" | "warning" | "danger";
    }
  | {
      /**
       * The chat's provider hit its plan limit (D-338). `status` follows your choice: `open` (the
       * choices), `waiting` (resumes at `resetsAt`), `continued` (with `to`), `resumed`, `dismissed`.
       */
      kind: "limit";
      id: string;
      at: string;
      provider: ChatProvider;
      /** What the provider said. */
      message: string;
      window?: string;
      resetsAt?: string;
      status: "open" | "waiting" | "continued" | "resumed" | "dismissed";
      to?: ChatProvider;
    }
  | {
      /** The chat carries on with another provider from here (D-338): a divider in the transcript. */
      kind: "handoff";
      id: string;
      at: string;
      from: ChatProvider;
      to: ChatProvider;
      reason: ProviderSpan["reason"];
    }
  /** A build this chat asked for (jig_request_build); the card follows the build's status. */
  | { kind: "build"; id: string; at: string; buildId: string }
  | {
      /** Claude changed Jig's configuration from this chat (settings, layout, add-ons, a project). */
      kind: "change";
      id: string;
      at: string;
      summary: string;
      details: string[];
      /** How to put things back; absent when the change can't be undone. */
      undo?: ConfigUndo;
      undone?: boolean;
    };

/** What Undo applies for a `change` item. */
export type ConfigUndo =
  | { type: "settings"; patch: Record<string, unknown> }
  | { type: "layout"; layout: unknown }
  | { type: "addon"; id: string; enabled: boolean }
  /** A project's previous settings (`defaultRepo` for its default repository). */
  | { type: "project"; id: string; patch: Record<string, unknown> }
  | { type: "projectCreated"; id: string }
  | { type: "chat"; id: string; projectId?: string; pinned: boolean }
  /** A note saved for suggestions (Remove deletes it). */
  | { type: "evidence"; id: string }
  /** The profile before Claude changed it. */
  | { type: "profile"; text: string }
  /** One key of an add-on's stored data before Claude changed it (`existed: false`: delete it). */
  | {
      type: "addonData";
      id: string;
      key: string;
      value?: unknown;
      existed: boolean;
    };

/** Incremental transcript changes sent to the renderer (`sessions.update`). */
export type ChatUpdate =
  | { op: "upsert"; item: ChatItem }
  | { op: "append"; id: string; text: string }
  | { op: "meta"; meta: SessionMeta }
  | { op: "queue"; queue: QueuedMessage[] }
  /** Your parked messages (D-365): kept for you to send by hand, never sent by themselves. */
  | { op: "parked"; parked: QueuedMessage[] }
  /** The whole transcript changed (the conversation was rewound). */
  | { op: "reset"; items: ChatItem[] };

export interface QueuedMessage {
  id: string;
  text: string;
  attachments?: ChatAttachment[];
}

/**
 * A file sent with a message (pasted, dropped or attached), kept in `~/.jig/attachments/<session>/`:
 * an image or PDF (sent as is), or an Office or text file (sent as text).
 */
export interface ChatAttachment {
  path: string;
  mime: string;
  /** The original file name. */
  name?: string;
  kind?: "image" | "pdf" | "office" | "text";
}

export interface SessionSnapshot {
  meta: SessionMeta;
  items: ChatItem[];
  queue: QueuedMessage[];
  /** Messages you parked (D-365): saved with the chat, sent only when you send them. */
  parked: QueuedMessage[];
}

/** Engine events, normalised from Claude Code's SDK messages. */
export type EngineEvent =
  | {
      type: "init";
      engineSessionId: string;
      model: string;
      permissionMode: string;
      authSource: AuthSource;
      slashCommands: string[];
      mcpServers?: Array<{ name: string; status: string }>;
    }
  | {
      type: "block_start";
      id: string;
      block: "text" | "thinking";
      parentId?: string;
    }
  | { type: "block_delta"; id: string; text: string }
  | {
      type: "block_end";
      id: string;
      block: "text" | "thinking";
      text: string;
      parentId?: string;
      model?: string;
    }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
      parentId?: string;
      model?: string;
    }
  | {
      type: "tool_result";
      toolUseId: string;
      output: string;
      isError: boolean;
      /** Images the tool returned (a browser screenshot…), as the engine got them. */
      imageData?: Array<{ mime: string; data: string }>;
      /** The same images saved with the chat's attachments (set by the session manager). */
      images?: ChatAttachment[];
      diff?: string;
    }
  | {
      type: "permission";
      request: PermissionRequest;
      /** "Don't ask" mode: when Jig declines it if nobody answered (D-336). */
      declineAt?: string;
    }
  | {
      type: "permission_resolved";
      requestId: string;
      status: "allowed" | "always" | "denied" | "cancelled";
      /** Declined because nobody answered in time (D-336). */
      timedOut?: boolean;
    }
  | {
      type: "result";
      ok: boolean;
      durationMs: number;
      totalCostUsd?: number;
      usage?: Usage;
      modelUsage?: Record<string, ModelUsage>;
      numTurns?: number;
      error?: string;
      /** The user stopped the turn (not an error). */
      stopped?: boolean;
      chainUuid?: string;
    }
  | { type: "status"; status: "compacting" | "requesting" | null }
  /** `key`: a later notice with the same key replaces the earlier one. */
  | {
      type: "notice";
      text: string;
      tone: "info" | "warning" | "danger";
      key?: string;
    }
  /** What a Claude Code command printed (`/cost`, `/mcp`, a custom command's output…). */
  | { type: "command_output"; id: string; text: string }
  /** A subagent or background command started, progressed or finished. */
  | { type: "task"; task: TaskInfo; toolUseId?: string }
  | { type: "background_tasks"; tasks: BackgroundTask[] }
  /** The slash commands and skills changed (a plugin or skill was added). */
  | { type: "commands"; commands: SlashCommandInfo[] }
  /** Claude Code suggests the user's next message (prompt suggestions). */
  | { type: "suggestion"; text: string }
  /** Claude Code compacted the conversation (`/compact`, or automatically when the window was full). */
  | {
      type: "compacted";
      trigger: "manual" | "auto";
      preTokens: number;
      postTokens?: number;
    }
  | {
      type: "error";
      message: string;
      code?: "not_signed_in" | "process" | "billing" | "rate_limit";
      /** `rate_limit`: the plan's window that ran out and when it resets, when the provider says (D-338). */
      window?: string;
      resetsAt?: string;
    }
  | {
      /** Claude Code reported plan rate-limit state (a warning, or a window used up). */
      type: "rate_limit";
      status: "allowed" | "allowed_warning" | "rejected";
      window?: string;
      resetsAt?: string;
    }
  | { type: "exit" };
