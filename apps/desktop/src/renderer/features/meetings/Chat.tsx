import { MessagesSquare, SendHorizontal, ShieldCheck } from "lucide-react";
import { Fragment, type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  type ChatGroup,
  chatTimeline,
  type MeetingChatMessage,
  type MeetingChatState,
} from "../../../shared/meetingChat";
import { call } from "../../lib/host";
import { Button, cn, Empty, IconButton, Input, type MenuEntry, Spinner } from "../../ui";
import { clock, dayAndTime, initials } from "./format";
import { PanelHeader } from "./Panels";
import { PersonPhoto } from "./photo";

export interface ChatStatus {
  state: MeetingChatState;
  error?: string;
}

const URL_PART = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])/g;
/** What Jig shows for a picture or file it can't show itself. */
const PLACEHOLDER = /(\((?:image|attachment)\))/g;

/** A message's text with its web links clickable (opened in your browser) and placeholders muted. */
function MessageText({ text }: { text: string }) {
  const parts = text.split(URL_PART);
  return parts.map((part, i) =>
    i % 2 === 0 ? (
      <Fragment key={i}>
        {part.split(PLACEHOLDER).map((piece, j) =>
          j % 2 ? (
            <span key={j} className="text-muted italic">
              {piece}
            </span>
          ) : (
            piece
          ),
        )}
      </Fragment>
    ) : (
      <a
        key={i}
        href={part}
        className="text-accent underline underline-offset-2 hover:text-accent-hover"
        onClick={(e) => {
          e.preventDefault();
          void call("app.openExternal", { url: part }).catch(() => undefined);
        }}
      >
        {part}
      </a>
    ),
  );
}

/**
 * One sender's run of messages as bubbles (D-327): yours on the right in the accent's tint, everyone
 * else's on the left in the surface's, with their picture and name on the first one only. The corner
 * toward the sender is squared on the first bubble and softened between bubbles of one group.
 */
function Group({ group }: { group: ChatGroup }) {
  const { mine } = group;
  const count = group.messages.length;
  const bubbles = group.messages.map((m, i) => (
    <div
      key={m.id}
      data-message-id={m.id}
      className={cn(
        "selectable relative min-w-0 rounded-2xl px-3 py-1.5 text-sm leading-relaxed text-fg",
        mine ? "max-w-17/20 bg-accent-soft @md:max-w-7/10" : "max-w-full bg-raised @md:max-w-7/10",
        mine
          ? cn(i === 0 ? "rounded-tr-sm" : "rounded-tr-md", i < count - 1 && "rounded-br-md")
          : cn(i === 0 ? "rounded-tl-sm" : "rounded-tl-md", i < count - 1 && "rounded-bl-md"),
      )}
    >
      <p className="wrap-anywhere whitespace-pre-wrap">
        <MessageText text={m.text} />
        {/* Room on the last line for the time, which sits in the bubble's bottom corner. */}
        <span aria-hidden className="inline-block w-10" />
      </p>
      <time
        dateTime={m.at}
        title={dayAndTime(m.at)}
        className="absolute right-2.5 bottom-1.5 text-2xs leading-none text-hint tabular-nums"
      >
        {clock(m.at)}
      </time>
    </div>
  ));
  if (mine)
    return (
      <li className="mt-3 flex flex-col items-end gap-0.5 first:mt-0" aria-label="You">
        {bubbles}
      </li>
    );
  return (
    <li className="mt-3 flex gap-2 first:mt-0" aria-label={group.from}>
      <span
        aria-hidden
        className="relative mt-5 flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised text-2xs font-semibold text-muted"
      >
        {initials(group.from)}
        {group.fromId && <PersonPhoto id={group.fromId} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="block h-5 max-w-full truncate px-1 text-xs leading-5 font-medium text-muted">
          {group.from}
        </span>
        {bubbles}
      </div>
    </li>
  );
}

/**
 * A Teams chat: the meeting's or call's (D-270), read every few seconds while you're in it, or one of
 * your chats in the lobby (D-296), with a box to write in it. Its states (loading, needs approval, no
 * chat) fill the list's space; the box keeps its row, so nothing moves.
 */
export function ChatPanel({
  messages,
  status,
  menu,
  header,
  placeholder = "Write in the meeting chat",
  emptyText = "Messages in the meeting's Teams chat show here.",
  onConnect,
  onSend,
}: {
  messages: MeetingChatMessage[];
  /** Undefined until the first read. */
  status?: ChatStatus;
  menu?: MenuEntry[];
  /** Replaces the panel's "Chat" title bar (the lobby shows who the chat is with). */
  header?: ReactNode;
  placeholder?: string;
  emptyText?: string;
  onConnect(): Promise<void>;
  onSend(text: string): Promise<void>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  /** The first message in view and how far below the list's top it is, kept while you scroll. */
  const anchor = useRef<{ id: string; offset: number }>(undefined);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const timeline = useMemo(() => chatTimeline(messages), [messages]);
  const remember = () => {
    const element = container.current;
    if (!element) return;
    following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
    const top = element.getBoundingClientRect().top;
    for (const node of element.querySelectorAll<HTMLElement>("[data-message-id]")) {
      const box = node.getBoundingClientRect();
      if (box.bottom > top) {
        anchor.current = { id: node.dataset.messageId!, offset: box.top - top };
        return;
      }
    }
  };
  // Follow new messages at the bottom; scrolled up, the message you're reading stays where it is
  // when older ones are added above it or drop off the top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs for every new list of messages.
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    if (following.current) {
      element.scrollTop = element.scrollHeight;
      return;
    }
    const kept = anchor.current;
    const node = kept && element.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(kept.id)}"]`);
    if (kept && node)
      element.scrollTop +=
        node.getBoundingClientRect().top - element.getBoundingClientRect().top - kept.offset;
  }, [timeline]);
  const canWrite = status?.state === "ok";
  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await onSend(text);
      setDraft("");
      following.current = true;
    } finally {
      setSending(false);
    }
  };
  return (
    <section className="flex size-full min-h-0 min-w-0 flex-col" aria-label="Chat">
      {header ?? (
        <PanelHeader
          title="Chat"
          detail={
            status?.error && status.state === "ok" ? (
              <span className="text-warning" title={status.error}>
                Couldn't refresh
              </span>
            ) : messages.length ? (
              `${messages.length} messages`
            ) : undefined
          }
          menu={menu}
        />
      )}
      <div
        data-testid="meeting-chat"
        ref={container}
        onScroll={remember}
        className="@container relative min-h-0 flex-1 overflow-y-auto"
      >
        {status?.state === "consent" && !messages.length ? (
          <Empty icon={ShieldCheck} title="Needs your admin's approval" className="h-full">
            <span className="block">
              Jig reads and writes this chat as you, with Microsoft's Chat.Read and ChatMessage.Send
              permissions. Once your administrator approves them for Jig, connect once.
            </span>
            <Button
              className="mt-2"
              busy={connecting}
              onClick={async () => {
                setConnecting(true);
                try {
                  await onConnect();
                } finally {
                  setConnecting(false);
                }
              }}
            >
              Connect chat…
            </Button>
          </Empty>
        ) : !status && !messages.length ? (
          <Spinner center />
        ) : !messages.length ? (
          <Empty icon={MessagesSquare} title="No messages yet" className="h-full">
            {status?.state === "unavailable" ? status.error : emptyText}
          </Empty>
        ) : (
          <ol className="mx-auto flex w-full max-w-3xl flex-col px-3 py-3 @lg:px-5">
            {timeline.map((item) =>
              item.kind === "day" ? (
                <li
                  key={item.key}
                  className="mt-3 flex h-6 items-center gap-3 text-2xs font-medium text-hint first:mt-0"
                >
                  <span aria-hidden className="h-px flex-1 bg-line" />
                  {item.label}
                  <span aria-hidden className="h-px flex-1 bg-line" />
                </li>
              ) : (
                <Group key={item.key} group={item.group} />
              ),
            )}
          </ol>
        )}
      </div>
      <form
        className="flex h-12 shrink-0 items-center gap-2 border-t border-line px-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Input
          className="min-w-0 flex-1"
          placeholder={canWrite ? placeholder : "The chat isn't connected"}
          aria-label="Message"
          value={draft}
          disabled={!canWrite}
          maxLength={4000}
          onChange={(e) => setDraft(e.target.value)}
          data-testid="meeting-chat-input"
        />
        <IconButton
          type="submit"
          icon={SendHorizontal}
          label="Send"
          disabled={!canWrite || !draft.trim() || sending}
          data-testid="meeting-chat-send"
        />
      </form>
    </section>
  );
}
