/**
 * Asking before Jig quits (D-343): a core feature or an add-on's quit guard (`contributes.quitGuards`)
 * gives a reason; Jig lists every reason in one modal. Documented in docs/reference/ipc.md.
 */
export interface QuitReason {
  /** Unique in one question, e.g. `addon:time:timer` or `meetings`. */
  key: string;
  /** Who asks: the add-on's or feature's name. */
  source: string;
  /** Lucide icon name in kebab case. */
  icon?: string;
  message: string;
  detail?: string;
  /** Buttons on the reason's row; choosing one runs it, then Jig quits. */
  actions: Array<{ id: string; label: string }>;
}

/** Why Jig is closing: quitting, or restarting to install an update. */
export type QuitPurpose = "quit" | "update";

export interface QuitQuestion {
  purpose: QuitPurpose;
  reasons: QuitReason[];
}
