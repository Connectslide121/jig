import {
  CalendarDays,
  MessagesSquare,
  Plug,
  RefreshCw,
  ShieldCheck,
  SquareArrowOutUpRight,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  type MeetingChatMessage,
  type MeetingChatState,
  mergeChat,
  type TeamsChatSummary,
  teamsChatLink,
} from "../../../shared/meetingChat";
import type { MeetingLayout, MeetingSizeKey } from "../../../shared/meetingLayout";
import { call, errorMessage } from "../../lib/host";
import { Button, cn, Empty, IconButton, Spinner } from "../../ui";
import { ChatPanel, type ChatStatus } from "./Chat";
import { chatTime, initials } from "./format";
import { PanelHeader } from "./Panels";
import { PersonPhoto } from "./photo";
import { SizedBox } from "./Slots";

/** The lobby's list of your chats: undefined until the first read. */
export interface ChatList {
  state: MeetingChatState;
  chats: TeamsChatSummary[];
  error?: string;
}

/** The chat that is open: from the list, or found for someone in Call… (it may not be in the list). */
export type OpenChat = Pick<TeamsChatSummary, "id" | "name" | "kind" | "peerId">;

function ChatAvatar({ chat, small }: { chat: OpenChat; small?: boolean }) {
  const Icon = chat.kind === "meeting" ? CalendarDays : Users;
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised font-semibold text-muted",
        small ? "size-6 text-2xs" : "size-9 text-xs",
      )}
    >
      {chat.kind === "oneOnOne" ? (
        <>
          {initials(chat.name)}
          {chat.peerId && <PersonPhoto id={chat.peerId} />}
        </>
      ) : (
        <Icon className={small ? "size-3.5" : "size-4"} />
      )}
    </span>
  );
}

/**
 * The lobby's Chats (D-296): your Teams chats newest first beside the open one. The list is read by
 * the lobby (and refreshed while this shows); the open chat every 5 seconds while it is open.
 */
export function ChatsView({
  list,
  loading,
  connected,
  layout,
  open,
  onResize,
  onOpen,
  onRefresh,
  onConnectAccount,
  onConnectChat,
  onSent,
  onError,
}: {
  list?: ChatList;
  loading: boolean;
  connected: boolean;
  layout: MeetingLayout;
  open?: OpenChat;
  onResize(key: MeetingSizeKey, size: number): void;
  onOpen(chat: OpenChat): void;
  onRefresh(): void;
  onConnectAccount(): void;
  onConnectChat(): Promise<void>;
  onSent(): void;
  onError(message: string): void;
}) {
  const [connecting, setConnecting] = useState(false);
  const connectChat = async () => {
    setConnecting(true);
    try {
      await onConnectChat();
    } finally {
      setConnecting(false);
    }
  };
  const chats = list?.chats ?? [];
  return (
    <main className="flex min-h-0 min-w-0 flex-1">
      <SizedBox
        layout={layout}
        sizeKey="chats.list"
        edge="right"
        min={240}
        onResize={onResize}
        label="Resize chat list"
        className="border-r border-line bg-surface"
      >
        <section aria-label="Chats" className="flex size-full min-h-0 min-w-0 flex-col">
          <PanelHeader
            title="Chats"
            detail={
              list?.error && list.state === "ok" ? (
                <span className="text-warning" title={list.error}>
                  Couldn't refresh
                </span>
              ) : chats.length ? (
                `${chats.length}`
              ) : undefined
            }
          >
            <IconButton
              icon={RefreshCw}
              size="sm"
              label="Refresh chats"
              disabled={loading || !connected}
              onClick={onRefresh}
            />
          </PanelHeader>
          <div className="relative min-h-0 flex-1 overflow-y-auto" data-testid="teams-chats">
            {!connected ? (
              <Empty icon={Plug} title="Connect Microsoft to see your Teams chats" className="h-full">
                <Button className="mt-2" onClick={onConnectAccount}>
                  Connect…
                </Button>
              </Empty>
            ) : list?.state === "consent" ? (
              <Empty icon={ShieldCheck} title="Needs your admin's approval" className="h-full">
                <span className="block">
                  Jig reads your chats and writes in them as you, with Microsoft's Chat.Read and
                  ChatMessage.Send permissions. Once your administrator approves them for Jig, connect once.
                </span>
                <Button className="mt-2" busy={connecting} onClick={() => void connectChat()}>
                  Connect chat…
                </Button>
              </Empty>
            ) : !list ? (
              <Spinner center />
            ) : !chats.length ? (
              <Empty icon={MessagesSquare} title="No chats yet" className="h-full">
                {list.error ?? "Your Teams chats show here, newest first."}
              </Empty>
            ) : (
              <ul className="py-1">
                {chats.map((c) => (
                  <li key={c.id}>
                    <ChatRow chat={c} selected={open?.id === c.id} onOpen={() => onOpen(c)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </SizedBox>
      <div className="flex min-w-72 flex-1">
        {open ? (
          <OpenChatPanel
            key={open.id}
            chat={open}
            onConnect={connectChat}
            onSent={onSent}
            onError={onError}
          />
        ) : (
          <Empty icon={MessagesSquare} title="Pick a chat" className="size-full">
            Or open your chat with someone from Call…
          </Empty>
        )}
      </div>
    </main>
  );
}

/** One chat: picture, name and time on the first line, the last message and the unread mark under it. */
function ChatRow({ chat, selected, onOpen }: { chat: TeamsChatSummary; selected: boolean; onOpen(): void }) {
  const preview = chat.preview
    ? chat.preview.mine || chat.kind !== "oneOnOne"
      ? `${chat.preview.from}: ${chat.preview.text}`
      : chat.preview.text
    : "";
  return (
    <button
      type="button"
      data-testid="teams-chat"
      aria-current={selected || undefined}
      title={chat.name}
      onClick={onOpen}
      className={cn(
        "flex h-16 w-full items-center gap-3 px-3 text-left hover:bg-hover",
        selected && "bg-active hover:bg-active",
      )}
    >
      <ChatAvatar chat={chat} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={cn("min-w-0 flex-1 truncate text-sm", chat.unread ? "font-semibold" : "font-medium")}
          >
            {chat.name}
          </span>
          <time className="w-14 shrink-0 text-right text-xs text-hint tabular-nums">{chatTime(chat.at)}</time>
        </span>
        <span className="flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-xs", chat.unread ? "text-fg" : "text-muted")}>
            {preview}
          </span>
          {/* A fixed slot at the far right, so the mark lines up in every row and nothing moves. */}
          <span className="flex w-14 shrink-0 justify-end">
            <span className={cn("size-2 rounded-full", chat.unread && "bg-accent")} />
            {chat.unread && <span className="sr-only">Unread</span>}
          </span>
        </span>
      </span>
    </button>
  );
}

/** The open chat, read every 5 seconds while it's open. */
function OpenChatPanel({
  chat,
  onConnect,
  onSent,
  onError,
}: {
  chat: OpenChat;
  onConnect(): Promise<void>;
  onSent(): void;
  onError(message: string): void;
}) {
  const [messages, setMessages] = useState<MeetingChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>();
  const [version, setVersion] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` reads again after connecting.
  useEffect(() => {
    let live = true;
    const read = () =>
      void call("meetings.chatThread", { chatId: chat.id })
        .then((r) => {
          if (!live) return;
          setStatus({ state: r.state, error: r.error });
          if (r.state === "ok" && !r.error) setMessages(r.messages);
        })
        .catch((e) => live && setStatus({ state: "ok", error: errorMessage(e) }));
    read();
    const timer = setInterval(read, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [chat.id, version]);
  return (
    <ChatPanel
      messages={messages}
      status={status}
      placeholder={`Write to ${chat.name}`}
      emptyText="No messages in this chat yet."
      header={
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line pr-2 pl-3">
          <ChatAvatar chat={chat} small />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{chat.name}</h2>
          {status?.error && status.state === "ok" && (
            <span className="shrink-0 text-xs text-warning" title={status.error}>
              Couldn't refresh
            </span>
          )}
          <IconButton
            icon={SquareArrowOutUpRight}
            size="sm"
            label="Open in Teams"
            onClick={() =>
              void call("app.openExternal", { url: teamsChatLink({ chatId: chat.id }) }).catch((e) =>
                onError(errorMessage(e)),
              )
            }
          />
        </div>
      }
      onConnect={async () => {
        await onConnect();
        setVersion((v) => v + 1);
      }}
      onSend={async (text) => {
        try {
          const sent = await call("meetings.chatThreadSend", { chatId: chat.id, text });
          if (sent) setMessages((kept) => mergeChat(kept, [sent]));
          onSent();
        } catch (e) {
          onError(errorMessage(e));
          throw e;
        }
      }}
    />
  );
}
