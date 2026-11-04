import { Aperture, Asterisk } from "lucide-react";
import type { ComponentType } from "react";
import type { ChatProvider } from "../../../shared/engine";
import type { AiProvider } from "../../../shared/providers";
import { cn } from "../../ui";

/**
 * Who answers (D-298): a small icon and a short name in the provider's own colour, the same in the
 * usage footer, the chat pickers, chat headers and the Chats list (D-314). Only the mark says who it
 * is; colours elsewhere keep their own meaning.
 */
export const PROVIDER_MARKS: Record<
  AiProvider,
  { label: string; icon: ComponentType<{ className?: string }>; text: string; source: string }
> = {
  claude: { label: "Claude", icon: Asterisk, text: "text-provider-claude", source: "Claude Code" },
  chatgpt: { label: "ChatGPT", icon: Aperture, text: "text-provider-chatgpt", source: "Codex" },
};

/** A chat's provider as the plan that answers it: Codex chats run on ChatGPT. */
export const markOf = (provider: ChatProvider | AiProvider): AiProvider =>
  provider === "codex" ? "chatgpt" : provider;

/** The provider's mark; `iconOnly` keeps the name for the tooltip (narrow rows). */
export function ProviderMark({
  provider,
  iconOnly,
  className,
}: {
  provider: ChatProvider | AiProvider;
  iconOnly?: boolean;
  className?: string;
}) {
  const mark = PROVIDER_MARKS[markOf(provider)];
  const Icon = mark.icon;
  return (
    <span
      className={cn("flex shrink-0 items-center gap-1 font-medium", mark.text, className)}
      title={iconOnly ? mark.label : undefined}
      data-testid={`provider-mark-${markOf(provider)}`}
    >
      <Icon className="size-3.5 shrink-0" />
      {iconOnly ? <span className="sr-only">{mark.label}</span> : mark.label}
    </span>
  );
}
