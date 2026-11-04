import { ArrowRight, ArrowRightLeft, Clock, Gauge } from "lucide-react";
import { useState } from "react";
import { type ChatItem, type ChatProvider, otherProvider } from "../../../shared/engine";
import { formatResetIn, planHasRoom } from "../../../shared/usage";
import { call, errorMessage } from "../../lib/host";
import { clockTime, sameDay, shortDay } from "../../lib/time";
import { useUsage } from "../../stores/usage";
import { Button } from "../../ui";
import { notify } from "../../workbench/toasts";
import { ProviderMark } from "../usage/ProviderMark";
import { CHAT_PROVIDER_NAMES } from "./provider";
import { useSessions } from "./store";

type LimitItem = Extract<ChatItem, { kind: "limit" }>;
type Action = "continue" | "wait" | "cancel" | "dismiss";

/** "14:00", or "Thu 5 Nov 14:00" when it isn't today. */
function resetTime(iso: string): string {
  return sameDay(iso, new Date().toISOString()) ? clockTime(iso) : `${shortDay(iso)} ${clockTime(iso)}`;
}

/** Whether the other provider has room for this chat now, by the usage meter (D-338). */
function useRoom(provider: ChatProvider) {
  const usage = useUsage((s) => (provider === "codex" ? s.usage.chatgpt : s.usage.claude));
  return planHasRoom(usage, CHAT_PROVIDER_NAMES[provider]);
}

/**
 * The chat's provider hit its plan limit (D-338): what happened, when it resets, and what to do — carry
 * on with the other provider, wait and resume at the reset, or dismiss it. Three fixed lines, the last
 * one swapping its buttons for what was chosen, so nothing moves when you choose.
 */
export function LimitCard({ item, sessionId }: { item: LimitItem; sessionId: string }) {
  const current = useSessions((s) => s.metas[sessionId]?.limit?.itemId === item.id);
  const builder = useSessions((s) => Boolean(s.metas[sessionId]?.kind));
  const other = otherProvider(item.provider);
  const room = useRoom(other);
  const [busy, setBusy] = useState<Action>();
  const name = CHAT_PROVIDER_NAMES[item.provider];
  const otherName = CHAT_PROVIDER_NAMES[other];
  const act = async (action: Action) => {
    setBusy(action);
    try {
      await call("sessions.limitAction", { id: sessionId, itemId: item.id, action });
    } catch (error) {
      notify({
        title: `Couldn't ${action === "continue" ? `continue with ${otherName}` : "do that"}`,
        message: errorMessage(error),
        tone: "danger",
      });
    } finally {
      setBusy(undefined);
    }
  };
  const live = current && (item.status === "open" || item.status === "waiting");
  const canContinue = live && !builder && room.ok;
  const reset = item.resetsAt ? resetTime(item.resetsAt) : undefined;
  const ended: Record<Exclude<LimitItem["status"], "open" | "waiting">, string> = {
    continued: `Continued with ${CHAT_PROVIDER_NAMES[item.to ?? other]} below`,
    resumed: `Resumed on ${name} after the reset`,
    dismissed: "Dismissed",
  };
  return (
    <div
      className="flex flex-col gap-1 rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm"
      data-testid="limit-card"
      data-status={item.status}
    >
      <div className="flex h-5 items-center gap-2">
        <Gauge className="size-4 shrink-0 text-warning" />
        <span className="min-w-0 flex-1 truncate font-medium text-fg">{name}'s limit is reached</span>
        <span className="shrink-0 text-xs text-muted tabular-nums" data-testid="limit-resets">
          {reset ? `Resets ${reset} · ${formatResetIn(item.resetsAt)}` : "Reset time unknown"}
        </span>
      </div>
      <div className="selectable truncate pl-6 text-xs text-muted" title={item.message}>
        {item.message}
      </div>
      <div className="flex h-6 items-center gap-2 pl-6">
        {live ? (
          <>
            {canContinue && (
              <Button
                size="sm"
                variant="primary"
                icon={ArrowRightLeft}
                busy={busy === "continue"}
                disabled={Boolean(busy)}
                onClick={() => void act("continue")}
                data-testid="limit-continue"
              >
                Continue with {otherName}
              </Button>
            )}
            {item.status === "waiting" ? (
              <>
                <span
                  className="flex min-w-0 items-center gap-1 truncate text-xs text-fg"
                  data-testid="limit-waiting"
                >
                  <Clock className="size-3.5 shrink-0 text-muted" />
                  Resumes by itself at {reset}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(busy)}
                  onClick={() => void act("cancel")}
                  data-testid="limit-cancel"
                >
                  Don't wait
                </Button>
              </>
            ) : (
              <>
                {reset && (
                  <Button
                    size="sm"
                    icon={Clock}
                    busy={busy === "wait"}
                    disabled={Boolean(busy)}
                    onClick={() => void act("wait")}
                    data-testid="limit-wait"
                  >
                    Wait and resume at {reset}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(busy)}
                  onClick={() => void act("dismiss")}
                  data-testid="limit-dismiss"
                >
                  Dismiss
                </Button>
              </>
            )}
            {!builder && !room.ok && (
              <span className="ml-auto min-w-0 truncate text-2xs text-hint" data-testid="limit-no-room">
                {room.reason}
              </span>
            )}
          </>
        ) : (
          <span className="truncate text-xs text-muted" data-testid="limit-outcome">
            {item.status === "open" || item.status === "waiting" ? "No longer current" : ended[item.status]}
          </span>
        )}
      </div>
    </div>
  );
}

/** Where the chat carried on with another provider (D-338): a divider with the new provider's mark. */
export function HandoffDivider({ item }: { item: Extract<ChatItem, { kind: "handoff" }> }) {
  // One line between two rules, like a day divider: who ran the chat, who runs it from here, and why.
  return (
    <div
      className="flex items-center gap-2 py-1 text-xs text-muted"
      data-testid="handoff-divider"
      data-reason={item.reason}
    >
      <div className="h-px flex-1 bg-line" />
      <span className="flex shrink-0 items-center gap-1.5">
        <ProviderMark provider={item.from} />
        <ArrowRight className="size-3 shrink-0 text-hint" />
        <ProviderMark provider={item.to} />
      </span>
      <span className="shrink-0 text-hint">
        ·{" "}
        {item.reason === "limit" ? `${CHAT_PROVIDER_NAMES[item.from]}'s limit reached` : "handed over by you"}
      </span>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}
