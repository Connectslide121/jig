import { AtSign, Paperclip, Plus, Slash, Sparkles, Video } from "lucide-react";
import {
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChatAttachment, SlashCommandInfo } from "../../../shared/engine";
import { fuzzyFilter } from "../../../shared/fuzzy";
import type { MethodResult } from "../../../shared/ipc";
import { call, errorMessage } from "../../lib/host";
import { cn, FileIcon, IconButton, type MenuEntry, openMenuAt } from "../../ui";
import { mayTakeFocus } from "../../workbench/takeFocus";
import { notify } from "../../workbench/toasts";
import { chatTime } from "../meetings/format";
import { DictationButton, toggleDictation } from "../speech/DictationButton";
import { cancelDictation, useDictation } from "../speech/dictation";
import { type DictationSpan, placeDictation } from "../speech/protocol";
import { addFiles, ChatAttachments } from "./ChatAttachments";
import {
  ChatMentionIcon,
  MentionChips,
  MentionHighlights,
  openMention,
  rememberChatName,
  useLiveMentions,
} from "./ComposerMentions";
import { ComposerPicker, type PickerItem } from "./ComposerPicker";
import { chatCommands, TERMINAL_ONLY } from "./commands";
import { inputMode, mentionScope, mentionsIn, removeMention, replaceToken, tokenAt } from "./composerInput";
import { withoutEmptyFiles } from "./pastedFiles";

/** Files Claude Code reads itself when mentioned with @. */
const TEXT_FILE =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|txt|css|scss|html|cs|csproj|sln|py|go|rs|java|kt|rb|php|sh|ps1|yml|yaml|toml|xml|sql|vue|svelte|env|ini|cfg|config|props|targets|bicep|tf)$/i;

function relativeTo(cwd: string, path: string): string {
  const norm = (p: string) => p.replaceAll("\\", "/");
  const base = norm(cwd).replace(/\/$/, "");
  const p = norm(path);
  return p.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? p.slice(base.length + 1) : p;
}

/** A Claude Code command Jig answers with its own menu; picking it runs it right away. */
export interface BoxCommand {
  name: string;
  description: string;
  run: (anchor: HTMLElement) => void;
}

function commandItems(
  commands: SlashCommandInfo[] | undefined,
  local: BoxCommand[],
  query: string,
): PickerItem[] {
  const own = local.map((c) => ({
    id: `jig:${c.name}`,
    name: c.name,
    value: `/${c.name}`,
    label: `/${c.name}`,
    description: c.description,
    icon: <Slash className="size-3.5 text-accent" />,
  }));
  const remote = (commands ?? [])
    .filter((c) => !TERMINAL_ONLY.has(c.name) && !local.some((l) => l.name === c.name))
    .map((c) => ({
      id: `cc:${c.name}`,
      name: [c.name, ...(c.aliases ?? [])].join(" "),
      value: `/${c.name}`,
      label: `/${c.name}`,
      hint: c.argumentHint || undefined,
      description: c.description,
      icon: c.builtin ? <Slash className="size-3.5" /> : <Sparkles className="size-3.5" />,
    }));
  return fuzzyFilter([...remote, ...own], query, (c) => c.name, 60);
}

/** The text of a message box, its caret and dictation: owned by the view that sends or saves it. */
export function useComposerText(initial: string | (() => string)) {
  const [text, setTextState] = useState(initial);
  /** The text as last set: the field shows it only after the next render. */
  const latestText = useRef(text);
  const [caret, setCaret] = useState(0);
  /** The `/` or `@` word whose picker was closed with Esc. */
  const [closedAt, setClosedAt] = useState<string>();
  const ref = useRef<HTMLTextAreaElement>(null);

  const setText = (value: string, at = value.length) => {
    latestText.current = value;
    setTextState(value);
    setCaret(at);
    requestAnimationFrame(() => ref.current?.setSelectionRange(at, at));
  };
  /** Starts the message with a prefix (`/`, `@`, `! `) and opens its picker. */
  const start = (prefix: string) => {
    setText(prefix);
    setClosedAt(undefined);
    ref.current?.focus();
  };

  /** Where the words being dictated are, replaced as they come in. */
  const spoken = useRef<{ span: DictationSpan; text: string }>(undefined);
  /**
   * What you say goes where the caret is (read from the field: it may have changed meanwhile), and
   * is replaced as Whisper hears more; `final` is the last time.
   */
  const dictated = (words: string, final: boolean) => {
    const el = ref.current;
    // Not the field's value: a word that just came in may not be on screen yet.
    const value = latestText.current;
    const last = spoken.current;
    let span = last?.span;
    if (last && value.slice(last.span.start, last.span.end) !== last.text) {
      // You typed meanwhile: find the words again, or start over at the caret.
      const at = last.text ? value.indexOf(last.text) : -1;
      span = at >= 0 ? { start: at, end: at + last.text.length } : undefined;
    }
    span ??= { start: el?.selectionStart ?? caret, end: el?.selectionEnd ?? caret };
    const next = placeDictation(value, span, words);
    setText(next.text, next.caret);
    spoken.current = final
      ? undefined
      : { span: next.span, text: next.text.slice(next.span.start, next.span.end) };
    // Words keep arriving after you moved on to type elsewhere: they don't pull the caret back (D-374).
    if (mayTakeFocus(el)) el?.focus();
  };
  // Dictation keeps its callback for as long as it runs: always call this render's function.
  const latestDictated = useRef(dictated);
  latestDictated.current = dictated;
  const onDictation = useCallback(
    (words: string, final: boolean) => latestDictated.current(words, final),
    [],
  );

  return {
    text,
    setText,
    /** Sets the text as typed (the caret where the field has it). */
    setTyped: (value: string, at: number) => {
      latestText.current = value;
      setTextState(value);
      setCaret(at);
    },
    latestText,
    caret,
    setCaret,
    closedAt,
    setClosedAt,
    ref,
    start,
    onDictation,
  };
}
export type ComposerText = ReturnType<typeof useComposerText>;

/**
 * The message box: its text with `/` and `@` pickers and mention highlights, attachments (pasted,
 * dropped or attached), and the + menu, paperclip and microphone. The chat's composer and the
 * queued-message dialog both use it; each adds its own buttons and keys (D-308).
 */
export function ComposerBox({
  input,
  files,
  onFiles,
  sessionId,
  cwd,
  dictationTarget,
  placeholder,
  localCommands = [],
  onRunCommand,
  moreMenu,
  moreLabel,
  onKeyDown,
  borderClass = "border-line-strong",
  fill = false,
  boxRef,
  toolbarStart,
  toolbarEnd,
  testId,
  inputTestId,
  inputLabel,
}: {
  input: ComposerText;
  files: ChatAttachment[];
  onFiles: Dispatch<SetStateAction<ChatAttachment[]>>;
  sessionId: string;
  cwd: string;
  /** Whom dictation writes for: the chat, or another box of the same chat. */
  dictationTarget: string;
  placeholder: string;
  localCommands?: BoxCommand[];
  /** A command picked that takes no arguments; left out, it goes in the text like any other. */
  onRunCommand?: (value: string) => void;
  /** The + menu, given the entries every box has. */
  moreMenu: (base: { commands: MenuEntry; mention: MenuEntry; attach: MenuEntry }) => MenuEntry[];
  moreLabel: string;
  /** Keys the pickers and dictation didn't take (send, history…). */
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** The border while no file is dragged over it (the chat's mode colours it). */
  borderClass?: string;
  /**
   * Fills the height it is given, with a row kept for attachments (a dialog); otherwise it grows with
   * its text (the chat).
   */
  fill?: boolean;
  boxRef?: RefObject<HTMLDivElement | null>;
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  testId?: string;
  inputTestId?: string;
  inputLabel?: string;
}) {
  const { text, setText, caret, closedAt, setClosedAt, ref } = input;
  const ownBox = useRef<HTMLDivElement>(null);
  const box = boxRef ?? ownBox;
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState(0);
  const [commands, setCommands] = useState<SlashCommandInfo[]>();
  const [found, setFound] = useState<{ query: string; files: string[] }>();
  const [meetings, setMeetings] = useState<{ query: string; list: MethodResult<"meetings.mentions"> }>();
  const [teamsChats, setTeamsChats] = useState<{
    query: string;
    list: MethodResult<"meetings.chatMentions">;
  }>();
  const [scrollTop, setScrollTop] = useState(0);
  const mode = inputMode(text);
  // Mentioned files, folders and meetings: highlighted in the text and shown as chips.
  const allMentions = useMemo(() => (mode ? [] : mentionsIn(text)), [text, mode]);
  const mentions = useLiveMentions(cwd, allMentions);
  const dictating = useDictation((s) => s.target === dictationTarget && s.phase === "recording");

  // The `/` and `@` pickers follow the word at the caret.
  const token = tokenAt(text, caret);
  const tokenKey = token ? `${token.kind}:${token.start}` : undefined;
  const pickerOpen = Boolean(token) && closedAt !== tokenKey;
  // Asked again each time the menu opens (cached for a moment), so new skills show and an error retries.
  useEffect(() => {
    if (!pickerOpen) setCommands(undefined);
  }, [pickerOpen]);
  useEffect(() => {
    if (pickerOpen && token?.kind === "command" && !commands)
      void chatCommands(sessionId)
        .then(setCommands)
        .catch(() => setCommands([]));
  }, [pickerOpen, token?.kind, commands, sessionId]);
  const fileQuery = pickerOpen && token?.kind === "file" ? token.query : undefined;
  useEffect(() => {
    if (fileQuery === undefined) return;
    const timer = setTimeout(() => {
      void call("files.search", { root: cwd, query: fileQuery, limit: 40 })
        .then((list) => setFound({ query: fileQuery, files: list }))
        .catch(() => setFound({ query: fileQuery, files: [] }));
    }, 80);
    return () => clearTimeout(timer);
  }, [fileQuery, cwd]);
  // Meetings Jig kept can be mentioned too (D-250); none while the Meetings add-on is off.
  useEffect(() => {
    if (fileQuery === undefined) return;
    const timer = setTimeout(() => {
      void call("meetings.mentions", { query: fileQuery })
        .then((list) => setMeetings({ query: fileQuery, list }))
        .catch(() => setMeetings({ query: fileQuery, list: [] }));
    }, 80);
    return () => clearTimeout(timer);
  }, [fileQuery]);
  // And Teams chats (D-333): none while the Meetings add-on is off or Microsoft isn't connected.
  useEffect(() => {
    if (fileQuery === undefined) return;
    const timer = setTimeout(() => {
      void call("meetings.chatMentions", { query: fileQuery })
        .then((list) => {
          for (const c of list) rememberChatName(c.id, c);
          setTeamsChats({ query: fileQuery, list });
        })
        .catch(() => setTeamsChats({ query: fileQuery, list: [] }));
    }, 80);
    return () => clearTimeout(timer);
  }, [fileQuery]);
  const scope = token?.kind === "file" ? mentionScope(token.query) : undefined;
  const items: PickerItem[] = useMemo(() => {
    if (!pickerOpen || !token) return [];
    if (token.kind === "command") return commandItems(commands, localCommands, token.query);
    const files: PickerItem[] = (found?.files ?? []).map((f) => ({
      id: f,
      value: `@${f}`,
      label: f,
      icon: <FileIcon path={f} folder={f.endsWith("/")} className="size-3.5" />,
    }));
    const kept: PickerItem[] = (meetings?.list ?? []).map((m) => ({
      id: `meeting:${m.id}`,
      value: m.mention,
      label: m.title,
      description: `Meeting · ${new Date(m.startedAt).toLocaleDateString()}`,
      plain: true,
      icon: <Video className="size-3.5 text-muted" />,
    }));
    const chats: PickerItem[] = (teamsChats?.list ?? []).map((c) => ({
      id: `chat:${c.id}`,
      value: c.mention,
      label: c.name,
      description: `Teams chat · ${chatTime(c.at)}`,
      plain: true,
      icon: <ChatMentionIcon kind={c.kind} peerId={c.peerId} />,
    }));
    // `@meeting…` lists only meetings and `@chat…` only Teams chats (D-333); otherwise files lead,
    // then a few meetings, and Teams chats once you type a name.
    if (scope === "meeting") return kept;
    if (scope === "chat") return chats;
    return [...files, ...kept, ...(token.query ? chats.slice(0, 3) : [])];
  }, [pickerOpen, token, commands, localCommands, found, meetings, teamsChats, scope]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: back to the first item when the list changes.
  useEffect(() => setSelected(0), [tokenKey, token?.query]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: resize whenever the text changes.
  useEffect(() => {
    const el = ref.current;
    if (!el || fill) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text, fill]);

  const pick = (item: PickerItem) => {
    if (!token) return;
    const local =
      token.kind === "command" ? localCommands.find((c) => `/${c.name}` === item.value) : undefined;
    if (local) {
      setText("");
      if (box.current) local.run(box.current);
      return;
    }
    // A command without arguments runs right away, as in Claude Code.
    if (onRunCommand && token.kind === "command" && !item.hint && !text.slice(token.end).trim()) {
      onRunCommand(item.value);
      return;
    }
    const next = replaceToken(text, token, item.value);
    setText(next.text, next.caret);
    ref.current?.focus();
  };

  /** Adds attachments one by one, so one unsupported file doesn't drop the others. */
  const keep = async (adds: Array<() => Promise<ChatAttachment>>) => {
    for (const add of adds) {
      try {
        const added = await add();
        onFiles((list) => [...list, added]);
      } catch (error) {
        notify({ title: "Couldn't attach the file", message: errorMessage(error), tone: "danger" });
      }
    }
  };
  /** Pasted or dropped files (screenshots, PDFs, Office files…) become attachments of the message. */
  const takeFiles = (list: FileList | File[]): boolean => {
    if (list.length === 0) return false;
    const { files, notice } = withoutEmptyFiles(list);
    if (notice) notify({ ...notice, tone: "danger" });
    void keep(files.map((file) => () => addFiles(sessionId, [file]).then((r) => r[0]!)));
    return true;
  };
  const attach = async () => {
    const picked = await call("app.pickFiles", { title: "Attach files", defaultPath: cwd });
    if (!picked.length) return;
    // Code and text files inside the project are mentioned (Claude Code reads the current version and
    // can edit it); everything else — images, PDFs, Office files, files from elsewhere — is attached.
    const inProject = (f: string) => relativeTo(cwd, f) !== f.replaceAll("\\", "/");
    const mention = picked.filter((f) => inProject(f) && TEXT_FILE.test(f));
    const attachments = picked.filter((f) => !mention.includes(f));
    if (mention.length) {
      const mentions = mention.map((f) => `@${relativeTo(cwd, f)}`).join(" ");
      const current = input.latestText.current;
      setText(current ? `${current.trimEnd()} ${mentions} ` : `${mentions} `);
    }
    void keep(attachments.map((path) => () => call("sessions.addAttachment", { id: sessionId, path })));
    ref.current?.focus();
  };
  const base = {
    commands: {
      label: "Commands and skills",
      icon: Slash,
      shortcut: "/",
      onSelect: () => input.start("/"),
      testId: "more-commands",
    },
    mention: {
      label: "Mention a file or folder",
      icon: AtSign,
      shortcut: "@",
      onSelect: () => input.start(text ? `${text.trimEnd()} @` : "@"),
      testId: "more-mention",
    },
    attach: { label: "Attach files…", icon: Paperclip, onSelect: () => void attach(), testId: "more-attach" },
  } satisfies Record<string, MenuEntry>;

  // The focus goes back to the text, so Esc and Ctrl+Enter still work after the × is gone.
  const remove = (file: ChatAttachment) => {
    onFiles((list) => list.filter((f) => f !== file));
    ref.current?.focus();
  };
  const chips = (
    <MentionChips
      cwd={cwd}
      mentions={mentions}
      onRemove={(m) => {
        const next = removeMention(text, m);
        setText(next.text, next.caret);
        ref.current?.focus();
      }}
    />
  );

  return (
    <div
      ref={box}
      className={cn(
        "relative flex flex-col gap-2 rounded-lg border bg-raised p-1.5 focus-within:border-focus",
        fill && "h-full min-h-0",
        dragging ? "border-accent" : borderClass,
      )}
      data-testid={testId}
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
            token.kind === "command"
              ? "Commands and skills"
              : scope === "chat"
                ? "Teams chats"
                : scope === "meeting"
                  ? "Meetings"
                  : meetings?.list.length
                    ? `Files in ${cwd.split(/[\\/]/).pop()} and meetings`
                    : `Files in ${cwd.split(/[\\/]/).pop()}`
          }
          items={items}
          selected={selected}
          loading={
            token.kind === "command"
              ? !commands
              : scope === "chat"
                ? teamsChats?.query !== token.query
                : scope === "meeting"
                  ? meetings?.query !== token.query
                  : found?.query !== token.query
          }
          empty={
            token.kind === "command"
              ? "No command matches"
              : scope === "chat"
                ? "No Teams chat matches (connect Microsoft in Meetings to mention chats)"
                : scope === "meeting"
                  ? "No meeting matches"
                  : "No file matches"
          }
          onPick={pick}
          onHover={setSelected}
          // In a dialog, the list floats above it instead of being cut off by the dialog's edges.
          anchor={fill ? box.current : undefined}
        />
      )}
      {fill ? (
        // A row kept for attachments, so adding or removing one moves nothing.
        <div className="flex h-18 shrink-0 items-center px-1 pt-1.5" data-testid="composer-attachments">
          {files.length === 0 ? (
            <div className="flex h-16 w-full items-center justify-center rounded-md border border-dashed border-line text-xs text-hint">
              Paste a screenshot, drop files here or attach them with the paperclip
            </div>
          ) : (
            <ChatAttachments
              files={files}
              row
              className="h-full w-full items-center pr-1.5"
              onRemove={remove}
            />
          )}
        </div>
      ) : (
        <ChatAttachments files={files} className="px-1 pt-1" onRemove={remove} />
      )}
      {!fill && chips}
      <div className={cn("relative", fill && "min-h-0 flex-1")}>
        <MentionHighlights text={text} mentions={mentions} scrollTop={scrollTop} />
        <textarea
          ref={ref}
          rows={1}
          value={text}
          aria-label={inputLabel}
          data-testid={inputTestId}
          placeholder={placeholder}
          onChange={(e) => {
            input.setTyped(e.target.value, e.target.selectionStart);
            setClosedAt(undefined);
          }}
          onSelect={(e) => input.setCaret(e.currentTarget.selectionStart)}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          onClick={(e) => {
            // Ctrl/Cmd+click on a mention opens it, like a link in an editor.
            if (!(e.ctrlKey || e.metaKey)) return;
            const at = e.currentTarget.selectionStart;
            const hit = mentions.find((m) => at >= m.start && at <= m.end);
            if (hit) openMention(cwd, hit);
          }}
          onPaste={(e) => {
            if (takeFiles(e.clipboardData.files)) e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (e.code === "Space" && e.shiftKey && (e.ctrlKey || e.metaKey) && !e.altKey) {
              e.preventDefault();
              if (!e.repeat) toggleDictation(dictationTarget, input.onDictation);
              return;
            }
            if (e.key === "Escape" && dictating) {
              e.preventDefault();
              e.stopPropagation();
              cancelDictation();
              return;
            }
            if (pickerOpen && (items.length > 0 || e.key === "Escape")) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const step = e.key === "ArrowDown" ? 1 : -1;
                setSelected((i) => (i + step + items.length) % Math.max(items.length, 1));
                return;
              }
              if (
                (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) ||
                (e.key === "Tab" && !e.shiftKey)
              ) {
                e.preventDefault();
                const item = items[selected];
                if (item) pick(item);
                return;
              }
              if (e.key === "Escape") {
                // Closes the list only, not the dialog the box may be in.
                e.preventDefault();
                e.stopPropagation();
                setClosedAt(tokenKey);
                return;
              }
            }
            onKeyDown?.(e);
          }}
          className={cn(
            "relative block w-full resize-none bg-transparent px-1.5 py-1 text-sm text-fg outline-none placeholder:text-hint",
            fill ? "h-full" : "max-h-80 min-h-7",
          )}
        />
      </div>
      {fill && chips}
      <div className="@container/toolbar flex min-w-0 items-center gap-1" data-testid="composer-toolbar">
        <IconButton
          icon={Plus}
          label={moreLabel}
          data-testid="composer-more"
          onClick={(e) => openMenuAt(e.currentTarget, moreMenu(base))}
        />
        <IconButton
          icon={Paperclip}
          label="Attach files (images, PDF, Word, Excel, PowerPoint, text)"
          data-testid="composer-attach"
          onClick={() => void attach()}
        />
        <DictationButton target={dictationTarget} onText={input.onDictation} />
        {toolbarStart}
        <div className="flex-1" />
        {toolbarEnd}
      </div>
    </div>
  );
}
