import { Check, Clock3, Minus } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import {
  type PresenceKind,
  presenceId,
  presenceStatus,
  type TeamsPresence,
  type TeamsPresenceResult,
} from "../../../shared/meetingPresence";
import { call } from "../../lib/host";
import { cn } from "../../ui";

/**
 * People's Teams status in this window (D-329): the ids its views show, read from main together
 * every minute while the window is visible, never while it is hidden or minimised.
 */
const REFRESH_MS = 60_000;
const wanted = new Map<string, number>();
let presence: Record<string, TeamsPresence> = {};
let state: TeamsPresenceResult["state"] | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let soon: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

async function refresh(): Promise<void> {
  if (document.visibilityState !== "visible" || !wanted.size) return;
  try {
    const r = await call("meetings.presence", { ids: [...wanted.keys()] });
    state = r.state;
    // Refused or failed: show no status rather than an error (or an old one).
    presence = r.state === "ok" ? { ...presence, ...r.presence } : {};
  } catch {
    presence = {};
  }
  notify();
}

/** Reads soon (new ids arrive together as views mount), and every minute while visible. */
function schedule(): void {
  clearTimeout(soon);
  soon = setTimeout(() => void refresh(), 50);
  if (!timer && wanted.size) timer = setInterval(() => void refresh(), REFRESH_MS);
}

if (typeof document !== "undefined")
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") schedule();
  });

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Someone's presence (by Entra object id or Teams id), undefined until known or when there is none. */
export function usePresence(id: string | undefined): TeamsPresence | undefined {
  const key = presenceId(id);
  useEffect(() => {
    if (!key) return;
    const first = !wanted.has(key);
    wanted.set(key, (wanted.get(key) ?? 0) + 1);
    if (first) schedule();
    return () => {
      const left = (wanted.get(key) ?? 1) - 1;
      if (left > 0) wanted.set(key, left);
      else wanted.delete(key);
      if (!wanted.size) {
        clearInterval(timer);
        timer = undefined;
      }
    };
  }, [key]);
  return useSyncExternalStore(subscribe, () => (key ? presence[key] : undefined));
}

/** Whether Jig may read presence: "consent" until you allow it (the Chats menu offers it). */
export function usePresenceState(): TeamsPresenceResult["state"] | undefined {
  return useSyncExternalStore(subscribe, () => state);
}

/** After you allowed it: read again now. */
export function refreshPresence(): void {
  schedule();
}

const DOT: Record<PresenceKind, string> = {
  available: "bg-success",
  busy: "bg-danger",
  dnd: "bg-danger",
  away: "bg-warning",
  offline: "border-2 border-hint",
};
const GLYPH: Partial<Record<PresenceKind, typeof Check>> = { available: Check, dnd: Minus, away: Clock3 };

/**
 * A person's Teams status as a dot on the bottom right of their avatar (which keeps its size), like
 * Teams: Available a green check, Busy red, Do not disturb a red minus, Away an amber clock, Offline a
 * grey ring; nothing when unknown. The avatar's wrapper must be `relative`. `ring` is the colour
 * around the dot: the background the avatar sits on.
 */
export function PresenceDot({
  id,
  name,
  small,
  ring = "ring-surface",
}: {
  id: string | undefined;
  name: string;
  small?: boolean;
  ring?: string;
}) {
  const status = presenceStatus(usePresence(id));
  if (!status) return null;
  const Glyph = GLYPH[status.kind];
  return (
    <span
      role="img"
      aria-label={`${name}: ${status.label}`}
      title={status.label}
      data-testid="presence"
      data-presence={status.kind}
      className={cn(
        "absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full ring-2",
        small ? "size-2.5" : "size-3.5",
        status.kind === "offline" && "bg-surface",
        DOT[status.kind],
        ring,
      )}
    >
      {Glyph && !small && <Glyph aria-hidden strokeWidth={3.5} className="size-2.5 text-surface" />}
    </span>
  );
}
