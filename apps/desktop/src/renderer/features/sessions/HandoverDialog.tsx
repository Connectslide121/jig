import { ArrowRight, Check, CircleAlert, Info, Minus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { create } from "zustand";
import {
  type ChatProvider,
  chatProvider,
  type HandoverPlan,
  otherProvider,
  PERMISSION_MODE_LABELS,
  type SessionMeta,
} from "../../../shared/engine";
import { featuresLost } from "../../../shared/handoff";
import { call, errorMessage } from "../../lib/host";
import { useProviders } from "../../stores/providers";
import { Button, cn, Dialog } from "../../ui";
import { notify } from "../../workbench/toasts";
import { ProviderMark } from "../usage/ProviderMark";
import { modelLabel } from "./menus";
import { CHAT_PROVIDER_NAMES } from "./provider";

/**
 * Handing a chat over to the other provider (D-339) always goes through this dialog: it says what
 * happens, what carries over, what doesn't and what is different there, from the host's own plan.
 * The plan is read before the dialog opens, so nothing in it loads or moves.
 */
const useHandover = create<{ open?: { meta: SessionMeta; plan: HandoverPlan } }>(() => ({}));

/** Whether a chat can be handed over to `to` now, and why not (for menus): between turns, signed in. */
export function handoverState(meta: SessionMeta, to: ChatProvider): { ok: boolean; why?: string } {
  if (meta.kind) return { ok: false, why: "Stays on Claude Code" };
  if (["working", "needs_you", "starting"].includes(meta.status))
    return { ok: false, why: "After this turn" };
  if (to === "codex" && useProviders.getState().chatgpt?.ready !== true)
    return { ok: false, why: useProviders.getState().chatgpt?.detail ?? "ChatGPT isn't ready" };
  return { ok: true };
}

export async function openHandoverDialog(meta: SessionMeta, to: ChatProvider): Promise<void> {
  try {
    const plan = await call("sessions.handOverPlan", { id: meta.id, provider: to });
    useHandover.setState({ open: { meta, plan } });
  } catch (error) {
    notify({ title: "Couldn't hand the chat over", message: errorMessage(error), tone: "danger" });
  }
}

export function HandoverDialogHost() {
  const open = useHandover((s) => s.open);
  if (!open) return null;
  return (
    <HandoverDialog
      key={open.meta.id}
      meta={open.meta}
      plan={open.plan}
      onClose={() => useHandover.setState({ open: undefined })}
    />
  );
}

/** A row in one of the dialog's lists: a fixed icon column, then the text. */
function Line({ icon, tone, children }: { icon: ReactNode; tone?: "warning"; children: ReactNode }) {
  return (
    <li className={cn("flex items-start gap-2", tone === "warning" ? "text-warning" : "text-fg")}>
      <span className="flex h-5 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-2xs font-medium text-hint uppercase">{title}</h3>
      <ul className="flex flex-col gap-1 text-sm">{children}</ul>
    </section>
  );
}

function HandoverDialog({
  meta,
  plan,
  onClose,
}: {
  meta: SessionMeta;
  plan: HandoverPlan;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const from = CHAT_PROVIDER_NAMES[plan.from];
  const to = CHAT_PROVIDER_NAMES[plan.to];
  const lost = featuresLost(plan.from, plan.to);
  const label = (provider: ChatProvider, side: HandoverPlan["before"]) =>
    modelLabel({ ...meta, provider, model: side.model, effort: side.effort });
  const settings: Array<{ name: string; before: string; after: string }> = [
    { name: "Model", before: label(plan.from, plan.before), after: label(plan.to, plan.after) },
    {
      name: "Permission mode",
      before: PERMISSION_MODE_LABELS[plan.before.permissionMode],
      after: PERMISSION_MODE_LABELS[plan.after.permissionMode],
    },
  ];
  const handOver = async () => {
    setBusy(true);
    try {
      await call("sessions.handOver", { id: meta.id, provider: plan.to });
      onClose();
    } catch (error) {
      setBusy(false);
      notify({ title: "Couldn't hand the chat over", message: errorMessage(error), tone: "danger" });
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Hand this chat over to ${to}`}
      testId="handover-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || Boolean(plan.blocked)}
            onClick={() => void handOver()}
            data-testid="handover-confirm"
          >
            Hand over
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm" data-testid="handover-route">
          <ProviderMark provider={plan.from} />
          <ArrowRight className="size-3.5 shrink-0 text-muted" />
          <ProviderMark provider={plan.to} />
        </div>
        <p className="text-sm text-muted">
          The chat stays here, in the same folder. {from} stops, a divider marks the change, and {to} picks up
          from your next message. You can hand it back the same way.
        </p>

        {/* Before and after in fixed columns: the name, then each side, the arrow between them. */}
        <div
          className="grid items-center gap-x-3 gap-y-1 rounded-md border border-line bg-surface p-3 text-sm"
          style={{ gridTemplateColumns: "auto minmax(0, 1fr) auto minmax(0, 1fr)" }}
          data-testid="handover-settings"
        >
          {settings.map((s) => (
            <div key={s.name} className="contents">
              <span className="text-muted">{s.name}</span>
              <span className="truncate" title={s.before}>
                {s.before}
              </span>
              <ArrowRight className="size-3.5 text-hint" />
              <span className="truncate font-medium" title={s.after}>
                {s.after}
              </span>
            </div>
          ))}
        </div>

        <Section title="Carries over">
          <Line icon={<Check className="size-3.5 text-success" />}>
            {plan.messages
              ? `A summary Jig writes from this chat (no AI): your goal, your latest ${plan.messages === 1 ? "message" : "messages"}, ${from}'s last replies, any plan and open to-dos. It goes with your next message.`
              : "Nothing has been said yet, so there is nothing to summarise."}
          </Line>
          <Line icon={<Check className="size-3.5 text-success" />}>
            Your files and uncommitted changes, as they are on disk
            {plan.files ? ` (${plan.files} ${plan.files === 1 ? "file" : "files"} edited in this chat)` : ""}.
          </Line>
          <Line icon={<Check className="size-3.5 text-success" />}>
            The model's tier, the effort and the permission mode, as above.
          </Line>
        </Section>

        <Section title="Doesn't carry over">
          <Line icon={<Minus className="size-3.5 text-muted" />}>
            {from}'s full conversation: earlier tool output and long replies. {to} starts its own from the
            summary.
          </Line>
          <Line icon={<Minus className="size-3.5 text-muted" />}>
            Rewinding to messages before the handover.
          </Line>
        </Section>

        <Section title={`Different on ${to}`}>
          {lost.length > 0 && (
            <Line icon={<Info className="size-3.5 text-muted" />}>
              {to} chats have no {lost.join(", ")}.
            </Line>
          )}
          <Line icon={<Info className="size-3.5 text-muted" />}>
            It uses your {to} plan instead of {from}'s
            {plan.to === "codex" ? "; Jig estimates its cost at OpenAI API prices" : ""}.
          </Line>
          {!plan.room.ok && (
            <Line icon={<CircleAlert className="size-3.5" />} tone="warning">
              {plan.room.reason ?? `${to}'s plan may have no room`}: the next message may stop at its limit.
            </Line>
          )}
          {plan.blocked && (
            <Line icon={<CircleAlert className="size-3.5" />} tone="warning">
              {plan.blocked}.
            </Line>
          )}
        </Section>
      </div>
    </Dialog>
  );
}

/** Opens the dialog for the chat's other provider, from a menu. */
export const handOverToOther = (meta: SessionMeta): Promise<void> =>
  openHandoverDialog(meta, otherProvider(chatProvider(meta)));
