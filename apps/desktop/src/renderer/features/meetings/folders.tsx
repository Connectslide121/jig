import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Repeat,
  Trash2,
} from "lucide-react";
import { type DragEvent, useEffect, useMemo, useState } from "react";
import {
  canDrop,
  groupHistory,
  type HistoryGroup,
  type MeetingFolder,
  type MeetingPlace,
  seriesOf,
} from "../../../shared/meetingFolders";
import type { MeetingRecord } from "../../../shared/meetings";
import { call, errorMessage } from "../../lib/host";
import {
  cn,
  confirmDialog,
  contextMenu,
  IconButton,
  type MenuEntry,
  openMenuAt,
  promptDialog,
} from "../../ui";

/**
 * Folders in the meeting history (D-295), shared by the history tab and the lobby: your folders and
 * one per recurring meeting, which ones are open, dragging meetings between them and the menus.
 */

/** Drag type for a meeting moved between folders. */
const MEETING_DRAG = "application/x-jig-meeting";

const OPEN_KEY = "jig.meetings.openFolders";
function readOpenFolders(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
function writeOpenFolders(keys: string[]): void {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(keys.slice(0, 500)));
  } catch {
    // Storage full or off: folders just start closed next time.
  }
}

export interface DropTarget {
  onDragOver(e: DragEvent): void;
  onDragLeave(e: DragEvent): void;
  onDrop(e: DragEvent): void;
}

export function useMeetingFolders({
  records,
  folders,
  searching = false,
  selectedId,
  onError,
}: {
  /** Newest first. */
  records: MeetingRecord[];
  folders: MeetingFolder[];
  /** While searching every folder with a match is open and empty folders are hidden. */
  searching?: boolean;
  /** The selected meeting: its folder opens when the selection changes. */
  selectedId?: string;
  onError(what: string, message: string): void;
}) {
  const grouped = useMemo(
    () => groupHistory(records, folders, { keepEmpty: !searching }),
    [records, folders, searching],
  );

  // Which folders are open: kept on this computer (shared by both views), as you left them.
  const [open, setOpen] = useState<Set<string>>(() => new Set(readOpenFolders()));
  const toggle = (key: string, on?: boolean) =>
    setOpen((now) => {
      if (on !== undefined && now.has(key) === on) return now;
      const next = new Set(now);
      if (on ?? !next.has(key)) next.add(key);
      else next.delete(key);
      writeOpenFolders([...next]);
      return next;
    });
  const isOpen = (key: string) => searching || open.has(key);
  const holder = grouped.groups.find((g) => g.records.some((r) => r.id === selectedId))?.key;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the selection changes, so you can still close its folder.
  useEffect(() => {
    if (holder) toggle(holder, true);
  }, [selectedId]);

  const attempt = async (what: string, work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      onError(what, errorMessage(error));
    }
  };
  const move = (r: MeetingRecord, place: MeetingPlace) =>
    void attempt("Couldn't move the meeting", () => call("meetings.moveToFolder", { ids: [r.id], place }));

  // Dragging a meeting onto a folder (or out of every folder).
  const [dragging, setDragging] = useState<MeetingRecord>();
  const [dropOn, setDropOn] = useState<string>();
  const target = (key: string, accepts: (r: MeetingRecord) => boolean, place: MeetingPlace): DropTarget => ({
    onDragOver: (e) => {
      if (!dragging || !e.dataTransfer.types.includes(MEETING_DRAG) || !accepts(dragging)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setDropOn(key);
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null))
        setDropOn((k) => (k === key ? undefined : k));
    },
    onDrop: (e) => {
      if (!dragging || !accepts(dragging)) return;
      e.preventDefault();
      e.stopPropagation();
      setDropOn(undefined);
      if (place !== "none" && place !== "auto") toggle(key, true);
      move(dragging, place);
    },
  });
  /** A folder takes the meetings `canDrop` allows. */
  const folderTarget = (g: HistoryGroup) =>
    target(g.key, (r) => canDrop(g, r), g.kind === "folder" ? g.folderId! : "auto");
  /** Out of every folder: any meeting not already there. */
  const looseTarget = target(
    "none",
    (r) => r.folder !== null && !grouped.loose.some((x) => x.id === r.id),
    "none",
  );
  const dragProps = (r: MeetingRecord) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(MEETING_DRAG, r.id);
      e.dataTransfer.effectAllowed = "move";
      setDragging(r);
    },
    onDragEnd: () => {
      setDragging(undefined);
      setDropOn(undefined);
    },
  });

  /** Makes a folder; from a meeting's menu, that meeting goes in it. */
  const newFolder = async (withRecord?: MeetingRecord) => {
    const name = await promptDialog({ title: "New folder", confirmLabel: "Create folder" });
    if (!name?.trim()) return;
    await attempt("Couldn't create the folder", async () => {
      const made = await call("meetings.saveFolder", { name });
      toggle(`folder:${made.id}`, true);
      if (withRecord) await call("meetings.moveToFolder", { ids: [withRecord.id], place: made.id });
    });
  };
  const folderMenu = (g: HistoryGroup): MenuEntry[] => {
    const f = folders.find((x) => x.id === g.folderId);
    if (!f) return [];
    return [
      {
        label: "Rename folder…",
        icon: Pencil,
        onSelect: async () => {
          const name = await promptDialog({
            title: "Rename folder",
            initial: f.name,
            confirmLabel: "Rename",
          });
          if (name?.trim() && name.trim() !== f.name)
            await attempt("Couldn't rename the folder", () =>
              call("meetings.saveFolder", { id: f.id, name }),
            );
        },
      },
      {
        label: "Delete folder…",
        icon: Trash2,
        danger: true,
        onSelect: async () => {
          const ok = await confirmDialog({
            title: `Delete the folder "${f.name}"?`,
            message:
              "Only the folder goes. Its meetings stay in the history: in their recurring meeting's folder, or in no folder.",
            confirmLabel: "Delete folder",
            danger: true,
          });
          if (ok)
            await attempt("Couldn't delete the folder", () => call("meetings.deleteFolder", { id: f.id }));
        },
      },
    ];
  };
  /** Where a meeting can go: the same places dragging can put it. */
  const moveMenu = (r: MeetingRecord): MenuEntry[] => {
    const series = seriesOf(r);
    const inSeries = grouped.groups.some((g) => g.kind === "series" && g.series === series);
    return [
      ...[...folders]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => ({
          label: f.name,
          icon: Folder,
          checked: r.folder === f.id,
          onSelect: () => move(r, f.id),
        })),
      ...(folders.length ? [{ separator: true } as const] : []),
      ...(series && (r.folder !== undefined || inSeries)
        ? [
            {
              label: "Its recurring meeting's folder",
              icon: Repeat,
              checked: r.folder === undefined && inSeries,
              onSelect: () => move(r, "auto"),
            },
          ]
        : []),
      {
        label: "No folder",
        checked: r.folder === null || (r.folder === undefined && !inSeries),
        onSelect: () => move(r, "none"),
      },
      { separator: true },
      { label: "New folder…", icon: FolderPlus, onSelect: () => void newFolder(r) },
    ];
  };

  return {
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
  };
}

/**
 * A folder's header: the whole row opens and closes it. The count and your folders' ⋯ sit in
 * fixed slots at the right (`trailing` widths match the rows below, so columns line up).
 */
export function FolderRow({
  group,
  open,
  onToggle,
  menu,
  className,
  countClassName = "w-14",
  trailingClassName = "ml-2 w-11",
}: {
  group: HistoryGroup;
  open: boolean;
  onToggle(): void;
  menu?: MenuEntry[];
  className?: string;
  countClassName?: string;
  trailingClassName?: string;
}) {
  const Icon = group.kind === "series" ? Repeat : Folder;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div
      className={cn("flex h-9 w-full items-center pr-3 hover:bg-raised", className)}
      onContextMenu={menu?.length ? contextMenu(menu) : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        title={
          group.kind === "series" ? `${group.name}: every meeting of this recurring meeting` : group.name
        }
        className="flex h-full min-w-0 flex-1 items-center gap-2 pl-3 text-left"
        data-testid="meeting-folder-row"
      >
        <Chevron className="size-3.5 shrink-0 text-hint" />
        <Icon className={cn("size-4 shrink-0", group.kind === "series" ? "text-accent" : "text-muted")} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{group.name}</span>
        <span className={cn("shrink-0 text-right text-xs text-muted tabular-nums", countClassName)}>
          {group.records.length}
        </span>
      </button>
      <span className={cn("flex shrink-0 justify-end", trailingClassName)}>
        {menu?.length ? (
          <IconButton
            icon={MoreHorizontal}
            size="sm"
            label={`More for ${group.name}`}
            onClick={(e) => openMenuAt(e.currentTarget, menu, true)}
          />
        ) : null}
      </span>
    </div>
  );
}
