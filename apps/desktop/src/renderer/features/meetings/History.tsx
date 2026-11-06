import {
  Captions,
  Copy,
  Download,
  FileText,
  Folder,
  FolderPlus,
  History as HistoryIcon,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { meetingMention } from "../../../../../../addons/meetings/lib/meeting";
import type { MeetingFolder } from "../../../shared/meetingFolders";
import type { MeetingLayout, MeetingSizeKey } from "../../../shared/meetingLayout";
import type { MeetingRecord } from "../../../shared/meetings";
import type { ProjectsState } from "../../../shared/projects";
import { copyText } from "../../lib/clipboard";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import {
  Button,
  Collapse,
  CountBadge,
  cn,
  confirmDialog,
  contextMenu,
  Empty,
  IconButton,
  type MenuEntry,
  openMenuAt,
  promptDialog,
  SearchInput,
  Spinner,
} from "../../ui";
import { notify } from "../../workbench/toasts";
import { ProjectSwatch } from "../projects/colors";
import { Review } from "./dialogs";
import { FolderRow, useMeetingFolders } from "./folders";
import { dayAndTime, duration } from "./format";
import { NotesPanel, TranscriptPanel } from "./Panels";
import { SizedBox } from "./Slots";

/**
 * The meeting history (D-250), the Meetings window's Meetings tab (D-376): every meeting Jig kept, so
 * you can read one, start a chat from it, write notes or queue its actions. The list keeps a remembered
 * width; the selected meeting's notes take the rest. Its transcript is hidden until you show it with the
 * header's Transcript button (remembered); then it sits beside the notes with a remembered width, or
 * takes their place when there isn't room for both.
 */
export function MeetingHistory({
  projects,
  layout,
  onResize,
  onTranscript,
  target,
  onOpenChat,
  extraMenu,
}: {
  projects: ProjectsState;
  layout: MeetingLayout;
  onResize(key: MeetingSizeKey, size: number): void;
  /** Shows or hides the transcript beside the notes. */
  onTranscript(shown: boolean): void;
  /** The meeting to show: its id, or an id's first hex digits (a mention's chip). `at` changes with every request. */
  target?: { select: string; at: number };
  /** Shows a chat (notes being written) in Jig's main window. */
  onOpenChat(sessionId: string): Promise<void>;
  /** More entries for a meeting's ⋯ menu (Call back, Open in Teams). */
  extraMenu?(record: MeetingRecord): MenuEntry[];
}) {
  const [records, setRecords] = useState<MeetingRecord[] | undefined>();
  const [failed, setFailed] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const select = target?.select.replace(/-/g, "").toLowerCase();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `target.at` asks again for the same meeting.
  useEffect(() => {
    const found = select && records?.find((r) => r.id.replace(/-/g, "").toLowerCase().startsWith(select));
    if (found) setSelected(found.id);
  }, [select, target?.at, records]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"notes" | "queue">();
  const [review, setReview] = useState(false);
  const transcript = layout.historyTranscript === true;
  const [detail, detailWidth] = useWidth();
  // Side by side only when both keep their minimum; else the transcript takes the notes' place.
  const beside = detailWidth >= NOTES_MIN + TRANSCRIPT_MIN;

  const load = useCallback(async () => {
    try {
      setRecords(await call("meetings.history"));
      setFailed(undefined);
    } catch (error) {
      setFailed(errorMessage(error));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useHostEvent("meetings.changed", () => void load());

  const [folders, setFolders] = useState<MeetingFolder[]>([]);
  const loadFolders = useCallback(async () => {
    setFolders(await call("meetings.folders").catch(() => []));
  }, []);
  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);
  useHostEvent("meetings.changed", () => void loadFolders());

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!records || !q) return records ?? [];
    return records.filter((r) => r.title.toLowerCase().includes(q) || r.notes.toLowerCase().includes(q));
  }, [records, query]);
  const searching = query.trim() !== "";
  const record = records?.find((r) => r.id === selected) ?? shown[0];
  const folderState = useMeetingFolders({
    records: shown,
    folders,
    searching,
    selectedId: record?.id,
    onError: (title, message) => notify({ tone: "danger", title, message }),
  });
  const {
    grouped,
    isOpen,
    toggle,
    dropOn,
    folderTarget,
    looseTarget,
    dragProps,
    newFolder,
    folderMenu,
    moveMenu,
  } = folderState;

  const run = async (what: string, work: () => Promise<void>, kind?: "notes" | "queue") => {
    setBusy(kind);
    try {
      await work();
    } catch (error) {
      notify({ tone: "danger", title: what, message: errorMessage(error) });
    } finally {
      setBusy(undefined);
    }
  };

  const startChat = (r: MeetingRecord, at: HTMLElement) =>
    openMenuAt(at, [
      { heading: "Start a chat in" },
      ...projects.projects.map((p) => ({
        label: p.name,
        leading: <ProjectSwatch color={p.color} />,
        testId: `meeting-chat-${p.id}`,
        onSelect: () =>
          void run("Couldn't start the chat", () =>
            call("meetings.startChat", { projectId: p.id, draft: `${meetingMention(r)} ` }),
          ),
      })),
    ]);
  const rename = async (r: MeetingRecord) => {
    const title = await promptDialog({ title: "Rename meeting", initial: r.title, confirmLabel: "Rename" });
    if (title?.trim() && title.trim() !== r.title)
      await run("Couldn't rename the meeting", () => call("meetings.rename", { id: r.id, title }));
  };
  const remove = async (r: MeetingRecord) => {
    const ok = await confirmDialog({
      title: `Delete "${r.title}"?`,
      message:
        "Deletes its transcript, notes and actions from this computer. Chats where you already asked Claude about it keep what Claude read there.",
      confirmLabel: "Delete meeting",
      danger: true,
    });
    if (ok) await run("Couldn't delete the meeting", () => call("meetings.delete", { id: r.id }));
  };
  const more = (r: MeetingRecord): MenuEntry[] => [
    {
      label: "Copy as Markdown",
      icon: Copy,
      testId: "meeting-copy",
      onSelect: () =>
        void run("Couldn't copy the meeting", async () => {
          if (await copyText(await call("meetings.markdown", { id: r.id })))
            notify({ tone: "success", title: "Meeting copied as Markdown" });
        }),
    },
    {
      label: "Export Markdown…",
      icon: Download,
      onSelect: () =>
        void run("Couldn't export the meeting", async () => {
          const file = await call("meetings.export", { id: r.id });
          if (file) notify({ tone: "success", title: "Meeting saved", message: file });
        }),
    },
    {
      label: "Copy chat reference",
      icon: MessageSquare,
      onSelect: () => void copyText(meetingMention(r)),
    },
    { label: "Move to folder", icon: Folder, testId: "meeting-move", submenu: moveMenu(r) },
    ...(extraMenu?.(r) ?? []),
    { separator: true },
    { label: "Rename…", icon: Pencil, testId: "meeting-rename", onSelect: () => void rename(r) },
    { label: "Delete…", icon: Trash2, danger: true, onSelect: () => void remove(r) },
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="meeting-history">
      {failed ? (
        <Empty icon={HistoryIcon} title="Meetings are off" className="h-full">
          {failed}
        </Empty>
      ) : !records ? (
        <Spinner center />
      ) : !records.length ? (
        <Empty icon={HistoryIcon} title="No meetings yet" className="h-full">
          Meetings you join are kept here with their captions, notes and actions.
        </Empty>
      ) : (
        <div className="flex min-h-0 flex-1">
          <SizedBox
            layout={layout}
            sizeKey="history.list"
            edge="right"
            min={220}
            onResize={onResize}
            label="Resize meeting list"
            className="max-w-2/5 border-r border-line bg-surface"
          >
            <div className="flex size-full min-h-0 min-w-0 flex-col">
              <div className="flex h-11 shrink-0 items-center gap-1 pl-3 pr-2">
                <div className="min-w-0 flex-1">
                  <SearchInput
                    placeholder="Search meetings"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onClear={() => setQuery("")}
                  />
                </div>
                <IconButton
                  icon={FolderPlus}
                  size="sm"
                  label="New folder"
                  data-testid="meeting-new-folder"
                  onClick={() => void newFolder()}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto" data-testid="meeting-list">
                {!shown.length ? (
                  <div className="px-4 py-3 text-xs text-muted">No meeting matches.</div>
                ) : (
                  <>
                    {grouped.groups.map((g) => {
                      const opened = isOpen(g.key);
                      return (
                        <div
                          key={g.key}
                          {...folderTarget(g)}
                          className={cn(dropOn === g.key && "bg-accent-soft")}
                          data-testid="meeting-folder"
                        >
                          <FolderRow
                            group={g}
                            open={opened}
                            onToggle={() => toggle(g.key)}
                            menu={g.kind === "folder" ? folderMenu(g) : undefined}
                          />
                          <Collapse open={opened}>
                            {g.records.length ? (
                              g.records.map((r) => (
                                <MeetingRow
                                  key={r.id}
                                  record={r}
                                  nested
                                  active={r.id === record?.id}
                                  onSelect={() => setSelected(r.id)}
                                  menu={() => more(r)}
                                  drag={dragProps(r)}
                                />
                              ))
                            ) : (
                              <div className="flex h-9 items-center pl-10 pr-3 text-xs text-hint">
                                Drag meetings here
                              </div>
                            )}
                          </Collapse>
                        </div>
                      );
                    })}
                    {grouped.groups.length > 0 && (
                      <div
                        {...looseTarget}
                        className={cn(
                          "flex h-8 items-center px-3 text-2xs font-medium uppercase tracking-wide text-hint",
                          dropOn === "none" && "bg-accent-soft",
                        )}
                        data-testid="meeting-no-folder"
                      >
                        Not in a folder
                      </div>
                    )}
                    <div {...looseTarget} className={cn("min-h-12", dropOn === "none" && "bg-accent-soft")}>
                      {grouped.loose.map((r) => (
                        <MeetingRow
                          key={r.id}
                          record={r}
                          active={r.id === record?.id}
                          onSelect={() => setSelected(r.id)}
                          menu={() => more(r)}
                          drag={dragProps(r)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </SizedBox>
          {record && (
            <div className="flex min-w-0 flex-1 flex-col" data-testid="meeting-detail">
              <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="truncate text-sm font-medium" title={record.title}>
                    {record.title}
                  </div>
                  <div className="truncate text-xs text-muted tabular-nums">{when(record)}</div>
                </div>
                <button
                  type="button"
                  aria-pressed={transcript}
                  aria-controls={transcript ? "meeting-history-transcript" : undefined}
                  title={transcript ? "Hide the transcript" : "Show the transcript"}
                  onClick={() => onTranscript(!transcript)}
                  data-testid="meeting-transcript-toggle"
                  className={cn(
                    "no-drag inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium whitespace-nowrap transition-colors",
                    transcript ? "bg-active text-fg" : "text-muted hover:bg-hover hover:text-fg",
                  )}
                >
                  <Captions className="size-4 shrink-0" />
                  Transcript
                  <span className="text-xs font-normal text-hint tabular-nums">{record.captions.length}</span>
                </button>
                <Button
                  size="sm"
                  icon={MessageSquare}
                  onClick={(e) => startChat(record, e.currentTarget)}
                  data-testid="meeting-start-chat"
                >
                  Start a chat
                </Button>
                <IconButton
                  icon={MoreHorizontal}
                  size="sm"
                  label="More for this meeting"
                  data-testid="meeting-more"
                  onClick={(e) => openMenuAt(e.currentTarget, more(record), true)}
                />
              </div>
              <div ref={detail} className="flex min-h-0 flex-1">
                <div
                  className={cn("min-h-0 min-w-0 flex-1", transcript && !beside && "hidden")}
                  // Beside the transcript the notes keep their minimum (in px, like the handle's limit,
                  // whatever the density) and the transcript gives way.
                  style={transcript && beside ? { minWidth: NOTES_MIN } : undefined}
                >
                  <NotesPanel
                    record={record}
                    busy={busy === "notes"}
                    onGenerateNotes={() =>
                      void run(
                        "Couldn't start the notes",
                        async () => {
                          await onOpenChat((await call("meetings.notes", { id: record.id })).sessionId);
                        },
                        "notes",
                      )
                    }
                    onReview={() => setReview(true)}
                  />
                </div>
                {transcript &&
                  (beside ? (
                    <SizedBox
                      layout={layout}
                      sizeKey="history.transcript"
                      edge="left"
                      min={TRANSCRIPT_MIN}
                      max={() => detailWidth - NOTES_MIN}
                      onResize={onResize}
                      label="Resize the transcript"
                      className="border-l border-line"
                    >
                      <div id="meeting-history-transcript" className="flex size-full min-h-0 min-w-0">
                        <TranscriptPanel record={record} live={false} />
                      </div>
                    </SizedBox>
                  ) : (
                    <div id="meeting-history-transcript" className="flex min-h-0 min-w-0 flex-1">
                      <TranscriptPanel record={record} live={false} />
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
      {review && record && (
        <Review
          record={record}
          projects={projects}
          busy={busy === "queue"}
          onClose={() => setReview(false)}
          onQueue={(actions, actionIds) =>
            run(
              "Couldn't add the actions",
              async () => {
                await call("meetings.actions", { id: record.id, actions });
                await call("meetings.queue", { id: record.id, actionIds });
                setReview(false);
                notify({ tone: "success", title: `Added ${actionIds.length} to the task queue` });
              },
              "queue",
            )
          }
        />
      )}
    </div>
  );
}

/** The narrowest the notes and the transcript get side by side, in px. */
const NOTES_MIN = 320;
const TRANSCRIPT_MIN = 280;

/** A callback ref and the element's width, kept up to date (0 until it is measured, before paint). */
function useWidth(): [(element: HTMLDivElement | null) => void, number] {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width];
}

const when = (r: MeetingRecord) =>
  r.endedAt ? `${dayAndTime(r.startedAt)} · ${duration(r.startedAt, r.endedAt)}` : dayAndTime(r.startedAt);

/** A meeting in the list: the whole row selects it; notes and open actions sit in fixed columns. */
function MeetingRow({
  record,
  active,
  nested,
  onSelect,
  menu,
  drag,
}: {
  record: MeetingRecord;
  active: boolean;
  /** Inside a folder: indented past the folder's chevron. */
  nested?: boolean;
  onSelect(): void;
  /** Right-click: the meeting's menu (move to a folder, rename, …). */
  menu?: () => MenuEntry[];
  drag?: React.HTMLAttributes<HTMLButtonElement> & { draggable: boolean };
}) {
  const open = record.actions.filter((a) => !a.queued).length;
  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={menu ? contextMenu(menu) : undefined}
      {...drag}
      data-testid="meeting-row"
      aria-current={active || undefined}
      className={cn(
        "flex h-12 w-full items-center gap-2 pr-3 text-left hover:bg-raised",
        nested ? "pl-10" : "pl-3",
        active && "bg-raised",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{record.title}</span>
        <span className="truncate text-xs text-muted tabular-nums">{dayAndTime(record.startedAt)}</span>
      </div>
      <span className="w-14 shrink-0 text-right text-xs text-muted tabular-nums">
        {record.endedAt ? duration(record.startedAt, record.endedAt) : ""}
      </span>
      <span className="flex w-4 shrink-0 justify-center" title={record.notes ? "Has notes" : undefined}>
        {record.notes && <FileText className="size-3.5 text-hint" />}
      </span>
      <span className="flex w-5 shrink-0 justify-end">
        <CountBadge count={open} />
      </span>
    </button>
  );
}
