import {
  ArrowUp,
  AtSign,
  BookmarkPlus,
  Bot,
  Download,
  FolderPlus,
  History,
  ListChecks,
  Paperclip,
  Plug,
  Plus,
  Shield,
  Slash,
  Sparkles,
  Split,
  Square,
  SquarePlus,
  SquareTerminal,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ChatAttachment,
  PERMISSION_MODE_LABELS,
  type QueuedMessage,
  type SessionMeta,
  type SlashCommandInfo,
} from "../../../shared/engine";
import { fuzzyFilter } from "../../../shared/fuzzy";
import { call, errorMessage } from "../../lib/host";
import { Button, cn, ErrorBoundary, FileIcon, IconButton, type MenuEntry, openMenuAt } from "../../ui";
import { useRegistry } from "../../workbench/registry";
import { notify } from "../../workbench/toasts";
import { openAttemptsDialog } from "../attempts/AttemptsDialog";
import { newSession } from "./actions";
import { addFiles, ChatAttachments } from "./ChatAttachments";
import { ComposerPicker, type PickerItem } from "./ComposerPicker";
import { chatCommands, TERMINAL_ONLY } from "./commands";
import { historyStep, inputMode, nextPermissionMode, replaceToken, tokenAt } from "./composerInput";
import { registerComposer, takeDraft } from "./drafts";
import { exportChat, modelMenu, permissionMenu } from "./menus";
import { usePrompts } from "./prompts";
import { openFoldersDialog, openMcpDialog } from "./SessionDialogs";
import { useSessions } from "./store";

/** Files Claude Code reads itself when mentioned with @. */
const TEXT_FILE =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|txt|css|scss|html|cs|csproj|sln|py|go|rs|java|kt|rb|php|sh|ps1|yml|yaml|toml|xml|sql|vue|svelte|env|ini|cfg|config|props|targets|bicep|tf)$/i;

function relativeTo(cwd: string, path: string): string {
  const norm = (p: string) => p.replaceAll("\\", "/");
  const base = norm(cwd).replace(/\/$/, "");
  const p = norm(path);
  return p.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? p.slice(base.length + 1) : p;
}

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

function commandItems(commands: SlashCommandInfo[] | undefined, query: string): PickerItem[] {
  const local = LOCAL_COMMANDS.map((c) => ({
    id: `jig:${c.name}`,
    name: c.name,
    value: `/${c.name}`,
    label: `/${c.name}`,
    description: c.description,
    icon: <Slash className="size-3.5 text-accent" />,
  }));
  const remote = (commands ?? [])
    .filter((c) => !TERMINAL_ONLY.has(c.name) && !LOCAL_COMMANDS.some((l) => l.name === c.name))
    .map((c) => ({
      id: `cc:${c.name}`,
      name: [c.name, ...(c.aliases ?? [])].join(" "),
      value: `/${c.name}`,
      label: `/${c.name}`,
      hint: c.argumentHint || undefined,
      description: c.description,
      icon: c.builtin ? <Slash className="size-3.5" /> : <Sparkles className="size-3.5" />,
    }));
  return fuzzyFilter([...remote, ...local], query, (c) => c.name, 60);
}

export function Composer({
  meta,
  queue,
  active,
}: {
  meta: SessionMeta;
  queue: QueuedMessage[];
  active: boolean;
}) {
  const [text, setTextState] = useState(() => takeDraft(meta.id));
  const [caret, setCaret] = useState(0);
  const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState(0);
  const [closedAt, setClosedAt] = useState<string>();
  const [commands, setCommands] = useState<SlashCommandInfo[]>();
  const [found, setFound] = useState<{ query: string; files: string[] }>();
  const [history, setHistory] = useState<{ index: number; draft: string }>({ index: -1, draft: "" });
  const ref = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const prompts = Object.values(usePrompts());
  const toolbar = Object.values(useRegistry((s) => s.chatToolbar));
  const sent = useSessions((s) => s.transcripts[meta.id]?.items);
  const busy = meta.status === "working" || meta.status === "needs_you" || meta.status === "starting";
  const suggestion = busy ? undefined : meta.suggestion;
  const mode = inputMode(text);

  const setText = (value: string, at = value.length) => {
    setTextState(value);
    setCaret(at);
    requestAnimationFrame(() => ref.current?.setSelectionRange(at, at));
  };

  // The `/` and `@` pickers follow the word at the caret.
  const token = tokenAt(text, caret);
  const tokenKey = token ? `${token.kind}:${token.start}` : undefined;
  const pickerOpen = Boolean(token) && closedAt !== tokenKey;
  useEffect(() => {
    if (pickerOpen && token?.kind === "command" && !commands)
      void chatCommands(meta.id)
        .then(setCommands)
        .catch(() => setCommands([]));
  }, [pickerOpen, token?.kind, commands, meta.id]);
  const fileQuery = pickerOpen && token?.kind === "file" ? token.query : undefined;
  useEffect(() => {
    if (fileQuery === undefined) return;
    const timer = setTimeout(() => {
      void call("files.search", { root: meta.cwd, query: fileQuery, limit: 40 })
        .then((list) => setFound({ query: fileQuery, files: list }))
        .catch(() => setFound({ query: fileQuery, files: [] }));
    }, 80);
    return () => clearTimeout(timer);
  }, [fileQuery, meta.cwd]);
  const items: PickerItem[] = useMemo(() => {
    if (!pickerOpen || !token) return [];
    if (token.kind === "command") return commandItems(commands, token.query);
    return (found?.files ?? []).map((f) => ({
      id: f,
      value: `@${f}`,
      label: f,
      icon: <FileIcon path={f} folder={f.endsWith("/")} className="size-3.5" />,
    }));
  }, [pickerOpen, token, commands, found]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: back to the first item when the list changes.
  useEffect(() => setSelected(0), [tokenKey, token?.query]);

  useEffect(() => {
    if (active) ref.current?.focus();
  }, [active]);
  useEffect(
    () =>
      registerComposer(meta.id, (value) => {
        setTextState(value);
        setCaret(value.length);
        requestAnimationFrame(() => ref.current?.focus());
      }),
    [meta.id],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: resize whenever the text changes.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text]);

  const pick = (item: PickerItem) => {
    if (!token) return;
    const local =
      token.kind === "command" ? LOCAL_COMMANDS.find((c) => `/${c.name}` === item.value) : undefined;
    if (local) {
      setText("");
      if (box.current) local.run(meta, box.current);
      return;
    }
    // A command without arguments runs right away, as in Claude Code.
    if (token.kind === "command" && !item.hint && !text.slice(token.end).trim()) {
      void send(item.value, files);
      return;
    }
    const next = replaceToken(text, token, item.value);
    setText(next.text, next.caret);
    ref.current?.focus();
  };

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

  /** Adds attachments one by one, so one unsupported file doesn't drop the others. */
  const keep = async (adds: Array<() => Promise<ChatAttachment>>) => {
    for (const add of adds) {
      try {
        const added = await add();
        setFiles((list) => [...list, added]);
      } catch (error) {
        notify({ title: "Couldn't attach the file", message: errorMessage(error), tone: "danger" });
      }
    }
  };
  /** Pasted or dropped files (screenshots, PDFs, Office files…) become attachments of the next message. */
  const takeFiles = (list: FileList | File[]): boolean => {
    const dropped = [...list];
    if (dropped.length === 0) return false;
    void keep(dropped.map((file) => () => addFiles(meta.id, [file]).then((r) => r[0]!)));
    return true;
  };
  const attach = async () => {
    const picked = await call("app.pickFiles", { title: "Attach files", defaultPath: meta.cwd });
    if (!picked.length) return;
    // Code and text files inside the project are mentioned (Claude Code reads the current version and
    // can edit it); everything else — images, PDFs, Office files, files from elsewhere — is attached.
    const inProject = (f: string) => relativeTo(meta.cwd, f) !== f.replaceAll("\\", "/");
    const mention = picked.filter((f) => inProject(f) && TEXT_FILE.test(f));
    const attachments = picked.filter((f) => !mention.includes(f));
    if (mention.length) {
      const mentions = mention.map((f) => `@${relativeTo(meta.cwd, f)}`).join(" ");
      setText(text ? `${text.trimEnd()} ${mentions} ` : `${mentions} `);
    }
    void keep(attachments.map((path) => () => call("sessions.addAttachment", { id: meta.id, path })));
    ref.current?.focus();
  };
  const startWith = (prefix: string) => {
    setText(prefix);
    setClosedAt(undefined);
    ref.current?.focus();
  };
  const moreMenu = (): MenuEntry[] => [
    {
      label: "Commands and skills",
      icon: Slash,
      shortcut: "/",
      onSelect: () => startWith("/"),
      testId: "more-commands",
    },
    {
      label: "Mention a file or folder",
      icon: AtSign,
      shortcut: "@",
      onSelect: () => startWith(text ? `${text.trimEnd()} @` : "@"),
      testId: "more-mention",
    },
    {
      label: "Run a shell command",
      icon: SquareTerminal,
      shortcut: "!",
      onSelect: () => startWith("! "),
      testId: "more-shell",
    },
    { label: "Remember in CLAUDE.md", icon: BookmarkPlus, shortcut: "#", onSelect: () => startWith("# ") },
    { label: "Attach files…", icon: Paperclip, onSelect: () => void attach() },
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
  ];
  const userHistory = (sent ?? []).flatMap((i) => (i.kind === "user" && i.text ? [i.text] : []));

  return (
    <div className="shrink-0 border-t border-line bg-canvas px-6 pt-2 pb-3">
      <div className="mx-auto flex max-w-[var(--jig-chat-width)] flex-col gap-2">
        {queue.length > 0 && (
          <div className="flex flex-col gap-1" data-testid="queue">
            <div className="text-2xs font-medium text-hint uppercase">Sends after this turn</div>
            {queue.map((q) => (
              <div key={q.id} className="flex items-center gap-2 rounded-md bg-surface px-2 py-1 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  {q.attachments?.length ? (
                    <span className="mr-1 inline-flex items-center gap-0.5 text-muted">
                      <Paperclip className="size-3" />
                      {q.attachments.length}
                    </span>
                  ) : null}
                  {q.text}
                </span>
                {!q.attachments?.length && busy && (
                  <IconButton
                    icon={Zap}
                    size="sm"
                    label="Send now: Claude reads it at its next step"
                    data-testid="queue-send-now"
                    onClick={async () => {
                      await call("sessions.removeQueued", { id: meta.id, queuedId: q.id });
                      await send(q.text, [], true);
                    }}
                  />
                )}
                <IconButton
                  icon={X}
                  size="sm"
                  label="Remove from queue"
                  onClick={() => void call("sessions.removeQueued", { id: meta.id, queuedId: q.id })}
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
        {(mode || meta.permissionMode !== "default") && (
          <div className="flex items-center gap-2 text-2xs" data-testid="composer-mode">
            {mode === "shell" ? (
              <span className="flex items-center gap-1 font-medium text-warning">
                <SquareTerminal className="size-3" /> Shell: runs in {meta.cwd}; Claude sees the output with
                your next message
              </span>
            ) : mode === "memory" ? (
              <span className="flex items-center gap-1 font-medium text-info">
                <BookmarkPlus className="size-3" /> Remember: Enter to choose which CLAUDE.md
              </span>
            ) : (
              <span
                className={cn(
                  "flex items-center gap-1 font-medium",
                  meta.permissionMode === "bypassPermissions" ? "text-danger" : "text-accent",
                )}
              >
                {meta.permissionMode === "plan" ? (
                  <ListChecks className="size-3" />
                ) : (
                  <Shield className="size-3" />
                )}
                {PERMISSION_MODE_LABELS[meta.permissionMode]}
                {meta.permissionMode === "plan" ? ": Claude plans and doesn't change files" : ""}
                <span className="font-normal text-hint">· Shift+Tab to switch</span>
              </span>
            )}
          </div>
        )}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop zone for files; Attach does the same from a button. */}
        <div
          ref={box}
          className={cn(
            "relative flex flex-col gap-2 rounded-lg border bg-raised p-1.5 focus-within:border-focus",
            dragging
              ? "border-accent"
              : mode === "shell"
                ? "border-warning"
                : meta.permissionMode === "plan"
                  ? "border-accent"
                  : "border-line-strong",
          )}
          data-testid="composer"
          onDragOver={(e) => {
            if ([...e.dataTransfer.items].some((i) => i.kind === "file")) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            setDragging(false);
            if (takeFiles(e.dataTransfer.files)) e.preventDefault();
          }}
        >
          {pickerOpen && token && (
            <ComposerPicker
              title={
                token.kind === "command" ? "Commands and skills" : `Files in ${meta.cwd.split(/[\\/]/).pop()}`
              }
              items={items}
              selected={selected}
              loading={token.kind === "command" ? !commands : found?.query !== token.query}
              empty={token.kind === "command" ? "No command matches" : "No file matches"}
              onPick={pick}
              onHover={setSelected}
            />
          )}
          <ChatAttachments
            files={files}
            className="px-1 pt-1"
            onRemove={(file) => setFiles((list) => list.filter((f) => f !== file))}
          />
          <div className="flex items-end gap-2">
            <IconButton
              icon={Plus}
              label="Commands, files, shell, memory and chat settings"
              data-testid="composer-more"
              onClick={(e) => openMenuAt(e.currentTarget, moreMenu())}
            />
            <IconButton
              icon={Paperclip}
              label="Attach files (images, PDF, Word, Excel, PowerPoint, text)"
              onClick={() => void attach()}
            />
            {meta.kind !== "builder" && (
              <IconButton
                icon={Split}
                label="Try several ways: this task in parallel chats, each in its own copy of the repo"
                data-testid="composer-attempts"
                onClick={() => openAttemptsDialog({ task: text, projectId: meta.projectId })}
              />
            )}
            <textarea
              ref={ref}
              rows={1}
              value={text}
              data-testid="composer-input"
              placeholder={
                busy
                  ? "Claude is working — Enter queues your message, Ctrl+Enter sends it now"
                  : suggestion
                    ? `${suggestion}  (Tab to use)`
                    : "Message Claude…  / commands · @ files · ! shell · # remember"
              }
              onChange={(e) => {
                setTextState(e.target.value);
                setCaret(e.target.selectionStart);
                setClosedAt(undefined);
              }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
              onPaste={(e) => {
                if (takeFiles(e.clipboardData.files)) e.preventDefault();
              }}
              onKeyDown={(e) => {
                const el = e.currentTarget;
                if (pickerOpen && (items.length > 0 || e.key === "Escape")) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const step = e.key === "ArrowDown" ? 1 : -1;
                    setSelected((i) => (i + step + items.length) % Math.max(items.length, 1));
                    return;
                  }
                  if ((e.key === "Enter" && !e.shiftKey) || (e.key === "Tab" && !e.shiftKey)) {
                    e.preventDefault();
                    const item = items[selected];
                    if (item) pick(item);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setClosedAt(tokenKey);
                    return;
                  }
                }
                if (e.key === "Tab" && e.shiftKey) {
                  e.preventDefault();
                  void call("sessions.setPermissionMode", {
                    id: meta.id,
                    mode: nextPermissionMode(meta.permissionMode),
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
                  setClosedAt(recalled ? `${recalled.kind}:${recalled.start}` : undefined);
                }
              }}
              className="max-h-80 min-h-7 flex-1 resize-none bg-transparent py-1 text-sm text-fg outline-none placeholder:text-hint"
            />
            {busy && (
              <Button
                size="md"
                variant="secondary"
                icon={Square}
                data-testid="composer-stop"
                onClick={() => void call("sessions.interrupt", { id: meta.id })}
              >
                Stop
              </Button>
            )}
            {busy && text.trim() && !mode && files.length === 0 && (
              <IconButton
                icon={Zap}
                label="Send now: Claude reads it at its next step (Ctrl+Enter)"
                data-testid="composer-send-now"
                onClick={() => void send(text, files, true)}
              />
            )}
            <Button
              size="md"
              variant="primary"
              icon={mode === "shell" ? SquareTerminal : mode === "memory" ? BookmarkPlus : ArrowUp}
              disabled={!text.trim() && files.length === 0}
              data-testid="composer-send"
              onClick={() => submit()}
            >
              {mode === "shell" ? "Run" : mode === "memory" ? "Remember" : busy ? "Queue" : "Send"}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-1 text-2xs text-hint">
          <History className="size-3" />
          {busy
            ? "Enter queues · Ctrl+Enter sends now · Esc stops Claude"
            : "Enter to send · Shift+Enter new line · / commands · @ files · ! shell · # remember · ↑ earlier messages · Shift+Tab mode"}
        </div>
      </div>
    </div>
  );
}
