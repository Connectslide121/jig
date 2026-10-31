import type { AddonComponentProps, AddonUiContext } from "@jig/sdk";
import {
  Button,
  cn,
  Dialog,
  Empty,
  Icon,
  IconButton,
  Input,
  Select,
  Spinner,
  useActiveProject,
  useAddonEvent,
} from "@jig/sdk/ui";
import { Check, ExternalLink, NotebookPen, Pencil, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  isDone,
  KIND_ORDER,
  KINDS,
  type Note,
  type NoteKind,
  noteText,
  parseLink,
  sorted,
} from "./lib/notes";

function NoteEditor({
  note,
  save,
  close,
}: {
  note?: Note;
  save: (fields: { kind: NoteKind; text: string; url?: string }) => Promise<void>;
  close: () => void;
}) {
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
      await save({ kind, ...(link ?? { text: words }) });
      close();
    } catch (e) {
      setError(String(e));
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
          Important context about the project, useful across chats: decisions, constraints and dependencies.
          Keep task plans and progress in the chat.
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

/** Keyed by project so a slow response or open editor can never follow a project switch. */
function ProjectNotes({ ctx, projectId, name }: { ctx: AddonUiContext; projectId: string; name: string }) {
  const [notes, setNotes] = useState<Note[]>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<Note | "new">();
  useAddonEvent("changed", (payload) => {
    if ((payload as { projectId?: string })?.projectId === projectId) setRevision((n) => n + 1);
  });
  useEffect(() => {
    let live = true;
    void ctx.host.call<Note[]>("list", { projectId }).then(
      (value) => {
        if (live) {
          setNotes(value);
          setError("");
        }
      },
      (e) => {
        if (live) setError(String(e));
      },
    );
    return () => {
      live = false;
    };
  }, [ctx, projectId, revision]);
  const change = async (method: string, fields: object) => {
    await ctx.host.call(method, { projectId, ...fields });
    setRevision((n) => n + 1);
  };
  const run = (method: string, fields: object) =>
    void change(method, fields).catch((e) =>
      ctx.notify({ title: "Couldn't save project notes", message: String(e), tone: "warning" }),
    );
  const list = sorted(notes ?? []);
  const open = list.filter((n) => n.kind === "wait" && !n.done).length;
  return (
    <div className="flex h-full flex-col" data-testid="notes-view">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-2">
        <NotebookPen className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={name}>
          {name}
        </span>
        <span className="w-16 shrink-0 text-right text-2xs text-hint">
          {open ? `${open} open` : `${list.length} notes`}
        </span>
        <IconButton
          icon={Plus}
          label="Add project note"
          onClick={() => setEditor("new")}
          disabled={!notes}
          data-testid="note-add"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {error ? (
          <Empty icon={NotebookPen} title="Couldn't load project notes">
            {error}
          </Empty>
        ) : !notes ? (
          <Spinner center />
        ) : list.length === 0 ? (
          <Empty icon={NotebookPen} title="No notes yet">
            Project context shared across chats. Add a decision, constraint, dependency or reference.
          </Empty>
        ) : (
          list.map((note) => (
            <div
              key={note.id}
              className={cn(
                "group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-hover",
                isDone(note) && "opacity-60",
              )}
              data-testid={`note-${note.id}`}
            >
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                {note.kind === "wait" ? (
                  <button
                    type="button"
                    title={note.done ? "Open dependency again" : "Mark dependency cleared"}
                    className="flex size-4 items-center justify-center rounded border border-line-strong text-warning"
                    onClick={() => run("update", { id: note.id, done: !note.done })}
                    data-testid={`note-toggle-${note.id}`}
                  >
                    {note.done ? (
                      <Check className="size-3" />
                    ) : (
                      <Icon name="hourglass" className="size-2.5" />
                    )}
                  </button>
                ) : (
                  <Icon name={KINDS[note.kind].icon} className="size-4 text-muted" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={cn("text-sm break-words", note.kind === "wait" && !note.done && "text-warning")}
                >
                  {noteText(note)}
                </div>
                <div className="text-2xs text-hint">
                  {KINDS[note.kind].label}
                  {note.by === "claude" ? " · by Claude" : ""}
                </div>
              </div>
              <span className="invisible flex w-20 shrink-0 items-center justify-end group-hover:visible group-focus-within:visible">
                <span className="w-6 shrink-0">
                  {note.kind === "link" && note.url && (
                    <IconButton
                      icon={ExternalLink}
                      size="sm"
                      label="Open"
                      onClick={() => ctx.openExternal(note.url!)}
                    />
                  )}
                </span>
                <IconButton icon={Pencil} size="sm" label="Edit" onClick={() => setEditor(note)} />
                <IconButton
                  icon={X}
                  size="sm"
                  label="Remove"
                  onClick={() => run("remove", { id: note.id })}
                  data-testid={`note-remove-${note.id}`}
                />
              </span>
            </div>
          ))
        )}
      </div>
      {editor && (
        <NoteEditor
          note={editor === "new" ? undefined : editor}
          close={() => setEditor(undefined)}
          save={(fields) =>
            change(editor === "new" ? "add" : "update", {
              ...fields,
              ...(editor === "new" ? {} : { id: editor.id }),
            })
          }
        />
      )}
    </div>
  );
}

export function NotesView({ ctx }: AddonComponentProps) {
  const project = useActiveProject();
  return project ? (
    <ProjectNotes key={project.id} ctx={ctx} projectId={project.id} name={project.name} />
  ) : (
    <Empty icon={NotebookPen} title="No project selected">
      Choose a project to read its shared notes.
    </Empty>
  );
}

export function showNotes(ctx: AddonUiContext) {
  ctx.showView("notes");
}
