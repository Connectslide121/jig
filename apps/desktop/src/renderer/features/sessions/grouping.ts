import type { SessionMeta, SessionStatus } from "../../../shared/engine";

export type ChatListView = "project" | "status" | "recent" | "all";

export const CHAT_LIST_VIEWS: { value: ChatListView; label: string; hint: string }[] = [
  { value: "project", label: "By project", hint: "A group per project" },
  { value: "status", label: "By status", hint: "Pinned, needs you, working, idle" },
  { value: "recent", label: "By day", hint: "Today, yesterday, earlier" },
  { value: "all", label: "One list", hint: "Every chat, newest first" },
];

/** What a group's header shows in front of its name. */
export type GroupMark =
  | { kind: "project"; projectId: string }
  | { kind: "none" }
  | { kind: "pinned" }
  | { kind: "status"; status: SessionStatus }
  | { kind: "day" };

export interface ChatGroup {
  key: string;
  title: string;
  mark: GroupMark;
  chats: SessionMeta[];
  /** A project (or "No project") group takes dropped chats and has a "New chat" button. */
  projectId?: string;
  /** Only the project view lists a group that has no chats yet. */
  keepWhenEmpty?: boolean;
  /** The one-list view has no header. */
  headerless?: boolean;
}

/** Pinned chats in the order you gave them (not listed: after them, newest first). */
export function pinnedInOrder(metas: SessionMeta[], pinnedOrder: string[]): SessionMeta[] {
  const rank = new Map(pinnedOrder.map((id, i) => [id, i]));
  return metas
    .filter((m) => m.pinned)
    .sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
}

/** Pinned first (in your order), then the most recent. */
export function sortChats(list: SessionMeta[], pinnedOrder: string[]): SessionMeta[] {
  const pinned = pinnedInOrder(list, pinnedOrder);
  const rest = list.filter((m) => !m.pinned).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return [...pinned, ...rest];
}

/**
 * The new order of every pinned chat after `id` was dropped on `beforeId`; `undefined` when nothing
 * would change (dropped on itself, or either isn't pinned).
 */
export function movePinned(
  metas: SessionMeta[],
  pinnedOrder: string[],
  id: string,
  beforeId: string,
): string[] | undefined {
  if (id === beforeId) return undefined;
  const ids = pinnedInOrder(metas, pinnedOrder).map((m) => m.id);
  if (!ids.includes(id) || !ids.includes(beforeId)) return undefined;
  const rest = ids.filter((x) => x !== id);
  rest.splice(rest.indexOf(beforeId), 0, id);
  return rest.every((x, i) => x === ids[i]) ? undefined : rest;
}

const STATUS_GROUPS: { key: string; title: string; statuses: SessionStatus[] }[] = [
  { key: "needs_you", title: "Needs you", statuses: ["needs_you"] },
  { key: "working", title: "Working", statuses: ["working", "starting"] },
  { key: "error", title: "Error", statuses: ["error"] },
  { key: "idle", title: "Idle", statuses: ["idle"] },
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function dayGroup(updatedAt: string, now: Date): { key: string; title: string } {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(updatedAt))) / 86_400_000);
  if (days <= 0) return { key: "today", title: "Today" };
  if (days === 1) return { key: "yesterday", title: "Yesterday" };
  if (days < 7) return { key: "week", title: "Last 7 days" };
  return { key: "older", title: "Older" };
}

interface Project {
  id: string;
  name: string;
}

/** Splits the chats into the groups the Chats list shows for a view. */
export function groupChats(
  view: ChatListView,
  chats: SessionMeta[],
  projects: Project[],
  activeProjectId: string | undefined,
  pinnedOrder: string[],
  now = new Date(),
): ChatGroup[] {
  if (view === "project") {
    const known = new Set(projects.map((p) => p.id));
    const ordered = [...projects].sort((a, b) =>
      a.id === activeProjectId ? -1 : b.id === activeProjectId ? 1 : 0,
    );
    return [
      ...ordered.map(
        (p): ChatGroup => ({
          key: p.id,
          title: p.name,
          mark: { kind: "project", projectId: p.id },
          projectId: p.id,
          keepWhenEmpty: true,
          chats: sortChats(
            chats.filter((m) => m.projectId === p.id),
            pinnedOrder,
          ),
        }),
      ),
      {
        key: "none",
        title: "No project",
        mark: { kind: "none" },
        projectId: "",
        keepWhenEmpty: true,
        chats: sortChats(
          chats.filter((m) => !m.projectId || !known.has(m.projectId)),
          pinnedOrder,
        ),
      },
    ];
  }
  if (view === "all")
    return [
      {
        key: "all",
        title: "All chats",
        mark: { kind: "none" },
        headerless: true,
        chats: sortChats(chats, pinnedOrder),
      },
    ];
  const pinned: ChatGroup = {
    key: "pinned",
    title: "Pinned",
    mark: { kind: "pinned" },
    chats: pinnedInOrder(chats, pinnedOrder),
  };
  const rest = chats.filter((m) => !m.pinned).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const groups =
    view === "status"
      ? STATUS_GROUPS.map(
          (g): ChatGroup => ({
            key: g.key,
            title: g.title,
            mark: { kind: "status", status: g.statuses[0] as SessionStatus },
            chats: rest.filter((m) => g.statuses.includes(m.status)),
          }),
        )
      : (["today", "yesterday", "week", "older"] as const).map(
          (key): ChatGroup => ({
            key,
            title: { today: "Today", yesterday: "Yesterday", week: "Last 7 days", older: "Older" }[key],
            mark: { kind: "day" },
            chats: rest.filter((m) => dayGroup(m.updatedAt, now).key === key),
          }),
        );
  return [pinned, ...groups].filter((g) => g.chats.length > 0);
}
