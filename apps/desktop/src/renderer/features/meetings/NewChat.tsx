import { Check, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CHAT_TOPIC_MAX, NEW_CHAT_MAX_PEOPLE } from "../../../shared/meetingChatList";
import type { MeetingPerson } from "../../../shared/meetings";
import { call, errorMessage } from "../../lib/host";
import { Button, cn, Dialog, Input, SearchInput, Spinner, Textarea } from "../../ui";
import { Avatar, usePeopleSearch } from "./Calls";
import type { OpenChat } from "./Chats";

/**
 * New chat (D-332): pick one person or more from Call…'s people search, name a group chat if you
 * like, and write the first message. One person you already chat with opens that chat instead. Until
 * an administrator approves Chat.Create (or Chat.ReadWrite) for Jig, the dialog says so.
 */
export function NewChatDialog({
  initial = [],
  onClose,
  onStarted,
}: {
  initial?: MeetingPerson[];
  onClose(): void;
  onStarted(chat: OpenChat): void;
}) {
  const [query, setQuery] = useState("");
  const { found, error: peopleError, loading } = usePeopleSearch(query);
  const [picked, setPicked] = useState<MeetingPerson[]>(initial);
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Whether Jig may start chats: undefined until asked (the status line keeps its place meanwhile). */
  const [ready, setReady] = useState<"ok" | "consent" | "unavailable">();
  const [connecting, setConnecting] = useState(false);
  const checkReady = () =>
    call("meetings.chatCreateReady")
      .then((r) => setReady(r.state))
      .catch((e) => setError(errorMessage(e)));
  // biome-ignore lint/correctness/useExhaustiveDependencies: asked once when the dialog opens.
  useEffect(() => {
    void checkReady();
  }, []);
  const people = found?.people ?? [];
  const isPicked = (p: MeetingPerson) => picked.some((x) => x.id === p.id);
  const toggle = (p: MeetingPerson) =>
    setPicked((kept) =>
      kept.some((x) => x.id === p.id)
        ? kept.filter((x) => x.id !== p.id)
        : kept.length < NEW_CHAT_MAX_PEOPLE
          ? [...kept, p]
          : kept,
    );
  const group = picked.length > 1;
  // Without approval Jig can still open the chat you already have with one person.
  const blocked = ready === "consent" && picked.length !== 1;
  const canStart = Boolean(picked.length && text.trim()) && !busy && !blocked && ready !== undefined;
  const start = async () => {
    if (!canStart) return;
    setBusy(true);
    setError("");
    try {
      const { chat } = await call("meetings.chatCreate", {
        people: picked.map((p) => ({ id: p.id, name: p.name })),
        ...(group && topic.trim() ? { topic: topic.trim() } : {}),
        text: text.trim(),
      });
      onStarted(chat);
    } catch (e) {
      setError(errorMessage(e));
      void checkReady();
    } finally {
      setBusy(false);
    }
  };
  const connect = async () => {
    setConnecting(true);
    setError("");
    try {
      await call("meetings.chatCreateConnect");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setConnecting(false);
      void checkReady();
    }
  };
  const status = error || peopleError;
  return (
    <Dialog
      open
      title="New chat"
      width="md"
      onClose={onClose}
      testId="new-chat-dialog"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!canStart} onClick={() => void start()}>
            Start chat
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <SearchInput
          autoFocus
          placeholder="Search people by name or e-mail"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
        />
        {/* Who is in it: one line that scrolls sideways, so picking people moves nothing below. */}
        <div
          role="group"
          className="flex h-8 items-center gap-1.5 overflow-x-auto"
          aria-label="People in the new chat"
          data-testid="new-chat-picked"
        >
          {picked.length ? (
            picked.map((p) => (
              <span
                key={p.id}
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-line bg-accent-soft pr-1 pl-2.5 text-xs"
              >
                {p.name}
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  title={`Remove ${p.name}`}
                  className="flex size-5 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg"
                  onClick={() => toggle(p)}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))
          ) : (
            <span className="text-xs text-hint">Pick one person, or more for a group chat.</span>
          )}
        </div>
        {/* A fixed height, so the dialog doesn't jump while people load or the search narrows. */}
        <div
          className="relative h-56 overflow-y-auto rounded-md border border-line"
          data-testid="new-chat-people"
        >
          {loading && !found ? (
            <Spinner center />
          ) : people.length ? (
            <ul className="p-1">
              {people.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    data-testid="new-chat-person"
                    aria-pressed={isPicked(p)}
                    onClick={() => toggle(p)}
                    className="flex h-12 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-hover"
                  >
                    <Avatar name={p.name} id={p.id} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {[p.title, p.email].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {/* The tick's own column at the far right, empty when not picked. */}
                    <span className="flex size-8 shrink-0 items-center justify-center text-accent">
                      {isPicked(p) && <Check className="size-4" />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-6 text-center text-sm text-muted">
              {query.trim() ? "Nobody in your organisation matches." : "Search for someone to chat with."}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="new-chat-topic" className="block text-sm font-medium">
            Group name
          </label>
          <Input
            id="new-chat-topic"
            className="w-full"
            maxLength={CHAT_TOPIC_MAX}
            disabled={!group}
            placeholder={group ? "Optional" : "For a group chat of 3 or more people"}
            value={group ? topic : ""}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="new-chat-text" className="block text-sm font-medium">
            First message
          </label>
          <Textarea
            id="new-chat-text"
            className="w-full resize-none"
            rows={3}
            maxLength={4000}
            placeholder="Write the first message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void start();
            }}
          />
        </div>
        {/* One fixed line for what's in the way: the admin's approval, a failure, or a hint. */}
        <div
          role={status ? "alert" : "status"}
          data-testid="new-chat-status"
          className={cn(
            "flex h-12 items-center gap-2 text-xs",
            status ? "text-danger" : ready === "consent" ? "text-fg" : "text-hint",
          )}
        >
          {status ? (
            <span className="line-clamp-2">{status}</span>
          ) : ready === "consent" ? (
            <>
              <ShieldCheck className="size-4 shrink-0 text-warning" />
              <span
                className="line-clamp-2 min-w-0 flex-1"
                title="Until then Jig only opens chats you already have. Ask your administrator to approve Microsoft's Chat.Create (or Chat.ReadWrite) permission for Jig, then press Connect."
              >
                An administrator has to approve Chat.Create (or Chat.ReadWrite) before Jig can start chats.
              </span>
              <Button size="sm" busy={connecting} onClick={() => void connect()}>
                Connect…
              </Button>
            </>
          ) : (
            <span className="line-clamp-2">
              One person opens your chat with them if you have one. Teams sends the message as you.
            </span>
          )}
        </div>
      </div>
    </Dialog>
  );
}
