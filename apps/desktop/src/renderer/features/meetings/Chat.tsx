import { MessagesSquare, SendHorizontal, ShieldCheck } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { MeetingChatMessage, MeetingChatState } from "../../../shared/meetingChat";
import { Button, Empty, IconButton, Input, type MenuEntry, Spinner } from "../../ui";
import { clock, initials } from "./format";
import { PanelHeader } from "./Panels";
import { PersonPhoto } from "./photo";

export interface ChatStatus {
  state: MeetingChatState;
  error?: string;
}

/** Consecutive messages from one person within two minutes read as one block, like the transcript. */
function blocks(messages: MeetingChatMessage[]): MeetingChatMessage[][] {
  const out: MeetingChatMessage[][] = [];
  for (const m of messages) {
    const last = out.at(-1);
    const prev = last?.at(-1);
    if (prev && prev.from === m.from && new Date(m.at).getTime() - new Date(prev.at).getTime() < 120_000)
      last!.push(m);
    else out.push([m]);
  }
  return out;
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
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const last = messages.at(-1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: follow new and edited messages.
  useEffect(() => {
    const element = container.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [last?.id, last?.text, messages.length]);
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
        onScroll={() => {
          const element = container.current;
          if (element)
            following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
        }}
        className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3"
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
          <ol className="space-y-3">
            {blocks(messages).map((block) => {
              const first = block[0]!;
              return (
                <li key={first.id} className="flex gap-2.5">
                  <span
                    aria-hidden
                    className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised text-2xs font-semibold text-muted"
                  >
                    {initials(first.mine ? "You" : first.from)}
                    {first.fromId && <PersonPhoto id={first.fromId} />}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex h-7 items-center gap-2">
                      <span className="min-w-0 truncate font-semibold">
                        {first.mine ? "You" : first.from}
                      </span>
                      <time className="ml-auto shrink-0 text-xs text-hint tabular-nums">
                        {clock(first.at)}
                      </time>
                    </div>
                    {block.map((m) => (
                      <p key={m.id} className="leading-relaxed break-words whitespace-pre-wrap">
                        {m.text}
                      </p>
                    ))}
                  </div>
                </li>
              );
            })}
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
