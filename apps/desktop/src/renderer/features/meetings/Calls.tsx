import { Phone, PhoneIncoming, PhoneOff, Video } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MeetingPerson, MeetingRecord } from "../../../shared/meetings";
import { call, errorMessage } from "../../lib/host";
import { Button, cn, Dialog, SearchInput, Spinner, Switch } from "../../ui";
import { initials } from "./format";
import type { Ringing } from "./media";
import { PersonPhoto } from "./photo";

/** The people you called or who called you, newest first, one row each (D-254). */
export function recentPeople(records: MeetingRecord[]): MeetingPerson[] {
  const out: MeetingPerson[] = [];
  for (const r of records)
    if (r.call && !out.some((p) => p.id === r.call!.peerId))
      out.push({ id: r.call.peerId, name: r.call.peerName, email: "" });
  return out.slice(0, 8);
}

function Avatar({ name, id, ringing }: { name: string; id?: string; ringing?: boolean }) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft font-semibold text-accent",
        ringing ? "size-20 text-2xl" : "size-8 text-xs",
      )}
    >
      {initials(name)}
      <PersonPhoto id={id} />
    </span>
  );
}

/**
 * Call someone in your organisation: the people you called recently, the ones you work with most,
 * or a search of the directory. A whole row places the call; the camera switch decides video.
 */
export function CallDialog({
  records,
  onClose,
  onCall,
}: {
  records: MeetingRecord[];
  onClose(): void;
  onCall(person: MeetingPerson, options: { camera: boolean }): Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; people: MeetingPerson[] }>();
  const [error, setError] = useState("");
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState<string>();
  const recent = useMemo(() => recentPeople(records), [records]);
  const asked = useRef(0);
  useEffect(() => {
    const version = ++asked.current;
    const timer = setTimeout(
      () =>
        void call("meetings.people", { query })
          .then((people) => {
            if (version !== asked.current) return;
            setFound({ query, people });
            setError("");
          })
          .catch((e) => {
            if (version !== asked.current) return;
            setFound({ query, people: [] });
            setError(errorMessage(e));
          }),
      query ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [query]);
  const searching = Boolean(query.trim());
  const sections: Array<[string, MeetingPerson[]]> = searching
    ? [["People", found?.people ?? []]]
    : [
        ["Recent calls", recent],
        ["People you work with", (found?.people ?? []).filter((p) => !recent.some((r) => r.id === p.id))],
      ];
  const loading = found?.query !== query;
  const place = async (person: MeetingPerson) => {
    setBusy(person.id);
    try {
      await onCall(person, { camera });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <Dialog
      open
      title="Call someone"
      width="md"
      onClose={onClose}
      testId="call-dialog"
      footer={
        <>
          <span className="mr-auto flex items-center gap-2 text-sm">
            <Video className="size-4 text-muted" />
            Camera on
            <Switch label="Camera on" checked={camera} onChange={setCamera} />
          </span>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-3">
        <SearchInput
          autoFocus
          placeholder="Search people by name or e-mail"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
        />
        {/* A fixed height, so the dialog doesn't jump while people load or the search narrows. */}
        <div className="relative h-80 overflow-y-auto" data-testid="call-people">
          {loading && !found ? (
            <Spinner center />
          ) : (
            <div className="space-y-4">
              {sections.map(([title, people]) =>
                people.length ? (
                  <div key={title} className="space-y-1">
                    <h3 className="px-2 text-2xs font-semibold tracking-wide text-hint uppercase">{title}</h3>
                    {people.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        data-testid="call-person"
                        disabled={Boolean(busy)}
                        title={`Call ${p.name}${camera ? " with video" : ""}`}
                        onClick={() => void place(p)}
                        className="group flex h-12 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-hover disabled:opacity-60"
                      >
                        <Avatar name={p.name} id={p.id} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {[p.title, p.email].filter(Boolean).join(" · ") || "Called before"}
                          </span>
                        </span>
                        <span className="flex size-8 shrink-0 items-center justify-center text-accent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
                          {busy === p.id ? (
                            <Spinner size="sm" />
                          ) : camera ? (
                            <Video className="size-4" />
                          ) : (
                            <Phone className="size-4" />
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null,
              )}
              {!loading && sections.every(([, people]) => !people.length) && (
                <p className="px-2 py-6 text-center text-sm text-muted">
                  {searching ? "Nobody in your organisation matches." : "Search for someone to call."}
                </p>
              )}
            </div>
          )}
        </div>
        <p
          role={error ? "alert" : "status"}
          className={cn("h-8 text-xs", error ? "text-danger" : "text-hint")}
        >
          {error ||
            "Teams calls to people in your organisation. Jig reads names and e-mail addresses from your directory to find them."}
        </p>
      </div>
    </Dialog>
  );
}

/** A soft two-tone ring, repeated until the call is answered or stops (Web Audio, no sound files). */
function useRingtone(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    const audio = new AudioContext();
    const ring = () => {
      const start = audio.currentTime;
      for (const [offset, frequency] of [
        [0, 660],
        [0.25, 880],
      ] as const) {
        const tone = audio.createOscillator();
        const gain = audio.createGain();
        tone.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start + offset);
        gain.gain.linearRampToValueAtTime(0.12, start + offset + 0.03);
        gain.gain.linearRampToValueAtTime(0, start + offset + 0.22);
        tone.connect(gain).connect(audio.destination);
        tone.start(start + offset);
        tone.stop(start + offset + 0.25);
      }
    };
    ring();
    const timer = setInterval(ring, 2000);
    return () => {
      clearInterval(timer);
      void audio.close();
    };
  }, [on]);
}

/** A Teams call ringing: who calls, Decline, Answer and Answer with video. */
export function IncomingCall({
  ringing,
  inCall,
  onAnswer,
  onDecline,
}: {
  ringing: Ringing;
  /** You're in a call or meeting already: answering ends it. */
  inCall: boolean;
  onAnswer(options: { camera: boolean }): void;
  onDecline(): void;
}) {
  useRingtone(true);
  return (
    <Dialog
      open
      title="Incoming Teams call"
      width="sm"
      onClose={onDecline}
      testId="incoming-call"
      footer={
        <>
          <Button variant="danger" icon={PhoneOff} onClick={onDecline}>
            Decline
          </Button>
          <Button icon={Video} onClick={() => onAnswer({ camera: true })}>
            Video
          </Button>
          <Button variant="primary" icon={Phone} onClick={() => onAnswer({ camera: false })}>
            Answer
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Avatar name={ringing.name} id={ringing.peerId} ringing />
        <div className="space-y-1">
          <div className="text-lg font-semibold">{ringing.name}</div>
          <div className="flex items-center justify-center gap-1.5 text-sm text-muted">
            <PhoneIncoming className="size-4" />
            {inCall ? "Answering ends your current call" : "is calling you on Teams"}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
