import { ArrowUp, ListEnd, type LucideIcon, Paperclip, Pause, X, Zap } from "lucide-react";
import type { QueuedMessage } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { cn, IconButton } from "../../ui";
import { notify } from "../../workbench/toasts";
import { openEditQueuedDialog } from "./SessionDialogs";

/**
 * The icons of where a message waits, the same in the Send menu and the rows (D-365): the queue
 * (read after this turn), parked (kept until you send it), and sent into the running turn.
 */
export const QUEUE_ICON: LucideIcon = ListEnd;
export const PARK_ICON: LucideIcon = Pause;
export const SEND_NOW_ICON: LucideIcon = Zap;

async function act(title: string, run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    notify({ title, message: errorMessage(error), tone: "danger" });
  }
}

/**
 * One waiting message: the whole row opens it for editing (a modal); three fixed action slots on the
 * right (send now, move, remove) so the buttons line up in both groups and never move.
 */
function Row({
  sessionId,
  message,
  parked,
  busy,
  who,
}: {
  sessionId: string;
  message: QueuedMessage;
  parked: boolean;
  busy: boolean;
  who: string;
}) {
  const id = sessionId;
  const Icon = parked ? PARK_ICON : QUEUE_ICON;
  return (
    <div
      role="button"
      tabIndex={0}
      title="Edit this message before it is sent"
      data-testid={parked ? "parked-item" : "queue-item"}
      onClick={() => openEditQueuedDialog(id, message)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        openEditQueuedDialog(id, message);
      }}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md border px-2 py-0.5 text-xs hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent",
        parked ? "border-dashed border-line-strong text-muted" : "border-transparent bg-surface text-fg",
      )}
    >
      <Icon className="size-3.5 shrink-0 text-hint" />
      <span className="flex min-w-0 flex-1 items-center gap-1">
        {message.attachments?.length ? (
          <span className="flex shrink-0 items-center gap-0.5 text-muted">
            <Paperclip className="size-3" />
            {message.attachments.length}
          </span>
        ) : null}
        <span className="min-w-0 truncate">{message.text}</span>
      </span>
      {busy ? (
        <IconButton
          icon={SEND_NOW_ICON}
          size="sm"
          label={`Send now: ${who} reads it at its next step`}
          data-testid={parked ? "parked-send-now" : "queue-send-now"}
          onClick={(e) => {
            e.stopPropagation();
            void act("Not sent", () =>
              parked
                ? call("sessions.sendParked", { id, parkedId: message.id, now: true })
                : call("sessions.removeQueued", { id, queuedId: message.id }).then(() =>
                    call("sessions.send", {
                      id,
                      text: message.text,
                      attachments: message.attachments ?? [],
                      now: true,
                    }),
                  ),
            );
          }}
        />
      ) : (
        <span className="size-7 shrink-0" aria-hidden />
      )}
      {parked ? (
        <IconButton
          icon={busy ? QUEUE_ICON : ArrowUp}
          size="sm"
          label={busy ? "Queue: read after this turn" : "Send"}
          data-testid="parked-send"
          onClick={(e) => {
            e.stopPropagation();
            void act("Not sent", () => call("sessions.sendParked", { id, parkedId: message.id }));
          }}
        />
      ) : (
        <IconButton
          icon={PARK_ICON}
          size="sm"
          label="Park: keep it, don't send it after this turn"
          data-testid="queue-park"
          onClick={(e) => {
            e.stopPropagation();
            void act("Couldn't park it", () => call("sessions.park", { id, queuedId: message.id }));
          }}
        />
      )}
      <IconButton
        icon={X}
        size="sm"
        label={parked ? "Remove this parked message" : "Remove from queue"}
        data-testid={parked ? "parked-remove" : "queue-remove"}
        onClick={(e) => {
          e.stopPropagation();
          void call("sessions.removeQueued", { id, queuedId: message.id });
        }}
      />
    </div>
  );
}

/**
 * The messages waiting above the message box: "Sends after this turn" (the queue) and, under it,
 * "Parked" (D-365). It takes room above the box only while it has rows, as the queue always did, and
 * scrolls when there are many.
 */
export function ComposerQueue({
  sessionId,
  queue,
  parked,
  busy,
  who,
}: {
  sessionId: string;
  queue: QueuedMessage[];
  parked: QueuedMessage[];
  busy: boolean;
  who: string;
}) {
  if (queue.length === 0 && parked.length === 0) return null;
  return (
    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto" data-testid="queue">
      {queue.length > 0 && (
        <>
          <div className="text-2xs font-medium text-hint uppercase">Sends after this turn</div>
          {queue.map((q) => (
            <Row key={q.id} sessionId={sessionId} message={q} parked={false} busy={busy} who={who} />
          ))}
        </>
      )}
      {parked.length > 0 && (
        <>
          <div className="text-2xs font-medium text-hint uppercase" data-testid="parked">
            Parked · sent only when you send it
          </div>
          {parked.map((q) => (
            <Row key={q.id} sessionId={sessionId} message={q} parked busy={busy} who={who} />
          ))}
        </>
      )}
    </div>
  );
}
