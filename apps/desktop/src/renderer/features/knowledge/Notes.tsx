import {
  Check,
  ExternalLink,
  Hourglass,
  Link,
  type LucideIcon,
  NotebookPen,
  Plus,
  StickyNote,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import {
  isDone,
  KIND_ORDER,
  KINDS,
  type Note,
  type NoteKind,
  noteText,
  parseLink,
  sorted,
} from "../../../shared/notes";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { Button, cn, Dialog, Empty, IconButton, Input, Select, Spinner } from "../../ui";
import { useActiveProject } from "../../workbench/projects";
import { notify } from "../../workbench/toasts";

export const NOTES_VIEW = "jig.notes";

const KIND_ICON: Record<NoteKind, LucideIcon> = { wait: Hourglass, note: StickyNote, link: Link };

/** A project's notes (D-289), following changes from chats and other views. */
export function useNotes(projectId: string): { notes?: Note[]; error: string } {
  const [notes, setNotes] = useState<Note[]>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useHostEvent("knowledge.changed", (e) => {
    if (e.projectId === projectId) setRevision((n) => n + 1);
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` reloads after a change.
  useEffect(() => {
    let live = true;
    void call("notes.list", { projectId }).then(
      (value) => {
        if (!live) return;
        setNotes(value);
        setError("");
      },
      (e) => {
        if (live) setError(errorMessage(e));
      },
    );
    return () => {
      live = false;
    };
  }, [projectId, revision]);
  return { notes, error };
}

const change = (
  method: "notes.update" | "notes.remove",
  args: { projectId: string; id: string; done?: boolean },
) =>
  void call(method, args).catch((e) =>
    notify({ title: "Couldn't save the project notes", message: errorMessage(e), tone: "warning" }),
  );

const useEditor = create<{ open?: { projectId: string; note?: Note } }>(() => ({}));

/** Adds a note to a project (no note) or edits one, in a modal. */
export function openNoteEditor(projectId: string, note?: Note): void {
  useEditor.setState({ open: { projectId, note } });
}

/** The note editor, mounted once in the workbench; closes when the active project changes. */
export function NoteEditorHost() {
  const open = useEditor((s) => s.open);
  const active = useActiveProject()?.id;
  useEffect(() => {
    if (open && open.projectId !== active) useEditor.setState({ open: undefined });
  }, [open, active]);
  if (!open) return null;
  return (
    <NoteEditor
      key={`${open.projectId}:${open.note?.id ?? "new"}`}
      projectId={open.projectId}
      note={open.note}
      close={() => useEditor.setState({ open: undefined })}
    />
  );
}

function NoteEditor({ projectId, note, close }: { projectId: string; note?: Note; close: () => void }) {
  const [kind, setKind] = useState<NoteKind>(note?.kind ?? "note");
  const [text, setText] = useState(note ? [note.text, note.url].filter(Boolean).join(" ") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    const words = text.trim();
    const link = kind === "link" ? parseLink(words) : null;
    if (!words || (kind === "link" && !link))
      return setError("Enter text, or a link with an https:// address.");
    setBusy(true);
    try {
      const fields = link ?? { text: words, url: undefined };
      if (note)
        await call("notes.update", { projectId, id: note.id, text: fields.text, url: fields.url ?? "" });
      else
        await call("notes.add", {
          projectId,
          kind,
          text: fields.text,
          ...(fields.url ? { url: fields.url } : {}),
        });
      close();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      title={note ? "Edit project note" : "Add project note"}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button disabled={busy} onClick={() => void submit()} data-testid="note-save">
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-muted">
          Important context about the project that every chat in it gets: decisions, constraints and
          dependencies. Keep task plans and progress in the chat.
        </p>
        <Select
          aria-label="Kind of note"
          value={kind}
          disabled={!!note}
          onChange={(e) => setKind(e.target.value as NoteKind)}
          data-testid="note-kind"
        >
          {KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {KINDS[k].label}
            </option>
          ))}
        </Select>
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void submit();
          }}
          placeholder={KINDS[kind].placeholder}
          data-testid="note-input"
        />
        <div className="h-8 text-xs text-warning" role="status">
          {error}
        </div>
      </div>
    </Dialog>
  );
}

/** One note: the row edits it; a wait's mark clears it; open (links) and remove on hover. */
function NoteRow({ projectId, note }: { projectId: string; note: Note }) {
  const Kind = KIND_ICON[note.kind];
  const edit = () => openNoteEditor(projectId, note);
  return (
    <div
      role="button"
      tabIndex={0}
      title="Edit this note"
      onClick={edit}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        edit();
      }}
      className={cn(
        "group flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent",
        isDone(note) && "opacity-60",
      )}
      data-testid={`note-${note.id}`}
    >
      <span className="flex h-5 w-4 shrink-0 items-center justify-center">
        {note.kind === "wait" ? (
          <button
            type="button"
            title={note.done ? "Open dependency again" : "Mark dependency cleared"}
            className="flex size-4 items-center justify-center rounded border border-line-strong text-warning"
            onClick={(e) => {
              e.stopPropagation();
              change("notes.update", { projectId, id: note.id, done: !note.done });
            }}
            data-testid={`note-toggle-${note.id}`}
          >
            {note.done ? <Check className="size-3" /> : <Hourglass className="size-2.5" />}
          </button>
        ) : (
          <Kind className="size-4 text-muted" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm break-words", note.kind === "wait" && !note.done && "text-warning")}>
          {noteText(note)}
        </div>
        <div className="text-2xs text-hint">
          {KINDS[note.kind].label}
          {note.by === "claude" ? " · by Jig" : ""}
        </div>
      </div>
      <span className="invisible flex h-5 w-14 shrink-0 items-center justify-end group-hover:visible group-focus-within:visible">
        <span className="w-6 shrink-0">
          {note.kind === "link" && note.url && (
            <IconButton
              icon={ExternalLink}
              size="sm"
              label="Open"
              onClick={(e) => {
                e.stopPropagation();
                void call("app.openExternal", { url: note.url! });
              }}
            />
          )}
        </span>
        <IconButton
          icon={X}
          size="sm"
          label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            change("notes.remove", { projectId, id: note.id });
          }}
          data-testid={`note-remove-${note.id}`}
        />
      </span>
    </div>
  );
}

/** The notes in their order: open dependencies, notes, links, then cleared dependencies. */
export function NoteList({ projectId, notes }: { projectId: string; notes: Note[] }) {
  return sorted(notes).map((note) => <NoteRow key={note.id} projectId={projectId} note={note} />);
}

/** "2 open" while dependencies wait, otherwise how many notes there are. */
export function notesCount(notes: Note[] | undefined): string {
  if (!notes) return "";
  const open = notes.filter((n) => n.kind === "wait" && !n.done).length;
  return open ? `${open} open` : `${notes.length} ${notes.length === 1 ? "note" : "notes"}`;
}

/** Keyed by project so a slow answer can never follow a project switch. */
function ProjectNotes({ projectId, name }: { projectId: string; name: string }) {
  const { notes, error } = useNotes(projectId);
  const add = useCallback(() => openNoteEditor(projectId), [projectId]);
  return (
    <div className="flex h-full flex-col" data-testid="notes-view">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-2">
        <NotebookPen className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={name}>
          {name}
        </span>
        <span className="w-16 shrink-0 text-right text-2xs text-hint">{notesCount(notes)}</span>
        <IconButton
          icon={Plus}
          label="Add project note"
          onClick={add}
          disabled={!notes}
          data-testid="note-add"
        />
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto p-1">
        {error ? (
          <Empty icon={NotebookPen} title="Couldn't load the project notes">
            {error}
          </Empty>
        ) : !notes ? (
          <Spinner center />
        ) : notes.length === 0 ? (
          <Empty icon={NotebookPen} title="No notes yet">
            Project context every chat in it gets. Add a decision, constraint, dependency or reference.
          </Empty>
        ) : (
          <NoteList projectId={projectId} notes={notes} />
        )}
      </div>
    </div>
  );
}

/** The active project's notes in a sidebar (D-102: it follows the project). */
export function NotesView() {
  const project = useActiveProject();
  return project ? (
    <ProjectNotes key={project.id} projectId={project.id} name={project.name} />
  ) : (
    <Empty icon={NotebookPen} title="No project selected">
      Choose a project to read its notes.
    </Empty>
  );
}
