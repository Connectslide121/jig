/**
 * People's Teams status (presence, D-329), read by main from Microsoft Graph's
 * `POST /communications/getPresencesByUserId` (Presence.Read.All, delegated). Pure, so the host, the
 * windows and the tests share it: which ids can be asked about, and Graph's values as a status.
 */

/** Someone's presence as Graph gives it: `availability` (Available, Busy…) and `activity` (InAMeeting…). */
export interface TeamsPresence {
  availability: string;
  activity: string;
}

/** What the windows get: presence by Entra object id (lower case), or why there is none. */
export interface TeamsPresenceResult {
  /** "consent": Jig hasn't been allowed to read presence; "unavailable": not signed in or Graph failed. */
  state: "ok" | "consent" | "unavailable";
  presence: Record<string, TeamsPresence>;
}

/** The dot's kinds, as Teams draws them. */
export type PresenceKind = "available" | "busy" | "dnd" | "away" | "offline";

/** Graph's getPresencesByUserId takes at most this many ids per request. */
export const PRESENCE_BATCH = 650;

const OBJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An Entra object id from a chat member's id or a Teams participant id (`8:orgid:<id>`), lower case. */
export function presenceId(id: string | undefined): string | undefined {
  const bare = id?.replace(/^8:orgid:/i, "");
  return bare && OBJECT_ID.test(bare) ? bare.toLowerCase() : undefined;
}

/** Ids worth asking about: valid, once each, in order. */
export function presenceIds(ids: Iterable<string | undefined>): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const bare = presenceId(id);
    if (bare) out.add(bare);
  }
  return [...out];
}

/** Ids in requests Graph takes. */
export function presenceBatches(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += PRESENCE_BATCH) out.push(ids.slice(i, i + PRESENCE_BATCH));
  return out;
}

const ACTIVITY: Record<string, string> = {
  InACall: "In a call",
  InAConferenceCall: "In a call",
  InAMeeting: "In a meeting",
  Presenting: "Presenting",
  Inactive: "Inactive",
  OutOfOffice: "Out of office",
  OffWork: "Off work",
  UrgentInterruptionsOnly: "Urgent interruptions only",
  Focusing: "Focusing",
};

/**
 * A presence as Teams shows it: the dot's kind and its words ("Busy, in a meeting"), or undefined
 * when Graph doesn't know (no dot).
 */
export function presenceStatus(
  p: TeamsPresence | undefined,
): { kind: PresenceKind; label: string } | undefined {
  if (!p) return undefined;
  const base: Record<string, [PresenceKind, string]> = {
    Available: ["available", "Available"],
    AvailableIdle: ["away", "Away"],
    Away: ["away", "Away"],
    BeRightBack: ["away", "Be right back"],
    Busy: ["busy", "Busy"],
    BusyIdle: ["busy", "Busy"],
    DoNotDisturb: ["dnd", "Do not disturb"],
    Offline: ["offline", "Offline"],
  };
  const found = base[p.availability];
  if (!found) return undefined;
  const [kind, label] = found;
  if (p.activity === "OutOfOffice")
    return { kind: kind === "offline" ? "offline" : "away", label: "Out of office" };
  const detail = ACTIVITY[p.activity];
  // In a call / Presenting read as the status itself, like Teams; others follow it ("Busy, in a meeting").
  if (
    detail &&
    (p.activity === "InACall" || p.activity === "InAConferenceCall" || p.activity === "Presenting")
  )
    return { kind, label: detail };
  return { kind, label: detail ? `${label}, ${detail.toLowerCase()}` : label };
}

/** Graph's answer as presence by id (lower case); entries without an id or availability left out. */
export function toPresence(
  value: Array<{ id?: string; availability?: string; activity?: string }> | undefined,
): Record<string, TeamsPresence> {
  const out: Record<string, TeamsPresence> = {};
  for (const p of value ?? []) {
    const id = presenceId(p.id);
    if (id && p.availability) out[id] = { availability: p.availability, activity: p.activity ?? "" };
  }
  return out;
}
