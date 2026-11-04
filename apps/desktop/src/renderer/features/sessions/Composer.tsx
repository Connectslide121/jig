import {
  ArrowUp,
  AudioLines,
  BookmarkPlus,
  Bot,
  ChevronDown,
  Download,
  FolderPlus,
  History,
  MessageSquareShare,
  Paperclip,
  Plug,
  Shield,
  Sparkles,
  Split,
  Square,
  SquarePlus,
  SquareTerminal,
  X,
  Zap,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ChatAttachment, QueuedMessage, SessionMeta } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { Button, cn, ErrorBoundary, IconButton, type MenuEntry, openMenuAt } from "../../ui";
import { useRegistry } from "../../workbench/registry";
import { formatShortcut } from "../../workbench/shortcuts";
import { notify } from "../../workbench/toasts";
import { openAttemptsDialog } from "../attempts/AttemptsDialog";
import { takeTalkRequest, useTalkRequest } from "../speech/commands/talk";
import { VoiceButton } from "../speech/VoiceButton";
import { startVoice, toggleVoice, useVoice, type VoiceHooks } from "../speech/voice";
import { newSession } from "./actions";
import { type BoxCommand, ComposerBox, useComposerText } from "./ComposerBox";
import { historyStep, inputMode, nextPermissionMode, tokenAt } from "./composerInput";
import { registerComposer, takeDraft } from "./drafts";
import { exportChat, modelMenu, openModelMenu, permissionMenu, useModelLabel } from "./menus";
import { ProviderPicker } from "./ProviderPicker";
import { usePrompts } from "./prompts";
import { canChangeProvider, capabilitiesOf, providerName } from "./provider";
import { openSavedChatsDialog } from "./SavedChatsDialog";
import { openEditQueuedDialog, openFoldersDialog, openMcpDialog } from "./SessionDialogs";
import { useSessions } from "./store";

/**
 * Claude Code commands that Jig answers with its own menus (they need Claude Code's terminal UI
 * there). Picking one runs it right away.
 */
interface LocalCommand {
  name: string;
  description: string;
  run: (meta: SessionMeta, anchor: HTMLElement) => void;
}
const LOCAL_COMMANDS: LocalCommand[] = [
  { name: "model", description: "Choose the model and effort", run: (m, a) => openMenuAt(a, modelMenu(m)) },
  {
    name: "permissions",
    description: "When Claude asks before changing things",
    run: (m, a) => openMenuAt(a, permissionMenu(m)),
  },
  { name: "mcp", description: "MCP servers of this chat", run: (m) => openMcpDialog(m.id) },
  { name: "add-dir", description: "Let Claude use another folder", run: (m) => openFoldersDialog(m.id) },
  { name: "export", description: "Save this chat as Markdown", run: (m) => void exportChat(m) },
  {
    name: "clear",
    description: "Start a new chat in this project",
    run: (m) => void newSession(m.projectId, m.cwd),
  },
  {
    name: "rewind",
    description: "Go back to before one of your messages",
    run: () =>
      notify({
        title: "Rewind from a message",
        message: "Hover one of your messages and choose ⋯ → Rewind to here.",
      }),
  },
];

export function Composer({
  meta,
  queue,
  active,
}: {
  meta: SessionMeta;
  queue: QueuedMessage[];
  active: boolean;
}) {
  const input = useComposerText(() => takeDraft(meta.id));
  const { text, setText, ref } = input;
  const modelName = useModelLabel(meta);
  const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [history, setHistory] = useState<{ index: number; draft: string }>({ index: -1, draft: "" });
  const box = useRef<HTMLDivElement>(null);
  const prompts = Object.values(usePrompts());
  const toolbar = Object.values(useRegistry((s) => s.chatToolbar));
  const sent = useSessions((s) => s.transcripts[meta.id]?.items);
  const busy = meta.status === "working" || meta.status === "needs_you" || meta.status === "starting";
  const caps = capabilitiesOf(meta);
  const who = providerName(meta);
  // Suggestions are Claude Code's; a provider without them never shows the chip (D-309).
  const suggestion = busy || !caps.promptSuggestions ? undefined : meta.suggestion;
  const mode = inputMode(text);
  const sendLabel =
    mode === "shell"
      ? "Run in shell (Enter)"
      : mode === "memory"
        ? "Remember (Enter)"
        : busy
          ? "Queue: read after this turn (Enter)"
          : "Send (Enter)";
  const talking = useVoice((s) => s.target === meta.id && s.phase !== "off");
  const localCommands = useMemo<BoxCommand[]>(
    () => LOCAL_COMMANDS.map((c) => ({ ...c, run: (anchor) => c.run(meta, anchor) })),
    [meta],
  );

  useEffect(() => {
    if (active) ref.current?.focus();
  }, [active, ref]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: setTyped only sets state and a ref.
  useEffect(
    () =>
      registerComposer(meta.id, (value) => {
        input.setTyped(value, value.length);
        requestAnimationFrame(() => ref.current?.focus());
      }),
    [meta.id],
  );

  // Talking keeps these for as long as it runs: always call this render's send.
  const latest = useRef({ send: (_value: string) => {} });
  const speechHooks = useMemo<VoiceHooks>(
    () => ({
      onText: input.onDictation,
      send: () => latest.current.send(input.latestText.current),
    }),
    [input.onDictation, input.latestText],
  );
  // "Hey Jig, new chat": a voice command asks this chat to start talking (D-278).
  const talkRequested = useTalkRequest((s) => s.target === meta.id);
  useEffect(() => {
    if (!talkRequested) return;
    const request = takeTalkRequest(meta.id);
    if (!request) return;
    void startVoice(meta.id, speechHooks).then(() => {
      if (request.send && useVoice.getState().target === meta.id)
        void call("sessions.send", { id: meta.id, text: request.send }).catch(() => undefined);
    });
  }, [talkRequested, meta.id, speechHooks]);

  const send = async (value = text, withFiles = files, now = false) => {
    const trimmed = value.trim();
    if (!trimmed && withFiles.length === 0) return;
    setText("");
    setFiles([]);
    setHistory({ index: -1, draft: "" });
    try {
      await call("sessions.send", { id: meta.id, text: trimmed, attachments: withFiles, now });
    } catch (error) {
      setText(trimmed);
      setFiles(withFiles);
      notify({ title: "Not sent", message: errorMessage(error), tone: "danger" });
    }
  };
  latest.current = { send: (value) => void send(value) };
  const runShell = async () => {
    const command = text.trim().replace(/^!\s*/, "");
    setText("");
    try {
      await call("sessions.runShell", { id: meta.id, command });
    } catch (error) {
      setText(`! ${command}`);
      notify({ title: "The command didn't run", message: errorMessage(error), tone: "danger" });
    }
  };
  const remember = (line: string) => {
    const save = async (scope: "project" | "user") => {
      try {
        const { path } = await call("sessions.remember", { id: meta.id, text: line, scope });
        setText("");
        notify({ title: "Claude will remember that", message: `Added to ${path}`, tone: "success" });
      } catch (error) {
        notify({ title: "Couldn't remember it", message: errorMessage(error), tone: "danger" });
      }
    };
    if (!box.current) return;
    openMenuAt(box.current, [
      { heading: "Remember in CLAUDE.md" },
      {
        label: "This project (CLAUDE.md in the chat's folder)",
        onSelect: () => void save("project"),
        testId: "remember-project",
      },
      {
        label: "All your projects (~/.claude/CLAUDE.md)",
        onSelect: () => void save("user"),
        testId: "remember-user",
      },
    ]);
  };
  const submit = (now = false) => {
    if (mode === "shell") void runShell();
    else if (mode === "memory") remember(text.replace(/^#\s*/, ""));
    else void send(text, files, now);
  };

  const moreMenu = (base: { commands: MenuEntry; mention: MenuEntry; attach: MenuEntry }): MenuEntry[] => [
    base.commands,
    base.mention,
    {
      label: "Run a shell command",
      icon: SquareTerminal,
      shortcut: "!",
      onSelect: () => input.start("! "),
      testId: "more-shell",
    },
    { label: "Remember in CLAUDE.md", icon: BookmarkPlus, shortcut: "#", onSelect: () => input.start("# ") },
    base.attach,
    {
      label: talking ? `Stop talking with ${who}` : `Talk with ${who}`,
      icon: AudioLines,
      onSelect: () => toggleVoice(meta.id, speechHooks),
      testId: "more-voice",
    },
    { separator: true },
    {
      label: "Model and effort…",
      icon: Bot,
      onSelect: () => box.current && openMenuAt(box.current, modelMenu(meta)),
    },
    {
      label: "Permission mode…",
      icon: Shield,
      shortcut: "Shift+Tab",
      onSelect: () => box.current && openMenuAt(box.current, permissionMenu(meta)),
    },
    { label: "MCP servers…", icon: Plug, onSelect: () => openMcpDialog(meta.id) },
    { label: "Folders for this chat…", icon: FolderPlus, onSelect: () => openFoldersDialog(meta.id) },
    { label: "Export as Markdown…", icon: Download, onSelect: () => void exportChat(meta) },
    { label: "New chat", icon: SquarePlus, onSelect: () => void newSession(meta.projectId, meta.cwd) },
    { label: "Open a saved chat…", icon: MessageSquareShare, onSelect: openSavedChatsDialog },
  ];
  const userHistory = (sent ?? []).flatMap((i) => (i.kind === "user" && i.text && !i.from ? [i.text] : []));

  /** The chat's own keys: send or queue, the mode, Claude Code's suggestion, earlier messages. */
  const keys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      void call("sessions.setPermissionMode", {
        id: meta.id,
        mode: nextPermissionMode(meta.permissionMode, caps.planMode),
      });
    } else if (e.key === "Tab" && !text && suggestion) {
      e.preventDefault();
      setText(suggestion);
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(busy && (e.ctrlKey || e.metaKey));
    } else if (e.key === "Escape" && busy) {
      e.preventDefault();
      void call("sessions.interrupt", { id: meta.id });
    } else if (
      (e.key === "ArrowUp" || e.key === "ArrowDown") &&
      !e.shiftKey &&
      (e.key === "ArrowUp"
        ? !text.slice(0, el.selectionStart).includes("\n") && (!text || history.index >= 0)
        : history.index >= 0 && !text.slice(el.selectionEnd).includes("\n"))
    ) {
      const step = historyStep(
        userHistory,
        history.index,
        e.key === "ArrowUp" ? "up" : "down",
        history.index === -1 ? text : history.draft,
      );
      if (!step) return;
      e.preventDefault();
      setHistory({ index: step.index, draft: history.index === -1 ? text : history.draft });
      setText(step.text);
      // A recalled "/command" doesn't open the picker; typing does.
      const recalled = tokenAt(step.text, step.text.length);
      input.setClosedAt(recalled ? `${recalled.kind}:${recalled.start}` : undefined);
    }
  };

  return (
    <div
      className="shrink-0 border-t border-line bg-canvas pt-2 pb-3"
      style={{ paddingRight: "var(--jig-scrollbar-size)" }}
    >
      <div className="mx-auto flex max-w-[var(--jig-chat-width)] flex-col gap-2 px-6">
        {queue.length > 0 && (
          <div className="flex flex-col gap-1" data-testid="queue">
            <div className="text-2xs font-medium text-hint uppercase">Sends after this turn</div>
            {queue.map((q) => (
              // The whole row edits the message (a modal); its buttons send it now or remove it.
              <div
                key={q.id}
                role="button"
                tabIndex={0}
                title="Edit this message before it is sent"
                data-testid="queue-item"
                onClick={() => openEditQueuedDialog(meta.id, q)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                  e.preventDefault();
                  openEditQueuedDialog(meta.id, q);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md bg-surface px-2 py-1 text-xs hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className="flex min-w-0 flex-1 items-center gap-1">
                  {q.attachments?.length ? (
                    <span className="flex shrink-0 items-center gap-0.5 text-muted">
                      <Paperclip className="size-3" />
                      {q.attachments.length}
                    </span>
                  ) : null}
                  <span className="min-w-0 truncate">{q.text}</span>
                </span>
                {busy && (
                  <IconButton
                    icon={Zap}
                    size="sm"
                    label={`Send now: ${who} reads it at its next step`}
                    data-testid="queue-send-now"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await call("sessions.removeQueued", { id: meta.id, queuedId: q.id });
                      await send(q.text, q.attachments ?? [], true);
                    }}
                  />
                )}
                <IconButton
                  icon={X}
                  size="sm"
                  label="Remove from queue"
                  data-testid="queue-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    void call("sessions.removeQueued", { id: meta.id, queuedId: q.id });
                  }}
                />
              </div>
            ))}
          </div>
        )}
        {suggestion && (
          <div className="flex min-w-0 items-center gap-1" data-testid="suggestion">
            <button
              type="button"
              title="Claude Code's suggestion for your next message — click to edit it, or Tab in the empty box"
              onClick={() => {
                setText(suggestion);
                ref.current?.focus();
              }}
              className="flex h-6 min-w-0 items-center gap-1.5 rounded-full border border-line bg-accent-soft px-2.5 text-xs text-fg hover:border-accent"
            >
              <Sparkles className="size-3 shrink-0 text-accent" />
              <span className="truncate">{suggestion}</span>
            </button>
            <IconButton
              icon={ArrowUp}
              size="sm"
              label="Send this suggestion"
              data-testid="suggestion-send"
              onClick={() => void send(suggestion)}
            />
          </div>
        )}
        {(prompts.length > 0 || toolbar.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {toolbar.map((item) => (
              <ErrorBoundary key={item.id} label={item.id}>
                <item.component sessionId={meta.id} projectId={meta.projectId} />
              </ErrorBoundary>
            ))}
            {prompts.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant="secondary"
                onClick={() => (p.send ? void send(p.text) : setText(text ? `${text}\n${p.text}` : p.text))}
              >
                {p.label}
              </Button>
            ))}
          </div>
        )}
        {mode && (
          <div className="flex items-center gap-2 text-2xs" data-testid="composer-mode">
            {mode === "shell" ? (
              <span className="flex items-center gap-1 font-medium text-warning">
                <SquareTerminal className="size-3" /> Shell: runs in {meta.cwd}; Claude sees the output with
                your next message
              </span>
            ) : (
              <span className="flex items-center gap-1 font-medium text-info">
                <BookmarkPlus className="size-3" /> Remember: Enter to choose which CLAUDE.md
              </span>
            )}
          </div>
        )}
        <ComposerBox
          input={input}
          files={files}
          onFiles={setFiles}
          sessionId={meta.id}
          cwd={meta.cwd}
          dictationTarget={meta.id}
          boxRef={box}
          testId="composer"
          inputTestId="composer-input"
          borderClass={
            mode === "shell"
              ? "border-warning"
              : meta.permissionMode === "plan"
                ? "border-accent"
                : "border-line-strong"
          }
          placeholder={
            busy
              ? `${who} is working — Enter queues your message, ${formatShortcut("Mod+Enter")} sends it now`
              : suggestion
                ? `${suggestion}  (Tab to use)`
                : `Message ${who}…  / commands · @ files · ! shell · # remember`
          }
          localCommands={localCommands}
          onRunCommand={(value) => void send(value, files)}
          moreMenu={moreMenu}
          moreLabel="Commands, files, shell, memory and chat settings"
          onKeyDown={keys}
          toolbarStart={
            <>
              <VoiceButton target={meta.id} hooks={speechHooks} />
              {meta.kind !== "builder" && (
                <IconButton
                  icon={Split}
                  label="Try several ways: this task in parallel chats, each in its own copy of the repo"
                  data-testid="composer-attempts"
                  onClick={() => openAttemptsDialog({ task: text, projectId: meta.projectId })}
                />
              )}
            </>
          }
          toolbarEnd={
            <>
              {meta.kind !== "builder" && (
                <ProviderPicker
                  meta={meta}
                  fresh={canChangeProvider(meta, sent?.length ?? 0, queue.length)}
                />
              )}
              <button
                type="button"
                data-testid="model-menu"
                onClick={(e) => void openModelMenu(e.currentTarget, meta)}
                className="flex h-7 min-w-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-sm leading-none text-muted hover:bg-hover hover:text-fg"
                title={
                  meta.activeModel
                    ? `Model and effort · ${who === "Claude" ? "Claude Code" : "Codex"} reports: ${meta.activeModel}`
                    : `Model and effort · ${modelName}`
                }
              >
                <span className="truncate">{modelName}</span>{" "}
                <ChevronDown className="block size-3.5 shrink-0" />
              </button>
              {busy && (
                <Button
                  size="icon"
                  variant="secondary"
                  icon={Square}
                  aria-label="Stop (Esc)"
                  title="Stop (Esc)"
                  data-testid="composer-stop"
                  onClick={() => void call("sessions.interrupt", { id: meta.id })}
                />
              )}
              {busy && (text.trim() || files.length > 0) && !mode && (
                <IconButton
                  icon={Zap}
                  size="sm"
                  label={`Send now: ${who} reads it at its next step (${formatShortcut("Mod+Enter")})`}
                  data-testid="composer-send-now"
                  onClick={() => void send(text, files, true)}
                />
              )}
              <Button
                size="icon"
                variant="primary"
                icon={mode === "shell" ? SquareTerminal : mode === "memory" ? BookmarkPlus : ArrowUp}
                aria-label={sendLabel}
                title={sendLabel}
                disabled={!text.trim() && files.length === 0}
                data-testid="composer-send"
                onClick={() => submit()}
              />
            </>
          }
        />
        <div className="flex items-center gap-1 text-2xs text-hint">
          <History className="size-3" />
          {busy
            ? `Enter queues · ${formatShortcut("Mod+Enter")} sends now · Esc stops ${who}`
            : "Enter to send · Shift+Enter new line · / commands · @ files · ! shell · # remember · ↑ earlier messages · Shift+Tab mode"}
        </div>
      </div>
    </div>
  );
}
