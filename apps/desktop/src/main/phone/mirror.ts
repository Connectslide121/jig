import type { ChatItem } from "../../shared/engine";
import { escapeHtml, toTelegramHtml } from "./messages";

/**
 * A chat's room on your phone (D-350): its replies as the phone markup (D-377), cut into messages
 * every channel takes, and its tool steps as short lines. Pure: the service sends and edits them
 * through the channel.
 */

/** Jig's own answer on the phone, marked as AI, its Markdown as the phone markup (the end kept when long). */
export const conciergeReply = (text: string, max = 3500) =>
  `🤖 <b>Jig</b> · AI\n\n${toTelegramHtml(text.length > max ? `…${text.slice(-(max - 1))}` : text)}`;

/** Telegram allows 4,096 characters per message (Teams far more); HTML tags count, so leave room. */
export const ROOM_CHUNK = 3500;

/**
 * Markdown cut into pieces of at most `max` characters, at paragraph or line breaks, never inside a
 * code block when a block fits; a longer block is cut into blocks of its own.
 */
export function chunkMarkdown(text: string, max = ROOM_CHUNK): string[] {
  const blocks = text.split(/(```[^\n]*\n[\s\S]*?(?:```|$))/g).filter((b) => b !== "");
  const pieces: string[] = [];
  for (const block of blocks) {
    if (block.length <= max) {
      pieces.push(block);
      continue;
    }
    const fence = /^```([^\n]*)\n([\s\S]*?)(?:```)?$/.exec(block);
    const body = fence ? fence[2]! : block;
    const room = fence ? max - 8 - fence[1]!.length : max;
    let rest = body;
    while (rest.length > room) {
      const cut = Math.max(rest.lastIndexOf("\n\n", room), rest.lastIndexOf("\n", room));
      const at = cut > room / 2 ? cut : room;
      pieces.push(fence ? `\`\`\`${fence[1]}\n${rest.slice(0, at)}\n\`\`\`` : rest.slice(0, at));
      rest = rest.slice(at).replace(/^\n+/, "");
    }
    if (rest) pieces.push(fence ? `\`\`\`${fence[1]}\n${rest}\n\`\`\`` : rest);
  }
  // Join small neighbours back up to `max`.
  const out: string[] = [];
  for (const piece of pieces) {
    const last = out.at(-1);
    if (last !== undefined && last.length + piece.length <= max) out[out.length - 1] = last + piece;
    else out.push(piece);
  }
  return out.map((p) => p.trim()).filter(Boolean);
}

type ToolItem = Extract<ChatItem, { kind: "tool" }>;

/** A tool step in a few words: its name and what it works on. */
export function stepLine(item: ToolItem): string {
  const name = item.name.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, "");
  const input = item.input ?? {};
  const pick = [input.file_path, input.path, input.command, input.url, input.pattern, input.description].find(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
  const what = !pick
    ? ""
    : pick === input.url
      ? pick.replace(/^https?:\/\//, "")
      : pick === input.file_path || pick === input.path
        ? pick.split(/[\\/]/).pop()!
        : pick;
  const mark = item.status === "running" ? "⏳" : item.status === "error" ? "⚠️" : "✓";
  return `${mark} ${escapeHtml(name)}${what ? ` <code>${escapeHtml(what.slice(0, 60))}</code>` : ""}`;
}

/** The steps message of a turn: the last few steps, and how many came before. */
export function stepsMessage(lines: string[], done: boolean, max = 6): string {
  const shown = lines.slice(-max);
  const hidden = lines.length - shown.length;
  const head = done ? `🔧 ${lines.length} step${lines.length === 1 ? "" : "s"}` : "🔧 Working…";
  return `${head}${hidden ? `\n<i>…${hidden} earlier</i>` : ""}\n${shown.join("\n")}`;
}

/** The last turns of a chat, oldest first: your messages and Claude's replies (no steps). */
export function historyItems(items: ChatItem[], turns = 4): ChatItem[] {
  const out: ChatItem[] = [];
  let seen = 0;
  for (let i = items.length - 1; i >= 0 && seen < turns; i--) {
    const item = items[i]!;
    if (item.kind === "assistant" && !item.parentId && item.text.trim()) out.unshift(item);
    if (item.kind === "user") {
      out.unshift(item);
      seen++;
    }
  }
  return out;
}

/** One message of a room: text (sent, then edited as it grows) or a picture (sent once). */
export interface RoomPiece {
  key: string;
  text?: string;
  photo?: string;
}

const isImage = (a: { mime?: string; path: string }) =>
  /^image\/(png|jpe?g)$/.test(a.mime ?? "") || /\.(png|jpe?g)$/i.test(a.path);

/**
 * What a chat's room shows for the items after it opened (`known` were there before): your messages
 * from the computer, Claude's replies cut to fit, its steps grouped between replies, and every
 * picture (screenshots Claude took, images you attached). `skip`: your messages sent from the phone.
 */
export function roomPieces(
  items: ChatItem[],
  known: ReadonlySet<string>,
  skip: ReadonlySet<string>,
  working: boolean,
): RoomPiece[] {
  const pieces: RoomPiece[] = [];
  let group: { key: string; lines: string[] } | undefined;
  const closeGroup = (done: boolean) => {
    if (group) pieces.push({ key: group.key, text: stepsMessage(group.lines, done) });
    group = undefined;
  };
  for (const item of items) {
    if (known.has(item.id)) continue;
    if (item.kind === "user") {
      closeGroup(true);
      if (!skip.has(item.id) && item.text.trim())
        pieces.push({
          key: `u:${item.id}`,
          text: `🖥 <i>You, on the computer:</i>\n${toTelegramHtml(item.text)}`,
        });
      for (const a of [...(item.attachments ?? []), ...(item.images ?? [])])
        if (isImage(a)) pieces.push({ key: `p:${a.path}`, photo: a.path });
    } else if (item.kind === "assistant" && !item.parentId && item.text.trim()) {
      closeGroup(true);
      chunkMarkdown(item.text).forEach((chunk, i) => {
        pieces.push({ key: `a:${item.id}:${i}`, text: toTelegramHtml(chunk) });
      });
    } else if (item.kind === "tool" && !item.parentId) {
      group ??= { key: `s:${item.id}`, lines: [] };
      group.lines.push(stepLine(item));
      for (const a of item.images ?? [])
        if (isImage(a)) {
          // The step's picture right after its line: close the group so the order stays.
          closeGroup(true);
          pieces.push({ key: `p:${a.path}`, photo: a.path });
        }
    }
  }
  closeGroup(!working);
  return pieces;
}
