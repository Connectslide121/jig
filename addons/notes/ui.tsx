import type { AddonComponentProps, AddonUiContext } from "@jig/sdk";
import {
  Button,
  cn,
  Empty,
  Icon,
  IconButton,
  Input,
  Select,
  useActiveChat,
  useAddon,
  useAddonEvent,
  useWorkspaceList,
} from "@jig/sdk/ui";
import { Check, ExternalLink, NotebookPen, Pencil, Plus, Square, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  addNote,
  isDone,
  KIND_ORDER,
  KINDS,
  type Note,
  type NoteKind,
  noteText,
  parseLink,
  sorted,
} from "./lib/notes";

const TONES: Record<NoteKind, string> = {
  wait: "text-warning",
  where: "text-info",
  todo: "text-muted",
  note: "text-muted",
  link: "text-accent",
};

/** The active chat's notes, reloaded when they change (you here, or Claude through its tools). */
function useNotes(ctx: AddonUiContext, sessionId: string | undefined) {
  const [notes, setNotes] = useState<Note[]>();
  const load = useCallback(() => {
    if (!sessionId) return setNotes(undefined);
    void ctx.host.call<Note[]>("list", { sessionId }).then(setNotes);
  }, [ctx, sessionId]);
  useEffect(load, [load]);
  useAddonEvent("changed", (payload) => {
    if ((payload as { sessionId?: string })?.sessionId === sessionId) load();
  });
  const save = (next: Note[]) => {
    setNotes(next);
    if (sessionId) void ctx.host.call("save", { sessionId, notes: next });
  };
  return [notes, save] as const;
}

function NoteRow({
  note,
  onChange,
  onRemove,
}: {
  note: Note;
  onChange: (n: Note) => void;
  onRemove: () => void;
}) {
  const ctx = useAddon();
  const [editing, setEditing] = useState(false);
  const done = isDone(note);
  const toggles = note.kind === "wait" || note.kind === "todo";
  const editValue =
    note.kind === "where"
      ? (note.branch ?? "")
      : note.kind === "link"
        ? [note.text, note.url].filter(Boolean).join(" ")
        : note.text;
  const [value, setValue] = useState(editValue);
  const submit = () => {
    setEditing(false);
    const words = value.trim();
    if (!words) return onRemove();
    if (note.kind === "link") onChange({ ...note, ...(parseLink(words) ?? { text: words }), by: "you" });
    else if (note.kind === "where") onChange({ ...note, branch: words, by: "you" });
    else onChange({ ...note, text: words, by: "you" });
  };
  return (
    <div
      className={cn(
        "group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-hover",
        done && "opacity-60",
      )}
      data-testid={`note-${note.id}`}
    >
      {toggles ? (
        <button
          type="button"
          title={done ? "Open it again" : note.kind === "wait" ? "Mark it cleared" : "Mark it done"}
          onClick={() => onChange({ ...note, done: !note.done, by: "you" })}
          className={cn(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
            done ? "border-success bg-success text-on-accent" : cn("border-line-strong", TONES[note.kind]),
          )}
          data-testid={`note-toggle-${note.id}`}
        >
          {done ? (
            <Check className="size-3" />
          ) : note.kind === "wait" ? (
            <Icon name="hourglass" className="size-2.5" />
          ) : null}
        </button>
      ) : (
        <Icon name={KINDS[note.kind].icon} className={cn("mt-0.5 size-4 shrink-0", TONES[note.kind])} />
      )}
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <div
            className={cn(
              "text-sm break-words",
              note.kind === "wait" && !done && "text-warning",
              done && note.kind === "todo" && "line-through",
            )}
          >
            {noteText(note)}
          </div>
        )}
        <div className="text-2xs text-hint">
          {KINDS[note.kind].label}
          {note.by === "claude" ? " · by Claude" : ""}
        </div>
      </div>
      <span className="invisible flex shrink-0 items-center group-hover:visible group-focus-within:visible">
        {note.kind === "link" && note.url && (
          <IconButton
            icon={ExternalLink}
            size="sm"
            label="Open"
            onClick={() => ctx.openExternal(note.url!)}
          />
        )}
        <IconButton
          icon={Pencil}
          size="sm"
          label="Edit"
          onClick={() => {
            setValue(editValue);
            setEditing(true);
          }}
        />
        <IconButton
          icon={X}
          size="sm"
          label="Remove"
          onClick={onRemove}
          data-testid={`note-remove-${note.id}`}
        />
      </span>
    </div>
  );
}

/**
 * The chat you're in: its notes, like the notes plugin (D-147). Pick a kind, type, press Enter;
 * waits and to-dos tick off; ✎ edits, × removes. Claude reads them with its tools before it works,
 * and writes them too (they show "by Claude").
 */
export function NotesView({ ctx }: AddonComponentProps) {
  const chat = useActiveChat();
  const [notes, save] = useNotes(ctx, chat?.sessionId);
  const workspaces = useWorkspaceList();
  const [kind, setKind] = useState<NoteKind>("note");
  const [repo, setRepo] = useState("");
  const [text, setText] = useState("");
  if (!chat)
    return (
      <Empty icon={NotebookPen} title="No chat open">
        Open a chat: its notes show here.
      </Empty>
    );
  const repos = [
    ...new Set(
      workspaces.flatMap((w) =>
        w.isGitRepo ? [w.name] : w.repos.map((r) => r.name.split("/").pop() ?? r.name),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const list = sorted(notes ?? []);
  const open = list.filter((n) => (n.kind === "wait" || n.kind === "todo") && !n.done).length;
  const add = () => {
    const words = text.trim();
    const current = notes ?? [];
    if (kind === "where") {
      if (!repo && !words) return;
      save(
        addNote(current, { kind, text: "", repo: repo || undefined, branch: words || undefined, by: "you" }),
      );
    } else if (kind === "link") {
      const link = parseLink(words);
      if (!link) return ctx.notify({ title: "A link needs an address (https://…)", tone: "warning" });
      save(addNote(current, { kind, ...link, by: "you" }));
    } else {
      if (!words) return;
      save(addNote(current, { kind, text: words, by: "you" }));
    }
    setText("");
  };
  return (
    <div className="flex h-full flex-col" data-testid="notes-view">
      <div className="shrink-0 border-b border-line p-2">
        <div className="flex items-center gap-1.5 pb-2">
          <NotebookPen className="size-3.5 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium" title={chat.title}>
            {chat.title}
          </span>
          <span className="shrink-0 text-2xs text-hint">
            {open ? `${open} open` : `${list.length} note${list.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="flex gap-1.5">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as NoteKind)}
            aria-label="Kind of note"
            className="w-auto shrink-0"
            data-testid="note-kind"
          >
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KINDS[k].label}
              </option>
            ))}
          </Select>
          {kind === "where" && repos.length > 0 && (
            <Select
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              aria-label="Repository"
              className="min-w-0"
            >
              <option value="">No repository</option>
              {repos.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={KINDS[kind].placeholder}
            data-testid="note-input"
          />
          <Button size="sm" icon={Plus} onClick={add} data-testid="note-add">
            Add
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {list.length === 0 ? (
          <Empty icon={Square} title="No notes yet">
            Add one above, or ask Claude to note something.
          </Empty>
        ) : (
          list.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              onChange={(next) => save((notes ?? []).map((x) => (x.id === n.id ? next : x)))}
              onRemove={() => save((notes ?? []).filter((x) => x.id !== n.id))}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function showNotes(ctx: AddonUiContext) {
  ctx.showView("notes");
}
