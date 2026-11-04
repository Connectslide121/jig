import { ChevronDown, LogIn } from "lucide-react";
import { type ChatProvider, chatProvider, otherProvider, type SessionMeta } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { useChatGptStatus } from "../../stores/providers";
import { type MenuEntry, openMenuAt } from "../../ui";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { ProviderMark } from "../usage/ProviderMark";
import { handoverState, openHandoverDialog } from "./HandoverDialog";
import { CHAT_PROVIDER_NAMES } from "./provider";

/**
 * Who runs the chat (D-314, D-339), beside the model picker: Claude or ChatGPT. Before the first
 * message picking one just switches; after it, picking the other one opens the handover dialog (the
 * chat carries on with it, D-339), and while a turn runs that entry waits for the turn to finish. In a
 * narrow message box it is the icon alone, so the model and permission pickers keep room.
 */
export function ProviderPicker({ meta, fresh }: { meta: SessionMeta; fresh: boolean }) {
  const chatgpt = useChatGptStatus();
  const provider = chatProvider(meta);
  const name = CHAT_PROVIDER_NAMES[provider];
  const other = CHAT_PROVIDER_NAMES[otherProvider(provider)];
  const choose = async (next: ChatProvider) => {
    if (next === provider) return;
    if (!fresh) return openHandoverDialog(meta, next);
    try {
      await call("sessions.setProvider", { id: meta.id, provider: next });
    } catch (error) {
      notify({ title: "Couldn't change who runs this chat", message: errorMessage(error), tone: "danger" });
    }
  };
  // A started chat hands over between turns only; the entry says when it can.
  const wait = (to: ChatProvider) => (!fresh && to !== provider ? handoverState(meta, to) : { ok: true });
  const menu = (): MenuEntry[] => {
    const ready = chatgpt?.ready === true;
    return [
      { heading: fresh ? "Run this chat on" : "Hand this chat over to" },
      {
        label: "Claude",
        avatar: <ProviderMark provider="claude" iconOnly />,
        detail: wait("claude").why ?? "Claude Code",
        checked: provider === "claude",
        disabled: !wait("claude").ok,
        testId: "provider-claude",
        onSelect: () => void choose("claude"),
      },
      {
        label: "ChatGPT",
        avatar: <ProviderMark provider="codex" iconOnly />,
        detail: ready ? (wait("codex").why ?? "Codex") : (chatgpt?.detail ?? "Checking Codex…"),
        checked: provider === "codex",
        disabled: !ready || !wait("codex").ok,
        testId: "provider-codex",
        onSelect: () => void choose("codex"),
      },
      ...(ready
        ? []
        : [
            { separator: true } as const,
            {
              label: "Sign in to ChatGPT on Get started…",
              icon: LogIn,
              testId: "provider-get-started",
              onSelect: () => void workbench.openTab("jig.setup"),
            },
          ]),
    ];
  };
  return (
    <button
      type="button"
      data-testid="provider-menu"
      onClick={(e) => openMenuAt(e.currentTarget, menu(), true)}
      className="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md text-sm leading-none hover:bg-hover @max-sm/toolbar:px-1.5 @sm/toolbar:px-2"
      title={
        fresh
          ? `Runs on ${name} · choose Claude or ChatGPT`
          : `Runs on ${name} · hand this chat over to ${other}`
      }
    >
      {/* Container variants on both sides: a plain display utility would win over them (D-297). */}
      <span className="@max-sm/toolbar:hidden @sm/toolbar:flex">
        <ProviderMark provider={provider} />
      </span>
      <span className="@max-sm/toolbar:flex @sm/toolbar:hidden">
        <ProviderMark provider={provider} iconOnly />
      </span>
      <ChevronDown className="size-3.5 shrink-0 text-muted @max-sm/toolbar:hidden @sm/toolbar:block" />
    </button>
  );
}
