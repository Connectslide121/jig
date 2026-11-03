import {
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
  Video,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { meetingMention } from "../../../../../../addons/meetings/lib/meeting";
import type { MeetingFolder } from "../../../shared/meetingFolders";
import type { MeetingRecord } from "../../../shared/meetings";
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
import { Pane } from "../../workbench/Pane";
import { useProjects } from "../../workbench/projects";
import { registerTabType, type TabProps } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { ProjectSwatch } from "../projects/colors";
import { newSession } from "../sessions/actions";
import { Review } from "./dialogs";
import { FolderRow, useMeetingFolders } from "./folders";
import { dayAndTime, duration } from "./format";
import { NotesPanel, TranscriptPanel } from "./Panels";

/**
 * The meeting history (D-250): every meeting Jig kept, in a tab of the main window, so you don't need
 * the meetings window to read one, start a chat from it, write notes or queue its actions. Opened from
 * the Meetings add-on (its top-bar button and Tools action), so it exists only while that add-on is on.
 */
export function registerMeetingHistory(): void {
  registerTabType({
    type: "jig.meetings",
    title: () => "Meetings",
    icon: HistoryIcon,
    component: MeetingHistory,
    singleton: true,
    owner: "core",
  });
}

const openChat = (sessionId: string) => workbench.openTab("jig.chat", { sessionId });

function MeetingHistory({ params }: TabProps) {
  const [records, setRecords] = useState<MeetingRecord[] | undefined>();
  const [failed, setFailed] = useState<string>();
  const [selected, setSelected] = useState<string>();
  // A mention's chip in a chat opens this tab on its meeting (`select`: the id's first 8 hex digits).
  const select = typeof params.select === "string" ? params.select : undefined;
  useEffect(() => {
    const found = select && records?.find((r) => r.id.replace(/-/g, "").toLowerCase().startsWith(select));
    if (found) setSelected(found.id);
  }, [select, records]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"notes" | "queue">();
  const [review, setReview] = useState(false);
  const projects = useProjects();

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
        onSelect: () => void newSession(p.id, undefined, `${meetingMention(r)} `),
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
    { separator: true },
    { label: "Rename…", icon: Pencil, testId: "meeting-rename", onSelect: () => void rename(r) },
    { label: "Delete…", icon: Trash2, danger: true, onSelect: () => void remove(r) },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="meeting-history">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
        <HistoryIcon className="size-4 text-muted" />
        <div className="min-w-0 flex-1 truncate text-sm font-medium">Meeting history</div>
        <Button size="sm" icon={Video} onClick={() => void call("meetings.open")}>
          Meetings window
        </Button>
      </div>
      {failed ? (
        <Empty icon={HistoryIcon} title="Meetings are off" className="h-full">
          {failed}
        </Empty>
      ) : !records ? (
        <Spinner center />
      ) : !records.length ? (
        <Empty icon={HistoryIcon} title="No meetings yet" className="h-full">
          Meetings you join from the meetings window are kept here with their captions, notes and actions.
        </Empty>
      ) : (
        <div className="flex min-h-0 flex-1">
          <Pane id="jig.meetings.list" edge="right" defaultSize={300} min={220} max={520}>
            <div className="flex h-full min-h-0 flex-col border-r border-line">
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
          </Pane>
          {record && (
            <div className="flex min-w-0 flex-1 flex-col" data-testid="meeting-detail">
              <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="truncate text-sm font-medium" title={record.title}>
                    {record.title}
                  </div>
                  <div className="truncate text-xs text-muted tabular-nums">{when(record)}</div>
                </div>
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
              <div className="@container min-h-0 flex-1">
                <div className="grid h-full grid-rows-2 @3xl:grid-cols-2 @3xl:grid-rows-1">
                  <div className="min-h-0 border-b border-line @3xl:border-r @3xl:border-b-0">
                    <NotesPanel
                      record={record}
                      busy={busy === "notes"}
                      onGenerateNotes={() =>
                        void run(
                          "Couldn't start the notes",
                          async () => {
                            openChat((await call("meetings.notes", { id: record.id })).sessionId);
                          },
                          "notes",
                        )
                      }
                      onReview={() => setReview(true)}
                    />
                  </div>
                  <div className="min-h-0">
                    <TranscriptPanel record={record} live={false} />
                  </div>
                </div>
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
