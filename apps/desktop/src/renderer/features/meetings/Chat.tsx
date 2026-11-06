import { ImageOff, MessagesSquare, SendHorizontal, ShieldCheck, SquareArrowOutUpRight } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type ChatFile,
  type ChatGroup,
  type ChatImage,
  chatTimeline,
  type MeetingChatMessage,
  type MeetingChatState,
} from "../../../shared/meetingChat";
import { call } from "../../lib/host";
import {
  Button,
  cn,
  Dialog,
  Empty,
  FileIcon,
  IconButton,
  ImagePreview,
  Input,
  type MenuEntry,
  Spinner,
} from "../../ui";
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

/** Pictures asked for in this window (main keeps them too): the newest few dozen. */
const pictures = new Map<string, Promise<string | null>>();
function pictureOf(image: ChatImage): Promise<string | null> {
  const key = `${image.chatId}\n${image.messageId}\n${image.contentId}`;
  let picture = pictures.get(key);
  if (!picture) {
    const { chatId, messageId, contentId } = image;
    picture = call("meetings.chatImage", { chatId, messageId, contentId }).catch(() => null);
    picture.then((url) => url === null && pictures.delete(key));
    pictures.set(key, picture);
    for (const old of pictures.keys()) {
      if (pictures.size <= 40) break;
      pictures.delete(old);
    }
  }
  return picture;
}

/**
 * A thumbnail's shape: Teams' own size when it gives one (a small picture stays small, px), else a
 * 4:3 box. It fills the media column (`w-60`), so pictures and files line up.
 */
function thumbBox(image: ChatImage): { maxWidth?: number; aspectRatio: number } {
  if (!image.width || !image.height) return { aspectRatio: 4 / 3 };
  const aspectRatio = Math.min(2.4, Math.max(0.6, image.width / image.height));
  return { maxWidth: Math.max(96, image.width), aspectRatio };
}

/**
 * A picture in a message (D-328): its box has its final size from the start (from the message), so
 * nothing moves when it loads; the whole thumbnail opens it larger.
 */
function Picture({ image, onOpen }: { image: ChatImage; onOpen(src: string): void }) {
  const [src, setSrc] = useState<string | null>();
  useEffect(() => {
    let live = true;
    void pictureOf(image).then((p) => live && setSrc(p));
    return () => {
      live = false;
    };
  }, [image]);
  return (
    <button
      type="button"
      data-testid="chat-image"
      aria-label={src ? "Open picture" : src === null ? "Picture unavailable" : "Loading picture"}
      disabled={!src}
      onClick={() => src && onOpen(src)}
      style={thumbBox(image)}
      className="relative block w-full overflow-hidden rounded-lg bg-surface enabled:cursor-zoom-in"
    >
      {src ? (
        <img src={src} alt="" draggable={false} className="size-full object-cover" />
      ) : src === null ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-hint">
          <ImageOff className="size-5" />
          Picture unavailable
        </span>
      ) : (
        <Spinner center />
      )}
    </button>
  );
}

/** A shared file or link (D-328): its icon and name in one row; the whole row opens it in your browser. */
function FileRow({ file }: { file: ChatFile }) {
  return (
    <button
      type="button"
      data-testid="chat-file"
      title={`Open ${file.name} in your browser`}
      onClick={() => void call("meetings.openChatFile", { url: file.url }).catch(() => undefined)}
      className="flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-left hover:bg-hover"
    >
      <FileIcon path={file.kind === "file" ? file.name : "link.url"} />
      <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
      <SquareArrowOutUpRight aria-hidden className="size-3.5 shrink-0 text-muted" />
    </button>
  );
}

/**
 * One sender's run of messages as bubbles (D-327): yours on the right in the accent's tint, everyone
 * else's on the left in the surface's, with their picture and name on the first one only. The corner
 * toward the sender is squared on the first bubble and softened between bubbles of one group.
 */
function Group({ group, onOpenImage }: { group: ChatGroup; onOpenImage(src: string, at: string): void }) {
  const { mine } = group;
  const count = group.messages.length;
  const bubbles = group.messages.map((m, i) => {
    const media = Boolean(m.images?.length || m.files?.length);
    return (
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
        {m.text && (
          <p className="wrap-anywhere whitespace-pre-wrap">
            <MessageText text={m.text} />
            {/* Room on the last line for the time, which sits in the bubble's bottom corner. */}
            {!media && <span aria-hidden className="inline-block w-10" />}
          </p>
        )}
        {media && (
          // Pictures and files under the words, in one column, then a line of their own for the time.
          <>
            <div className="flex w-60 max-w-full min-w-0 flex-col gap-1.5 pt-1.5">
              {m.images?.map((image) => (
                <Picture key={image.contentId} image={image} onOpen={(src) => onOpenImage(src, m.at)} />
              ))}
              {m.files?.map((file) => (
                <FileRow key={file.url} file={file} />
              ))}
            </div>
            <div aria-hidden className="h-5" />
          </>
        )}
        <time
          dateTime={m.at}
          title={dayAndTime(m.at)}
          className="absolute right-2.5 bottom-1.5 text-2xs leading-none text-hint tabular-nums"
        >
          {clock(m.at)}
        </time>
      </div>
    );
  });
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
  const [viewing, setViewing] = useState<{ src: string; at: string }>();
  const openImage = (src: string, at: string) => setViewing({ src, at });
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
          <Empty
            icon={ShieldCheck}
            title="Needs your admin's approval"
            className="h-full"
            actions={
              <Button
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
            }
          >
            Jig reads and writes this chat as you, with Microsoft's Chat.Read and ChatMessage.Send
            permissions. Once your administrator approves them for Jig, connect once.
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
                <Group key={item.key} group={item.group} onOpenImage={openImage} />
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
      {/* On the page itself, so no panel's overflow or stacking can clip or cover the overlay. */}
      {createPortal(
        <Dialog
          open={Boolean(viewing)}
          onClose={() => setViewing(undefined)}
          title={viewing ? `Picture · ${dayAndTime(viewing.at)}` : "Picture"}
          width="full"
          column
          testId="chat-image-viewer"
        >
          {viewing && (
            <div className="min-h-0 flex-1">
              <ImagePreview src={viewing.src} alt="Picture from the chat" />
            </div>
          )}
        </Dialog>,
        document.body,
      )}
    </section>
  );
}
