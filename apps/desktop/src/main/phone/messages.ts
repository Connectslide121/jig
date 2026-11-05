import { maskSecrets } from "@jig/learning";
import type { ChatItem, PermissionDecision, PermissionRequest, SessionMeta } from "../../shared/engine";

/**
 * What Jig says to your phone and how it reads what you send back (D-350). Pure: the service sends
 * these through Telegram. Text is Telegram HTML; everything from a chat is masked and escaped.
 */

export interface Button {
  text: string;
  /** Telegram allows at most 64 bytes. */
  data: string;
}

export interface OutMessage {
  text: string;
  /** Rows of buttons under the message. */
  buttons?: Button[][];
  /** Arrives without a sound (it's news, not something waiting for you). */
  silent?: boolean;
}

export type PermissionItem = Extract<ChatItem, { kind: "permission" }>;

interface Question {
  question: string;
  multiSelect?: boolean;
  options?: Array<{ label: string }>;
}

const MAX_EXCERPT = 1500;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Chat text for the phone: secrets masked, at most `max` characters (the end kept), escaped. */
export function excerpt(text: string, max = MAX_EXCERPT): string {
  const masked = maskSecrets(text.trim());
  const cut = masked.length > max ? `…${masked.slice(masked.length - max + 1)}` : masked;
  return escapeHtml(cut);
}

/** The user's own chats: not the builder's, not Jig's own chat on the phone. */
export const isUserChat = (m: Pick<SessionMeta, "kind">) => !m.kind || m.kind === "chat";

/** Jig's own answer on the phone, marked as AI. */
export const conciergeReply = (text: string) => `🤖 <b>Jig</b> · AI\n\n${excerpt(text, 3500)}`;

export const chatTitle = (meta: Pick<SessionMeta, "title">) =>
  escapeHtml(meta.title.length > 80 ? `${meta.title.slice(0, 79)}…` : meta.title);

/** The last thing Claude (or ChatGPT) said in a chat since your last message, if anything. */
export function lastReply(items: ChatItem[]): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.kind === "user") return undefined;
    if (item.kind === "assistant" && !item.parentId && item.text.trim()) return item.text;
  }
  return undefined;
}

/**
 * A reply as something to read aloud: no code, no Markdown marks, at most `max` characters (cut at a
 * sentence). Undefined when nothing is left to say.
 */
export function speakable(text: string, max = 1200): string | undefined {
  const plain = text
    .replace(/```[\s\S]*?(```|$)/g, " (code) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "a link")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>|]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return undefined;
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return `${end > max / 2 ? cut.slice(0, end + 1) : cut}…`;
}

/** This turn (since your last message) used Claude's browser: its page is worth a screenshot. */
export function usedBrowser(items: ChatItem[]): boolean {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.kind === "user") return false;
    if (item.kind === "tool" && item.name.includes("jig_browser_")) return true;
  }
  return false;
}

/**
 * The message for a chat whose turn ended: finished (with its last reply) or stopped with an error.
 * Only for changes away from working, as desktop notifications (never on loading or restarting).
 */
export function statusMessage(
  previous: SessionMeta["status"] | undefined,
  meta: SessionMeta,
  reply: string | undefined,
  finished: boolean,
): OutMessage | undefined {
  if (!isUserChat(meta) || previous === meta.status) return undefined;
  if (previous !== "working" && previous !== "starting") return undefined;
  if (meta.status === "idle" && finished)
    return {
      text: `✅ <b>Finished</b> · ${chatTitle(meta)}${reply ? `\n\n${excerpt(reply)}` : ""}\n\n<i>Reply to this message to answer.</i>`,
      silent: true,
    };
  if (meta.status === "error")
    return {
      text: `⚠️ <b>Stopped</b> · ${chatTitle(meta)}\n\n${excerpt(meta.lastError?.split("\n")[0] ?? "The turn ended with an error.", 400)}`,
    };
  return undefined;
}

const questionsOf = (request: PermissionRequest) =>
  (Array.isArray(request.input.questions) ? request.input.questions : []) as Question[];

/** A question with one choice: its options become buttons and a typed reply is its answer. */
export function singleQuestion(request: PermissionRequest): Question | undefined {
  if (request.toolName !== "AskUserQuestion") return undefined;
  const questions = questionsOf(request);
  const only = questions[0];
  return questions.length === 1 && only && !only.multiSelect ? only : undefined;
}

/** What Claude wants to do beyond its sentence: the command, file or address. */
function requestDetail(request: PermissionRequest): string {
  const input = request.input;
  const detail = [input.command, input.file_path, input.url, input.description].find(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
  return detail ? `\n<pre>${excerpt(detail, 600)}</pre>` : "";
}

/**
 * The message for something waiting for you: a question (its options as buttons), a plan (Approve /
 * Keep planning) or a permission (Allow / Deny). `key` names it in the buttons' data.
 */
export function permissionMessage(
  meta: Pick<SessionMeta, "title">,
  item: PermissionItem,
  key: string,
): OutMessage {
  const request = item.request;
  if (request.toolName === "AskUserQuestion") {
    const head = `❓ <b>Question</b> · ${chatTitle(meta)}`;
    const one = singleQuestion(request);
    if (one)
      return {
        text: `${head}\n\n${excerpt(one.question, 600)}\n\n<i>Pick one, or reply to this message with your own answer.</i>`,
        buttons: (one.options ?? [])
          .slice(0, 8)
          .map((o, i) => [{ text: o.label.slice(0, 60), data: `q:${key}:${i}` }]),
      };
    const lines = questionsOf(request).map(
      (q, i) =>
        `${i + 1}. ${excerpt(q.question, 300)}${q.options?.length ? `\n    ${escapeHtml(q.options.map((o) => o.label).join(" · "))}` : ""}`,
    );
    return {
      text: `${head}\n\n${lines.join("\n")}\n\n<i>Reply to this message with your answers.</i>`,
      buttons: [[{ text: "Skip", data: `p:${key}:d` }]],
    };
  }
  if (request.toolName === "ExitPlanMode") {
    const plan = typeof request.input.plan === "string" ? request.input.plan : "";
    return {
      text: `📋 <b>Plan ready</b> · ${chatTitle(meta)}${plan ? `\n\n${excerpt(plan)}` : ""}\n\n<i>Reply to this message to change it.</i>`,
      buttons: [
        [
          { text: "Approve", data: `p:${key}:a` },
          { text: "Keep planning", data: `p:${key}:d` },
        ],
      ],
    };
  }
  const sentence = request.title ?? `Claude wants to use ${request.toolName}`;
  return {
    text: `🔐 <b>Needs you</b> · ${chatTitle(meta)}\n\n${escapeHtml(sentence)}${requestDetail(request)}\n\n<i>Reply to this message to say what to do instead.</i>`,
    buttons: [
      [
        { text: "Allow", data: `p:${key}:a` },
        { text: "Deny", data: `p:${key}:d` },
      ],
    ],
  };
}

/** What a tapped button asks for. */
export type Tap =
  | { kind: "permission"; key: string; allow: boolean }
  | { kind: "option"; key: string; index: number }
  | { kind: "chat"; sessionId: string }
  | { kind: "open"; sessionId: string }
  | { kind: "queue"; action: "q" | "p" | "r"; projectId: string };

export function parseTap(data: string): Tap | undefined {
  const permission = /^p:([\w-]+):([ad])$/.exec(data);
  if (permission) return { kind: "permission", key: permission[1]!, allow: permission[2] === "a" };
  const option = /^q:([\w-]+):(\d+)$/.exec(data);
  if (option) return { kind: "option", key: option[1]!, index: Number(option[2]) };
  const chat = /^c:([\w-]+)$/.exec(data);
  if (chat) return { kind: "chat", sessionId: chat[1]! };
  const open = /^o:([\w-]+)$/.exec(data);
  if (open) return { kind: "open", sessionId: open[1]! };
  const queue = /^k:([qpr]):([\w-]+)$/.exec(data);
  if (queue) return { kind: "queue", action: queue[1] as "q" | "p" | "r", projectId: queue[2]! };
  return undefined;
}

/** The decision a button gives: Allow / Approve, or Deny / Keep planning / Skip with Claude's reason. */
export function tapDecision(request: PermissionRequest, allow: boolean): PermissionDecision {
  if (allow) return { behavior: "allow" };
  if (request.toolName === "ExitPlanMode")
    return { behavior: "deny", message: "The user wants to keep planning." };
  if (request.toolName === "AskUserQuestion")
    return { behavior: "deny", message: "The user skipped the question." };
  return { behavior: "deny", message: "The user denied this from their phone." };
}

/** The decision for an option you tapped under a one-choice question. */
export function optionDecision(request: PermissionRequest, index: number): PermissionDecision | undefined {
  const question = singleQuestion(request);
  const option = question?.options?.[index];
  if (!question || !option) return undefined;
  return {
    behavior: "allow",
    updatedInput: { ...request.input, answers: { [question.question]: option.label } },
  };
}

/**
 * Text you sent while something waits in that chat: a one-choice question takes it as its answer;
 * anything else is declined with your words, so Claude reads them and carries on (as typing instead
 * of approving does in Claude Code).
 */
export function replyDecision(request: PermissionRequest, text: string): PermissionDecision {
  const question = singleQuestion(request);
  if (question)
    return { behavior: "allow", updatedInput: { ...request.input, answers: { [question.question]: text } } };
  if (request.toolName === "AskUserQuestion")
    return { behavior: "deny", message: `The user answered from their phone: ${text}` };
  if (request.toolName === "ExitPlanMode")
    return { behavior: "deny", message: `The user wants changes to the plan: ${text}` };
  return { behavior: "deny", message: `The user replied from their phone instead of approving: ${text}` };
}

/** The line added to a waiting message (its buttons removed) once it is answered. */
export function answeredLine(item: PermissionItem, where: "phone" | "computer"): string {
  const tool = item.request.toolName;
  if (item.status === "pending") return "";
  if (item.status === "cancelled")
    return item.timedOut ? "\n\n<b>Declined:</b> nobody answered in time." : "\n\n<b>No longer waiting.</b>";
  const how =
    item.status === "denied"
      ? tool === "ExitPlanMode"
        ? "Kept planning"
        : tool === "AskUserQuestion"
          ? "Skipped"
          : "Denied"
      : tool === "AskUserQuestion"
        ? "Answered"
        : tool === "ExitPlanMode"
          ? "Approved"
          : "Allowed";
  return `\n\n<b>${how}</b>${where === "computer" ? " on the computer" : ""}.`;
}

const STATUS_MARK: Partial<Record<SessionMeta["status"], string>> = {
  needs_you: "❓",
  working: "⏳",
  starting: "⏳",
  error: "⚠️",
};

/** The chats you can talk to from the phone: needing you first, then working, then the latest. */
export function chatPicker(
  chats: SessionMeta[],
  current: string | undefined,
  max = 8,
  jig = false,
  /** Buttons open the chat as a room (topics) instead of sending your messages there. */
  rooms = false,
): OutMessage {
  const rank = (m: SessionMeta) =>
    m.status === "needs_you" ? 0 : m.status === "working" || m.status === "starting" ? 1 : 2;
  const list = chats
    .filter((m) => !m.draft && isUserChat(m))
    .sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, max);
  const back = jig ? [[{ text: `${current ? "" : "• "}🤖 Jig itself`, data: "c:jig" }]] : [];
  if (!list.length)
    return { text: "No chats yet. Start one in Jig on your computer, or ask Jig to.", buttons: back };
  return {
    text: rooms
      ? "Which chat? It opens in a topic of its own, live, and you write to it there."
      : "Which chat? Your next messages here go to the one you pick.",
    buttons: [
      ...back,
      ...list.map((m) => [
        {
          text: `${m.id === current ? "• " : ""}${STATUS_MARK[m.status] ? `${STATUS_MARK[m.status]} ` : ""}${m.title.slice(0, 50)}`,
          data: `${rooms ? "o" : "c"}:${m.id}`,
        },
      ]),
    ],
  };
}

/** A project's Tasks queue as the phone shows it (the Tasks add-on's `list`). */
export interface QueueView {
  running: boolean;
  tasks: Array<{ title: string; status: string; report?: { summary?: string } }>;
}

export interface ProjectInfo {
  id: string;
  name: string;
}

/** A project's queue counts (the Tasks add-on's `overview`). */
export interface QueueCounts {
  projectId: string;
  queued: number;
  active: number;
  needsYou: number;
  running: boolean;
}

const TASK_MARK: Record<string, string> = {
  done: "✅",
  partial: "◐",
  failed: "❌",
  error: "❌",
  blocked: "⛔",
  no_report: "✅",
  running: "⏳",
  needs_you: "❓",
  queued: "▫️",
  skipped: "⏭",
};
const FINISHED = new Set(["done", "partial", "failed", "error", "blocked", "no_report", "skipped"]);

/** What each project is doing: its chats working or waiting for you, and its queue. */
export function overviewMessage(
  projects: ProjectInfo[],
  chats: SessionMeta[],
  queues: QueueCounts[],
): OutMessage {
  const live = chats.filter((m) => !m.draft && isUserChat(m));
  const lines: string[] = [];
  const buttons: Button[][] = [];
  const rows = [...projects, { id: "", name: "No project" }];
  for (const p of rows) {
    const mine = live.filter((m) => (m.projectId ?? "") === p.id);
    const working = mine.filter((m) => m.status === "working" || m.status === "starting").length;
    const waiting = mine.filter((m) => m.status === "needs_you");
    const queue = queues.find((q) => q.projectId === p.id);
    const queued = queue ? queue.queued + queue.active : 0;
    if (!working && !waiting.length && !queued) continue;
    const parts = [
      working ? `${working} working` : "",
      waiting.length ? `❓ ${waiting.length} need${waiting.length === 1 ? "s" : ""} you` : "",
      queued ? `queue ${queue!.running ? "▶" : "⏸"} ${queued} left` : "",
    ].filter(Boolean);
    lines.push(`<b>${escapeHtml(p.name)}</b> · ${parts.join(" · ")}`);
    for (const m of waiting) lines.push(`   ❓ ${chatTitle(m)}`);
    if (queued && p.id) buttons.push([{ text: `Queue · ${p.name.slice(0, 40)}`, data: `k:q:${p.id}` }]);
  }
  if (!lines.length) return { text: "😴 Nothing is running and nothing waits for you." };
  return { text: `📊 <b>Status</b>\n\n${lines.join("\n")}`, buttons };
}

/** A project's queue: where it is, each task with its outcome, and Pause or Resume. */
export function queueMessage(project: ProjectInfo, queue: QueueView, max = 15): OutMessage {
  const tasks = queue.tasks;
  if (!tasks.length) return { text: `The queue of <b>${escapeHtml(project.name)}</b> is empty.` };
  const done = tasks.filter((t) => FINISHED.has(t.status)).length;
  const head = `📋 <b>Queue · ${escapeHtml(project.name)}</b> · ${queue.running ? "running" : "paused"}, ${done} of ${tasks.length} done`;
  // The finished ones last in, the rest in order: what matters now first.
  const shown =
    tasks.length > max
      ? [
          ...tasks.filter((t) => !FINISHED.has(t.status)),
          ...tasks.filter((t) => FINISHED.has(t.status)).slice(-3),
        ].slice(0, max)
      : tasks;
  const lines = shown.map((t) => {
    const summary =
      t.report?.summary && t.status !== "done" ? `\n      ${excerpt(t.report.summary, 160)}` : "";
    return `${TASK_MARK[t.status] ?? "•"} ${escapeHtml(t.title.slice(0, 80))}${summary}`;
  });
  const more = tasks.length > shown.length ? `\n…and ${tasks.length - shown.length} more` : "";
  const open = tasks.some((t) => !FINISHED.has(t.status));
  return {
    text: `${head}\n\n${lines.join("\n")}${more}`,
    ...(open
      ? {
          buttons: [
            [
              queue.running
                ? { text: "⏸ Pause", data: `k:p:${project.id}` }
                : { text: "▶ Resume", data: `k:r:${project.id}` },
            ],
          ],
        }
      : {}),
  };
}

/** Which project you meant: the topic you wrote in, else a name you typed ("/queue podium"). */
export function findProject(projects: ProjectInfo[], words: string): ProjectInfo | undefined {
  const w = words.trim().toLowerCase();
  if (!w) return undefined;
  return (
    projects.find((p) => p.name.toLowerCase() === w) ??
    projects.find((p) => p.name.toLowerCase().startsWith(w)) ??
    projects.find((p) => p.name.toLowerCase().includes(w))
  );
}

/** Buttons to pick a project for a command (`k:q:`, `k:p:`, `k:r:`). */
export function projectPicker(projects: ProjectInfo[], action: "q" | "p" | "r", text: string): OutMessage {
  return {
    text,
    buttons: projects.slice(0, 10).map((p) => [{ text: p.name.slice(0, 50), data: `k:${action}:${p.id}` }]),
  };
}

export const HELP =
  "This is Jig on your phone.\n\n• Jig messages you here when a chat needs you, finishes or stops while you're away from the computer.\n• Reply to one of its messages to answer that chat.\n• Write anything else and Jig itself answers: how things are going, or start a chat in a project (\"Podium: look at card 29992 and make a plan\").\n• /chats sends what you write to one chat instead.\n\n/status what every project is doing\n/queue a project's task queue (/queue podium)\n/pause and /resume a queue\n/screen a screenshot of Jig on your computer";

/** The help when your bot has topics: one per project, and Jig's own. */
export const HELP_TOPICS =
  "This is Jig on your phone.\n\n• Each project has its own topic here; chats without a project write in Jig.\n• Jig messages you when a chat needs you, finishes or stops while you're away from the computer.\n• Reply to one of its messages to answer that chat.\n• Write anything else and Jig itself answers, in that topic: how things are going, or start a chat (\"look at card 29992 and make a plan\"). In a project's topic it means that project.\n• /chats in a topic sends what you write there to one chat instead.\n\n/status what every project is doing\n/queue a project's task queue (/queue podium)\n/pause and /resume a queue\n/screen a screenshot of Jig on your computer";

/** The digits in what you sent ("123456", "123 456"). */
export const codeIn = (text: string) => text.replace(/\D/g, "");
