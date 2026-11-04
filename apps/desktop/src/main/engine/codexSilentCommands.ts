import type { EngineEvent } from "../../shared/engine";

/** How long a command may run without printing anything before the chat says so. */
export const SILENT_COMMAND_MS = 3 * 60_000;

type Watched = { command: string; started: number; timer?: ReturnType<typeof setTimeout>; warned: boolean };

const minutes = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  return `${m} minute${m === 1 ? "" : "s"}`;
};

const short = (command: string) => (command.length > 120 ? `${command.slice(0, 117)}…` : command);

/**
 * Watches a Codex chat's shell commands: one that runs for `SILENT_COMMAND_MS` without any output
 * gets a warning in the chat, so a command that hangs (a stalled sandbox, a prompt waiting for
 * input) doesn't quietly eat the whole turn. When it later finishes, the same notice says so.
 * Codex itself keeps waiting; Stop ends the turn.
 */
export class SilentCommandWatch {
  private readonly running = new Map<string, Watched>();

  constructor(
    private readonly onEvent: (event: EngineEvent) => void,
    private readonly silentMs = SILENT_COMMAND_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Feeds one app-server notification. */
  handle(method: string, params: unknown): void {
    const p = (params ?? {}) as {
      itemId?: unknown;
      item?: { id?: unknown; type?: unknown; command?: unknown };
    };
    switch (method) {
      case "item/started":
        if (p.item?.type === "commandExecution" && typeof p.item.id === "string")
          this.start(p.item.id, typeof p.item.command === "string" ? p.item.command : "");
        return;
      case "item/commandExecution/outputDelta":
        if (typeof p.itemId === "string") this.output(p.itemId);
        return;
      case "item/completed":
        if (p.item?.type === "commandExecution" && typeof p.item.id === "string") this.finish(p.item.id);
        return;
      case "turn/completed":
        this.clear();
        return;
    }
  }

  /** Forgets every command (the turn or the chat ended) without further notices. */
  clear(): void {
    for (const watched of this.running.values()) clearTimeout(watched.timer);
    this.running.clear();
  }

  private start(id: string, command: string) {
    this.running.set(id, { command, started: this.now(), warned: false });
    this.arm(id);
  }

  private output(id: string) {
    const watched = this.running.get(id);
    // Once it prints again it isn't silent; a warned one keeps its notice until it finishes.
    if (watched && !watched.warned) this.arm(id);
  }

  private arm(id: string) {
    const watched = this.running.get(id);
    if (!watched) return;
    clearTimeout(watched.timer);
    watched.timer = setTimeout(() => this.warn(id), this.silentMs);
  }

  private warn(id: string) {
    const watched = this.running.get(id);
    if (!watched) return;
    watched.warned = true;
    this.onEvent({
      type: "notice",
      tone: "warning",
      key: `silent-command-${id}`,
      text: `A command has run for ${minutes(this.now() - watched.started)} without any output, and Codex is still waiting for it: ${short(watched.command)}. Press Stop to end the turn if it hangs.`,
    });
  }

  private finish(id: string) {
    const watched = this.running.get(id);
    if (!watched) return;
    clearTimeout(watched.timer);
    this.running.delete(id);
    if (watched.warned)
      this.onEvent({
        type: "notice",
        tone: "info",
        key: `silent-command-${id}`,
        text: `A command that ran without output finished after ${minutes(this.now() - watched.started)}: ${short(watched.command)}.`,
      });
  }
}
