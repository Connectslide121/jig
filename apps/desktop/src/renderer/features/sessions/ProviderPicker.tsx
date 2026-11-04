import { ChevronDown, LogIn } from "lucide-react";
import { type ChatProvider, chatProvider, type SessionMeta } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { useChatGptStatus } from "../../stores/providers";
import { cn, type MenuEntry, openMenuAt } from "../../ui";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { ProviderMark } from "../usage/ProviderMark";
import { CHAT_PROVIDER_NAMES } from "./provider";

/**
 * Who runs the chat (D-314), beside the model picker: Claude or ChatGPT, until the first message is
 * sent. After that the same button is the chat's mark (no chevron, nothing to open): a chat keeps its
 * provider for life (D-309), and the slot keeps its size so nothing beside it moves.
 */
export function ProviderPicker({ meta, changeable }: { meta: SessionMeta; changeable: boolean }) {
  const chatgpt = useChatGptStatus();
  const provider = chatProvider(meta);
  const name = CHAT_PROVIDER_NAMES[provider];
  const choose = async (next: ChatProvider) => {
    try {
      await call("sessions.setProvider", { id: meta.id, provider: next });
    } catch (error) {
      notify({ title: "Couldn't change who runs this chat", message: errorMessage(error), tone: "danger" });
    }
  };
  const menu = (): MenuEntry[] => {
    const ready = chatgpt?.ready === true;
    return [
      { heading: "Run this chat on" },
      {
        label: "Claude",
        avatar: <ProviderMark provider="claude" iconOnly />,
        detail: "Claude Code",
        checked: provider === "claude",
        testId: "provider-claude",
        onSelect: () => void choose("claude"),
      },
      {
        label: "ChatGPT",
        avatar: <ProviderMark provider="codex" iconOnly />,
        detail: ready ? "Codex" : (chatgpt?.detail ?? "Checking Codex…"),
        checked: provider === "codex",
        disabled: !ready,
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
      aria-disabled={!changeable}
      onClick={(e) => changeable && openMenuAt(e.currentTarget, menu(), true)}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-sm leading-none",
        changeable ? "hover:bg-hover" : "cursor-default",
      )}
      title={
        changeable
          ? `Runs on ${name} · choose Claude or ChatGPT before the first message`
          : `This chat runs on ${name} for its whole life · start a new chat for the other`
      }
    >
      <ProviderMark provider={provider} />
      <ChevronDown className={cn("block size-3.5 shrink-0 text-muted", !changeable && "invisible")} />
    </button>
  );
}
