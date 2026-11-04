import { maskSecrets } from "@jig/learning";
import type { ChatItem, PermissionDecision, PermissionRequest, SessionMeta } from "../../shared/engine";

/**
 * What Jig says to your phone and how it reads what you send back (D-348). Pure: the service sends
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
 * The message for a chat whose turn ended: finished (with its last reply) or stopped with an error.
 * Only for changes away from working, as desktop notifications (never on loading or restarting).
 */
export function statusMessage(
  previous: SessionMeta["status"] | undefined,
  meta: SessionMeta,
  reply: string | undefined,
  finished: boolean,
): OutMessage | undefined {
  if (meta.kind === "builder" || previous === meta.status) return undefined;
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
  | { kind: "chat"; sessionId: string };

export function parseTap(data: string): Tap | undefined {
  const permission = /^p:([\w-]+):([ad])$/.exec(data);
  if (permission) return { kind: "permission", key: permission[1]!, allow: permission[2] === "a" };
  const option = /^q:([\w-]+):(\d+)$/.exec(data);
  if (option) return { kind: "option", key: option[1]!, index: Number(option[2]) };
  const chat = /^c:([\w-]+)$/.exec(data);
  if (chat) return { kind: "chat", sessionId: chat[1]! };
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
export function chatPicker(chats: SessionMeta[], current: string | undefined, max = 8): OutMessage {
  const rank = (m: SessionMeta) =>
    m.status === "needs_you" ? 0 : m.status === "working" || m.status === "starting" ? 1 : 2;
  const list = chats
    .filter((m) => !m.draft && m.kind !== "builder")
    .sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, max);
  if (!list.length) return { text: "No chats yet. Start one in Jig on your computer." };
  return {
    text: "Which chat? Your next messages go to the one you pick.",
    buttons: list.map((m) => [
      {
        text: `${m.id === current ? "• " : ""}${STATUS_MARK[m.status] ? `${STATUS_MARK[m.status]} ` : ""}${m.title.slice(0, 50)}`,
        data: `c:${m.id}`,
      },
    ]),
  };
}

export const HELP =
  "This is Jig on your phone.\n\n• Jig messages you here when a chat needs you, finishes or stops while you're away from the computer.\n• Reply to one of its messages to answer that chat, or just write: it goes to the last chat Jig told you about.\n• /chats picks the chat your messages go to.";

/** The help when your bot has topics: one per project, and Jig's own. */
export const HELP_TOPICS =
  "This is Jig on your phone.\n\n• Each project has its own topic here; chats without a project and Jig itself write in Jig.\n• Jig messages you when a chat needs you, finishes or stops while you're away from the computer.\n• Reply to one of its messages to answer that chat, or just write in the topic: it goes to the last chat that wrote there.\n• /chats in a topic picks the chat your messages there go to.";

/** The digits in what you sent ("123456", "123 456"). */
export const codeIn = (text: string) => text.replace(/\D/g, "");
