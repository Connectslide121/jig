import {
  CalendarDays,
  CircleDot,
  MessagesSquare,
  Pin,
  PinOff,
  Plug,
  RefreshCw,
  SearchX,
  ShieldCheck,
  SquareArrowOutUpRight,
  SquarePen,
  Users,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  type MeetingChatMessage,
  type MeetingChatState,
  mergeChat,
  type TeamsChatSummary,
  teamsChatLink,
} from "../../../shared/meetingChat";
import {
  CHAT_FILTERS,
  CHAT_SEARCH_MIN,
  type ChatFilter,
  type ChatSearchHit,
  chatKindOf,
  chatSections,
} from "../../../shared/meetingChatList";
import type { MeetingLayout, MeetingSizeKey } from "../../../shared/meetingLayout";
import { call, errorMessage } from "../../lib/host";
import { Button, cn, contextMenu, Empty, IconButton, type MenuEntry, SearchInput, Spinner } from "../../ui";
import { ChatPanel, type ChatStatus } from "./Chat";
import { chatTime, initials } from "./format";
import { PanelHeader } from "./Panels";
import { PersonPhoto } from "./photo";
import { PresenceDot, refreshPresence, usePresenceState } from "./presence";
import { SizedBox } from "./Slots";

/** The lobby's list of your chats: undefined until the first read. */
export interface ChatList {
  state: MeetingChatState;
  chats: TeamsChatSummary[];
  error?: string;
}

/** The chat that is open: from the list, or found for someone in Call… (it may not be in the list). */
export type OpenChat = Pick<TeamsChatSummary, "id" | "name" | "kind" | "peerId">;

/**
 * A chat's picture: the other person's (with their Teams status on it, D-329) or the group's icon.
 * `ring`: the background it sits on, around the status dot.
 */
function ChatAvatar({ chat, small, ring }: { chat: OpenChat; small?: boolean; ring?: string }) {
  const Icon = chat.kind === "meeting" ? CalendarDays : Users;
  return (
    <span className="relative flex shrink-0">
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
      {chat.kind === "oneOnOne" && (
        <PresenceDot id={chat.peerId} name={chat.name} small={small} ring={ring} />
      )}
    </span>
  );
}

/**
 * The lobby's Chats (D-296): your Teams chats newest first beside the open one. The list is read by
 * the lobby (and refreshed while this shows); the open chat every 5 seconds while it is open. Its
 * toolbar (D-332) searches and filters the list, searches messages with Microsoft Search and starts
 * a new chat; Jig's own pins sit above the rest.
 */
export function ChatsView({
  list,
  loading,
  connected,
  layout,
  open,
  pins,
  onResize,
  onOpen,
  onPin,
  onNewChat,
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
  /** Jig's own pins (D-332), in pin order. */
  pins: string[];
  onResize(key: MeetingSizeKey, size: number): void;
  onOpen(chat: OpenChat): void;
  onPin(chatId: string, pinned: boolean): void;
  onNewChat(): void;
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
  const presence = usePresenceState();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChatFilter>();
  const ready = connected && list?.state === "ok";
  const { pinned, recent } = useMemo(
    () => chatSections(chats, pins, query, filter),
    [chats, pins, query, filter],
  );
  const messages = useMessageSearch(ready ? query : "");
  const known = useMemo(() => new Map(chats.map((c) => [c.id, c])), [chats]);
  // Teams status (D-329) is asked for here, once: refused, the list just shows no dots.
  const listMenu: MenuEntry[] = [
    presence === "consent"
      ? {
          label: "Show Teams status…",
          icon: CircleDot,
          onSelect: () =>
            void call("meetings.presenceConnect")
              .then(refreshPresence)
              .catch((e) => onError(errorMessage(e))),
        }
      : presence === "ok"
        ? { label: "Teams status is shown", icon: CircleDot, checked: true, disabled: true }
        : { label: "Teams status isn't available", icon: CircleDot, disabled: true },
  ];
  const rows = (items: TeamsChatSummary[], isPinned: boolean) =>
    items.map((c) => (
      <li key={c.id}>
        <ChatRow
          chat={c}
          pinned={isPinned}
          selected={open?.id === c.id}
          onOpen={() => onOpen(c)}
          onPin={() => onPin(c.id, !isPinned)}
          onOpenInTeams={() =>
            void call("app.openExternal", { url: teamsChatLink({ chatId: c.id }) }).catch((e) =>
              onError(errorMessage(e)),
            )
          }
        />
      </li>
    ));
  const typed = query.trim();
  const searching = typed.length >= CHAT_SEARCH_MIN;
  const nothing = !pinned.length && !recent.length;
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
        <section aria-label="Chats" className="@container flex size-full min-h-0 min-w-0 flex-col">
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
            menu={listMenu}
          >
            <IconButton
              icon={RefreshCw}
              size="sm"
              label="Refresh chats"
              disabled={loading || !connected}
              onClick={onRefresh}
            />
          </PanelHeader>
          {/*
            The toolbar (D-332), always there at a fixed height so nothing moves: narrow, the search
            and New chat on one line and the filters under them; wide, all three on one line.
          */}
          <div
            className="flex h-20 shrink-0 flex-wrap content-center items-center gap-2 border-b border-line px-3 @md:h-11"
            data-testid="chats-toolbar"
          >
            <SearchInput
              aria-label="Search chats"
              placeholder="Search chats"
              boxClassName="order-1 w-auto flex-1"
              value={query}
              disabled={!ready}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery("")}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.stopPropagation();
                  setQuery("");
                }
              }}
            />
            <div
              role="group"
              aria-label="Filter chats"
              className="order-3 flex w-full items-center gap-1 @md:order-2 @md:w-auto"
            >
              {CHAT_FILTERS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filter === id}
                  disabled={!ready}
                  onClick={() => setFilter((f) => (f === id ? undefined : id))}
                  className={cn(
                    "flex h-7 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-50",
                    filter === id
                      ? "border-accent bg-accent-soft text-fg"
                      : "border-line text-muted hover:border-line-strong hover:text-fg",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <IconButton
              icon={SquarePen}
              size="sm"
              label="New chat"
              className="order-2 @md:order-3"
              disabled={!ready}
              onClick={onNewChat}
              data-testid="new-chat"
            />
          </div>
          <div className="relative min-h-0 flex-1 overflow-y-auto" data-testid="teams-chats">
            {!connected ? (
              <Empty
                icon={Plug}
                title="Connect Microsoft to see your Teams chats"
                className="h-full"
                actions={<Button onClick={onConnectAccount}>Connect…</Button>}
              />
            ) : list?.state === "consent" ? (
              <Empty
                icon={ShieldCheck}
                title="Needs your admin's approval"
                className="h-full"
                actions={
                  <Button busy={connecting} onClick={() => void connectChat()}>
                    Connect chat…
                  </Button>
                }
              >
                Jig reads your chats and writes in them as you, with Microsoft's Chat.Read and
                ChatMessage.Send permissions. Once your administrator approves them for Jig, connect once.
              </Empty>
            ) : !list ? (
              <Spinner center />
            ) : !chats.length ? (
              <Empty icon={MessagesSquare} title="No chats yet" className="h-full">
                {list.error ?? "Your Teams chats show here, newest first."}
              </Empty>
            ) : nothing && !searching ? (
              <Empty icon={SearchX} title="No chats match" className="h-full">
                {typed
                  ? `No chat's name, people or last message has “${typed}”.`
                  : "No chats pass this filter."}
              </Empty>
            ) : (
              <div className="py-1">
                {pinned.length > 0 && (
                  <ListSection
                    title="Pinned"
                    note="In Jig only"
                    tip="Pins are Jig's own: they don't sync with Teams, and Teams' own pins can't be shown (Microsoft doesn't share them)."
                  >
                    {rows(pinned, true)}
                  </ListSection>
                )}
                {recent.length > 0 && (
                  <ListSection title={pinned.length ? "Recent" : undefined}>
                    {rows(recent, false)}
                  </ListSection>
                )}
                {nothing && (
                  <p className="flex h-12 items-center px-3 text-xs text-muted">No chat matches “{typed}”.</p>
                )}
                {searching && (
                  <MessageHits
                    result={messages}
                    query={typed}
                    known={known}
                    selected={open?.id}
                    onOpen={onOpen}
                  />
                )}
              </div>
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
            Or start one with New chat, or open your chat with someone from Call…
          </Empty>
        )}
      </div>
    </main>
  );
}

/** A section of the chat list under its heading (none when it's the only section). */
function ListSection({
  title,
  note,
  tip,
  children,
}: {
  title?: string;
  note?: string;
  tip?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} data-testid={title ? `chats-${title.toLowerCase()}` : undefined}>
      {title && (
        <h3
          className="flex h-7 items-center gap-2 px-3 text-2xs font-semibold tracking-wide text-hint uppercase"
          title={tip}
        >
          <span className="min-w-0 flex-1 truncate">{title}</span>
          {note && <span className="shrink-0 font-normal tracking-normal normal-case">{note}</span>}
        </h3>
      )}
      <ul>{children}</ul>
    </section>
  );
}

type MessageSearch =
  | { query: string; state: "loading" }
  | { query: string; state: MeetingChatState; hits: ChatSearchHit[]; error?: string };

/** Microsoft Search's hits for what you typed (D-332), asked half a second after you stop typing. */
function useMessageSearch(query: string): MessageSearch | undefined {
  const [result, setResult] = useState<MessageSearch>();
  const q = query.trim();
  useEffect(() => {
    if (q.length < CHAT_SEARCH_MIN) {
      setResult(undefined);
      return;
    }
    let live = true;
    setResult({ query: q, state: "loading" });
    const timer = setTimeout(
      () =>
        void call("meetings.chatSearch", { query: q })
          .then((r) => live && setResult({ query: q, ...r }))
          .catch((e) => live && setResult({ query: q, state: "ok", hits: [], error: errorMessage(e) })),
      500,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);
  return result;
}

/** Messages Microsoft Search found, under the chats: each opens its chat. */
function MessageHits({
  result,
  query,
  known,
  selected,
  onOpen,
}: {
  result?: MessageSearch;
  query: string;
  known: ReadonlyMap<string, TeamsChatSummary>;
  selected?: string;
  onOpen(chat: OpenChat): void;
}) {
  const line = (text: string, warn?: boolean) => (
    <li className={cn("flex h-12 items-center px-3 text-xs", warn ? "text-warning" : "text-muted")}>
      {text}
    </li>
  );
  return (
    <ListSection
      title="Messages"
      note="Microsoft Search"
      tip="Messages in all your Teams chats, found by Microsoft Search (not only the chats listed above)."
    >
      {!result || result.state === "loading" || result.query !== query ? (
        <li className="relative h-12">
          <Spinner center />
        </li>
      ) : result.state === "consent" ? (
        line("Searching messages needs the chat permission.", true)
      ) : result.error ? (
        line(result.error, true)
      ) : !result.hits.length ? (
        line(`No messages with “${query}”.`)
      ) : (
        result.hits.map((h) => {
          const kind = chatKindOf(h.chatId);
          const chat: OpenChat = known.get(h.chatId) ?? {
            id: h.chatId,
            name: kind === "oneOnOne" ? h.from : "Teams chat",
            kind,
          };
          return (
            <li key={h.messageId}>
              <button
                type="button"
                data-testid="chat-search-hit"
                aria-current={selected === h.chatId || undefined}
                title={chat.name}
                onClick={() => onOpen(chat)}
                className={cn(
                  "flex h-16 w-full items-center gap-3 px-3 text-left hover:bg-hover",
                  selected === h.chatId && "bg-active hover:bg-active",
                )}
              >
                <ChatAvatar chat={chat} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{chat.name}</span>
                    <time className="w-14 shrink-0 text-right text-xs text-hint tabular-nums">
                      {chatTime(h.at)}
                    </time>
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {h.from}: {h.text}
                  </span>
                </span>
              </button>
            </li>
          );
        })
      )}
    </ListSection>
  );
}

/**
 * One chat: picture, name and time on the first line, the last message and the unread mark under it.
 * Pointing at it shows Pin over the time and mark's column (so nothing moves); right-click for Pin
 * and Open in Teams.
 */
function ChatRow({
  chat,
  pinned,
  selected,
  onOpen,
  onPin,
  onOpenInTeams,
}: {
  chat: TeamsChatSummary;
  pinned: boolean;
  selected: boolean;
  onOpen(): void;
  onPin(): void;
  onOpenInTeams(): void;
}) {
  const preview = chat.preview
    ? chat.preview.mine || chat.kind !== "oneOnOne"
      ? `${chat.preview.from}: ${chat.preview.text}`
      : chat.preview.text
    : "";
  return (
    <div className="group relative">
      <button
        type="button"
        data-testid="teams-chat"
        aria-current={selected || undefined}
        title={chat.name}
        onClick={onOpen}
        onContextMenu={contextMenu([
          {
            label: pinned ? "Unpin" : "Pin",
            icon: pinned ? PinOff : Pin,
            detail: "In Jig only",
            onSelect: onPin,
          },
          { label: "Open in Teams", icon: SquareArrowOutUpRight, onSelect: onOpenInTeams },
        ])}
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
            <time className="w-14 shrink-0 text-right text-xs text-hint tabular-nums group-hover:invisible">
              {chatTime(chat.at)}
            </time>
          </span>
          <span className="flex items-center gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-xs", chat.unread ? "text-fg" : "text-muted")}>
              {preview}
            </span>
            {/* A fixed slot at the far right, so the mark lines up in every row and nothing moves. */}
            <span className="flex w-14 shrink-0 justify-end group-hover:invisible">
              <span className={cn("size-2 rounded-full", chat.unread && "bg-accent")} />
              {chat.unread && <span className="sr-only">Unread</span>}
            </span>
          </span>
        </span>
      </button>
      {/* The hover action, over the time and mark's column and right-aligned like them. */}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex w-14 items-center justify-end">
        <IconButton
          icon={pinned ? PinOff : Pin}
          size="sm"
          label={pinned ? "Unpin" : "Pin in Jig (not synced with Teams)"}
          data-testid="chat-pin"
          className="pointer-events-auto invisible group-hover:visible focus-visible:visible"
          onClick={onPin}
        />
      </span>
    </div>
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
          <ChatAvatar chat={chat} small ring="ring-canvas" />
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
