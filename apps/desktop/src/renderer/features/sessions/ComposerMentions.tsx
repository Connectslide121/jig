import { CalendarDays, MessagesSquare, User, Users, Video, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TeamsChatSummary } from "../../../shared/meetingChat";
import { call } from "../../lib/host";
import { cn, FileIcon } from "../../ui";
import { formatShortcut } from "../../workbench/shortcuts";
import { PersonPhoto } from "../meetings/photo";
import { openPreview } from "../preview/actions";
import type { Mention } from "./composerInput";

/** Where a mentioned path is: relative to the chat's folder, unless it is absolute already. */
export function mentionPath(cwd: string, value: string): string {
  if (/^([a-z]:[\\/]|[\\/])/i.test(value)) return value;
  const sep = cwd.includes("\\") ? "\\" : "/";
  return `${cwd.replace(/[\\/]+$/, "")}${sep}${value.replace(/[\\/]+$/, "").replaceAll("/", sep)}`;
}

/**
 * The mentions that point at something: files that exist (asked once per path), folders and meetings.
 * A half-typed `@src/ca` or a typo is not highlighted, so only real links look like links.
 */
export function useLiveMentions(cwd: string, mentions: Mention[]): Mention[] {
  const [exists, setExists] = useState<Record<string, boolean>>({});
  const files = mentions.filter((m) => m.kind === "file").map((m) => m.value);
  const unknown = files.filter((f) => !(f in exists));
  const key = unknown.join("\n");
  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(() => {
      for (const value of key.split("\n"))
        void call("files.stat", { path: mentionPath(cwd, value) })
          .then((info) => setExists((e) => ({ ...e, [value]: Boolean(info) })))
          .catch(() => setExists((e) => ({ ...e, [value]: false })));
    }, 150);
    return () => clearTimeout(timer);
  }, [key, cwd]);
  return useMemo(() => mentions.filter((m) => m.kind !== "file" || exists[m.value]), [mentions, exists]);
}

/** Teams chats by short id, from the `@` picker, for the chips (D-333). */
const chatNames = new Map<string, { name: string; kind: TeamsChatSummary["kind"]; peerId?: string }>();
export function rememberChatName(
  short: string,
  chat: { name: string; kind: TeamsChatSummary["kind"]; peerId?: string },
): void {
  chatNames.set(short, chat);
}

/** A Teams chat in the `@` picker and its chip: the person's picture, or the group's or meeting's icon. */
export function ChatMentionIcon({ kind, peerId }: { kind?: TeamsChatSummary["kind"]; peerId?: string }) {
  const Icon = kind === "meeting" ? CalendarDays : kind === "group" ? Users : kind ? User : MessagesSquare;
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full text-muted",
        kind === "oneOnOne" && "bg-raised",
      )}
    >
      <Icon className={kind === "oneOnOne" ? "size-3" : "size-3.5"} />
      {kind === "oneOnOne" && peerId && <PersonPhoto id={peerId} />}
    </span>
  );
}

/**
 * Opens what a mention points at: a file in Preview, a folder in the file manager, a meeting in
 * Meetings, a Teams chat in the Meetings lobby.
 */
export function openMention(cwd: string, mention: Mention): void {
  if (mention.kind === "chat") void call("meetings.open").catch(() => undefined);
  else if (mention.kind === "meeting")
    void call("meetings.open", { tab: "meetings", select: mention.value }).catch(() => undefined);
  else if (mention.kind === "folder") void call("app.openPath", { path: mentionPath(cwd, mention.value) });
  else openPreview(mentionPath(cwd, mention.value));
}

function label(mention: Mention): string {
  if (mention.kind === "chat") return chatNames.get(mention.value)?.name ?? mention.name ?? "Teams chat";
  if (mention.kind !== "meeting") return mention.value.replace(/\/$/, "").split("/").pop() || mention.value;
  return "Meeting";
}

/**
 * Drawn behind the message box's text, in the same font and wrapping: a highlight under each live
 * mention. The text itself stays the textarea's, so typing, selecting and the caret work as before.
 */
export function MentionHighlights({
  text,
  mentions,
  scrollTop,
}: {
  text: string;
  mentions: Mention[];
  scrollTop: number;
}) {
  if (mentions.length === 0) return null;
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const m of mentions) {
    parts.push(text.slice(at, m.start));
    parts.push(
      <mark key={m.start} className="rounded-sm bg-accent-soft text-transparent underline decoration-accent">
        {text.slice(m.start, m.end)}
      </mark>,
    );
    at = m.end;
  }
  // A trailing new line needs a character after it to take up its line, as in the textarea.
  parts.push(`${text.slice(at)}​`);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden px-1.5 py-1 text-sm whitespace-pre-wrap break-words text-transparent"
      data-testid="composer-highlights"
    >
      <div style={{ transform: `translateY(${-scrollTop}px)` }}>{parts}</div>
    </div>
  );
}

/** A chip per live mention, above the message box: click opens it, × takes it out of the message. */
export function MentionChips({
  cwd,
  mentions,
  onRemove,
}: {
  cwd: string;
  mentions: Mention[];
  onRemove: (mention: Mention) => void;
}) {
  if (mentions.length === 0) return null;
  const seen = new Set<string>();
  const unique = mentions.filter(
    (m) => !seen.has(`${m.kind}:${m.value}`) && seen.add(`${m.kind}:${m.value}`),
  );
  const click = formatShortcut("Mod+Click");
  return (
    <div className="flex flex-wrap gap-1 px-1 pt-1" data-testid="composer-mentions">
      {unique.map((m) => (
        <div
          key={`${m.kind}:${m.value}`}
          className="flex h-6 max-w-56 items-center rounded-md border border-line bg-surface text-xs hover:border-accent"
          data-testid="composer-mention"
          data-kind={m.kind}
        >
          <button
            type="button"
            title={
              m.kind === "chat"
                ? `Teams chat: ${label(m)}. Jig reads it when you send (${click} to open Meetings)`
                : m.kind === "meeting"
                  ? `Open the meeting in Meetings (or ${click} it in the message)`
                  : `Open ${m.value} (or ${click} it in the message)`
            }
            onClick={() => openMention(cwd, m)}
            className="flex h-full min-w-0 items-center gap-1.5 rounded-l-md pl-2 pr-1 text-fg hover:bg-hover"
          >
            {m.kind === "chat" ? (
              <ChatMentionIcon {...chatNames.get(m.value)} />
            ) : m.kind === "meeting" ? (
              <Video className="size-3.5 shrink-0 text-muted" />
            ) : (
              <FileIcon path={m.value} folder={m.kind === "folder"} className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{label(m)}</span>
          </button>
          <button
            type="button"
            title="Take it out of the message"
            aria-label={`Remove the mention of ${label(m)}`}
            onClick={() => onRemove(m)}
            className="flex size-6 shrink-0 items-center justify-center rounded-r-md text-muted hover:bg-hover hover:text-fg"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
