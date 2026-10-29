/**
 * Your script groups (pure, tested in groups.test.ts): named sets of scripts from any project, started
 * and stopped together ("Certumhub": its frontend and its backend). Kept in the add-on's storage,
 * the same in every project (D-142).
 */
export interface ScriptGroup {
  id: string;
  name: string;
  /** Members as `memberKey(project folder, script id)`, in the order they were added. */
  members: string[];
}

/** A script anywhere: its project's folder and its id there. */
export const memberKey = (folder: string, scriptId: string) => `${folder}|${scriptId}`;

export function parseMember(key: string): { folder: string; scriptId: string } {
  const at = key.indexOf("|");
  return { folder: key.slice(0, at), scriptId: key.slice(at + 1) };
}

export function newGroup(groups: ScriptGroup[], name: string, first?: string): ScriptGroup[] {
  const id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return [...groups, { id, name: name.trim() || "Group", members: first ? [first] : [] }];
}

export function renameGroup(groups: ScriptGroup[], id: string, name: string): ScriptGroup[] {
  return groups.map((g) => (g.id === id && name.trim() ? { ...g, name: name.trim() } : g));
}

export function removeGroup(groups: ScriptGroup[], id: string): ScriptGroup[] {
  return groups.filter((g) => g.id !== id);
}

/** Moves a group one place up (-1) or down (1). */
export function moveGroup(groups: ScriptGroup[], id: string, by: -1 | 1): ScriptGroup[] {
  const i = groups.findIndex((g) => g.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= groups.length) return groups;
  const next = [...groups];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export function addMember(groups: ScriptGroup[], id: string, member: string): ScriptGroup[] {
  return groups.map((g) =>
    g.id === id && !g.members.includes(member) ? { ...g, members: [...g.members, member] } : g,
  );
}

export function removeMember(groups: ScriptGroup[], id: string, member: string): ScriptGroup[] {
  return groups.map((g) => (g.id === id ? { ...g, members: g.members.filter((m) => m !== member) } : g));
}

/** What Start and Stop act on: the members not running, and the running ones. */
export function groupState(group: ScriptGroup, isRunning: (member: string) => boolean) {
  const running = group.members.filter(isRunning);
  return { running, stopped: group.members.filter((m) => !isRunning(m)) };
}
