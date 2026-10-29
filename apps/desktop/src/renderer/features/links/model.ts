import type { LinkGroup, ProjectLink } from "../../../shared/links";

/**
 * Changes to a project's link groups (pure, tested): add, edit, remove and move links and groups.
 * The view saves the result with `projects.update { links }`.
 */
export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Adds links to the group titled `title` (made if missing, case-insensitive). */
export function addLinks(
  groups: LinkGroup[],
  title: string,
  links: Array<Omit<ProjectLink, "id">>,
): LinkGroup[] {
  const name = title.trim() || "Links";
  const existing = groups.find((g) => g.title.toLowerCase() === name.toLowerCase());
  const added = links.map((l) => ({ ...l, id: newId() }));
  if (existing) return groups.map((g) => (g === existing ? { ...g, links: [...g.links, ...added] } : g));
  return [...groups, { id: newId(), title: name, links: added }];
}

export function updateLink(
  groups: LinkGroup[],
  id: string,
  patch: Partial<Omit<ProjectLink, "id">>,
): LinkGroup[] {
  return groups.map((g) => ({ ...g, links: g.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
}

export function removeLink(groups: LinkGroup[], id: string): LinkGroup[] {
  return groups.map((g) => ({ ...g, links: g.links.filter((l) => l.id !== id) }));
}

/** Moves a link into `groupId`, before the link `beforeId` (or at the end). */
export function moveLink(groups: LinkGroup[], id: string, groupId: string, beforeId?: string): LinkGroup[] {
  const link = groups.flatMap((g) => g.links).find((l) => l.id === id);
  if (!link || id === beforeId) return groups;
  return groups.map((g) => {
    const links = g.links.filter((l) => l.id !== id);
    if (g.id !== groupId) return { ...g, links };
    const at = beforeId ? links.findIndex((l) => l.id === beforeId) : -1;
    links.splice(at < 0 ? links.length : at, 0, link);
    return { ...g, links };
  });
}

export function renameGroup(groups: LinkGroup[], id: string, title: string): LinkGroup[] {
  return groups.map((g) => (g.id === id ? { ...g, title: title.trim() || g.title } : g));
}

export function removeGroup(groups: LinkGroup[], id: string): LinkGroup[] {
  return groups.filter((g) => g.id !== id);
}

/** Moves a group up (−1) or down (+1). */
export function shiftGroup(groups: LinkGroup[], id: string, delta: -1 | 1): LinkGroup[] {
  const i = groups.findIndex((g) => g.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= groups.length) return groups;
  const next = [...groups];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
