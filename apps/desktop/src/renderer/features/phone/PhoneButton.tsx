import { Smartphone } from "lucide-react";
import { updateConfig, useConfig } from "../../stores/config";
import { cn } from "../../ui";
import { openSettings } from "../../workbench/actions";
import { registerTopbarItem } from "../../workbench/registry";
import { notify } from "../../workbench/toasts";
import { usePhone } from "./store";

/**
 * The phone switch at the top right (D-350): on when you leave, off when you're back. Always there
 * (nothing moves when the phone's state loads); before the phone is set up it opens Settings → Phone.
 */
export function PhoneButton() {
  const state = usePhone((s) => s.state);
  const enabled = useConfig((s) => s.config?.phone.enabled ?? false);
  const connected = state?.status === "connected";
  const on = connected && enabled;
  const label = !connected
    ? "Jig on your phone: not set up (opens Settings → Phone)"
    : state?.error
      ? `Jig on your phone: ${state.error}`
      : on
        ? "Jig on your phone: on. Click to turn it off"
        : "Jig on your phone: off. Click to turn it on";

  const toggle = async () => {
    if (!connected) return openSettings("phone");
    await updateConfig({ phone: { enabled: !enabled } });
    notify({
      tone: enabled ? "info" : "success",
      title: enabled ? "Phone off" : "Phone on",
      message: enabled
        ? "Jig won't message your phone or read it until you turn it on again."
        : "Jig messages your phone when chats need you, and reads what you send.",
    });
  };

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={connected ? on : undefined}
      title={label}
      data-testid="topbar-phone"
      onClick={() => void toggle()}
      className={cn(
        "no-drag relative inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-hover",
        on ? "text-accent" : "text-muted hover:text-fg",
      )}
    >
      <Smartphone className="size-4.5" />
      {/* The dot keeps its place: accent when on, red when Telegram has a problem, hidden when off. */}
      <span
        aria-hidden
        className={cn(
          "absolute top-1.5 right-1.5 size-2 rounded-full ring-2 ring-surface",
          on && state?.error ? "bg-danger" : on ? "bg-accent" : "invisible",
        )}
      />
    </button>
  );
}

export function registerPhone(): void {
  registerTopbarItem({ id: "jig.phone", order: 100, component: PhoneButton, owner: "core" });
}
