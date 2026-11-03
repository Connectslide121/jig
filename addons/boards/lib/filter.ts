import type { BoardColumn, WorkItem } from "./boards";

/**
 * The board's search and filters (D-304), like Azure DevOps' filter bar: text, then pickers for type,
 * who has it, state, tags, iteration and area. Client-side on the cards already loaded (instant, no az
 * call). Remembered per board. Pure, so it can be tested.
 */
export interface BoardFilter {
  text: string;
  types: string[];
  /** E-mails or names (lower-case), `UNASSIGNED` and `ME`. */
  people: string[];
  states: string[];
  tags: string[];
  iterations: string[];
  areas: string[];
}

export type FilterField = Exclude<keyof BoardFilter, "text">;
export const FILTER_FIELDS: FilterField[] = ["types", "people", "states", "tags", "iterations", "areas"];

export const UNASSIGNED = "@unassigned";
export const ME = "@me";

export const emptyFilter = (): BoardFilter => ({
  text: "",
  types: [],
  people: [],
  states: [],
  tags: [],
  iterations: [],
  areas: [],
});

/** A stored filter read back (missing or odd fields become empty). */
export function readFilter(value: unknown): BoardFilter {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  return {
    text: typeof v.text === "string" ? v.text : "",
    types: list(v.types),
    people: list(v.people),
    states: list(v.states),
    tags: list(v.tags),
    iterations: list(v.iterations),
    areas: list(v.areas),
  };
}

/** How many picker values are on (the search text not counted). */
export const pickedCount = (f: BoardFilter): number => FILTER_FIELDS.reduce((n, k) => n + f[k].length, 0);

export const isFiltering = (f: BoardFilter): boolean => !!f.text.trim() || pickedCount(f) > 0;

/** `list` with `value` added, or removed when it was there. */
export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** How a person is matched: their e-mail when known, else their name (lower-case). */
export const personKey = (item: Pick<WorkItem, "assignedTo" | "assignedEmail">): string | undefined =>
  (item.assignedEmail ?? item.assignedTo)?.toLowerCase();

/** Every word of the search is in the id, title, a tag or who has it (case-insensitive; "#12" finds 12). */
export function matchesText(item: WorkItem, text: string): boolean {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [
    String(item.id),
    item.title,
    ...(item.tags ?? []),
    item.assignedTo ?? "",
    item.assignedEmail ?? "",
  ]
    .join("\n")
    .toLowerCase();
  return words.every((w) => hay.includes(w.replace(/^#(?=\d)/, "")));
}

/**
 * Whether a card passes the filter: within a picker any value matches (OR), across pickers all must
 * (AND), as in Azure DevOps. `me` is your e-mail (the signed-in az user) for @Me.
 */
export function matches(item: WorkItem, f: BoardFilter, me?: string): boolean {
  if (f.types.length && !f.types.includes(item.type)) return false;
  if (f.states.length && !f.states.includes(item.state)) return false;
  if (f.people.length) {
    const who = personKey(item);
    const mine = !!me && !!item.assignedEmail && item.assignedEmail.toLowerCase() === me.toLowerCase();
    const ok =
      (who ? f.people.includes(who) : f.people.includes(UNASSIGNED)) || (mine && f.people.includes(ME));
    if (!ok) return false;
  }
  if (f.tags.length && !(item.tags ?? []).some((t) => f.tags.includes(t))) return false;
  if (f.iterations.length && !(item.iteration && f.iterations.includes(item.iteration))) return false;
  if (f.areas.length && !(item.area && f.areas.includes(item.area))) return false;
  return matchesText(item, f.text);
}

export interface Facet {
  value: string;
  label: string;
  /** Cards on the board with it. */
  count: number;
  /** For people: their e-mail, for the avatar. */
  email?: string;
}

export interface Facets {
  types: Facet[];
  people: Facet[];
  states: Facet[];
  tags: Facet[];
  iterations: Facet[];
  areas: Facet[];
  /** Cards nobody has. */
  unassigned: number;
}

function count(map: Map<string, Facet>, value: string, label = value, email?: string) {
  const hit = map.get(value);
  if (hit) hit.count++;
  else map.set(value, { value, label, count: 1, ...(email ? { email } : {}) });
}

const sorted = (map: Map<string, Facet>) => [...map.values()].sort((a, b) => a.label.localeCompare(b.label));

/**
 * What the pickers offer: the values on the board's cards, sorted, with how many cards have each.
 * States follow the board's columns (their order, then any others); iteration and area paths show
 * their last part. Values `picked` in a filter that no card has any more stay listed (count 0), so
 * they can be unticked.
 */
export function facets(items: WorkItem[], columns: BoardColumn[] = [], picked?: BoardFilter): Facets {
  const types = new Map<string, Facet>();
  const people = new Map<string, Facet>();
  const states = new Map<string, Facet>();
  const tags = new Map<string, Facet>();
  const iterations = new Map<string, Facet>();
  const areas = new Map<string, Facet>();
  let unassigned = 0;
  for (const i of items) {
    count(types, i.type);
    count(states, i.state);
    const who = personKey(i);
    if (who) count(people, who, i.assignedTo ?? i.assignedEmail ?? who, i.assignedEmail);
    else unassigned++;
    for (const t of i.tags ?? []) count(tags, t);
    if (i.iteration) count(iterations, i.iteration, lastPart(i.iteration));
    if (i.area) count(areas, i.area, lastPart(i.area));
  }
  if (picked) {
    const keep = (map: Map<string, Facet>, values: string[], label = (v: string) => v) => {
      for (const v of values) if (!map.has(v)) map.set(v, { value: v, label: label(v), count: 0 });
    };
    keep(types, picked.types);
    keep(states, picked.states);
    keep(
      people,
      picked.people.filter((p) => p !== UNASSIGNED && p !== ME),
    );
    keep(tags, picked.tags);
    keep(iterations, picked.iterations, lastPart);
    keep(areas, picked.areas, lastPart);
  }
  const order = [...new Set(columns.flatMap((c) => Object.values(c.stateMappings)))];
  const rank = (s: string) => (order.includes(s) ? order.indexOf(s) : order.length);
  return {
    types: sorted(types),
    people: sorted(people),
    states: [...states.values()].sort(
      (a, b) => rank(a.value) - rank(b.value) || a.label.localeCompare(b.label),
    ),
    tags: sorted(tags),
    iterations: sorted(iterations),
    areas: sorted(areas),
    unassigned,
  };
}

/** `Shop\Sprint 4` → `Sprint 4`. */
export const lastPart = (path: string): string => path.split("\\").filter(Boolean).at(-1) ?? path;
