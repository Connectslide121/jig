/**
 * When a terminal a chat started closes by itself (D-373): once it has exited and its chat got the exit
 * notice, it closes as soon as nothing needs it on screen.
 * - It succeeded: right away, unless it is the terminal you are looking at; then when you switch away.
 * - It failed: only after you have looked at it (and switched away), so a failure never vanishes
 *   unseen; the chat archived or deleted still closes it.
 * - While `jig_terminal_run` is still answering (`hold`), it waits, so the answer can read its output.
 */
export class FinishedTerminals {
  /** The terminal on screen in the Terminals view, as the renderer reports it. */
  private watching: string | undefined;
  /** Exited and notified: id → whether it failed. */
  private finished = new Map<string, boolean>();
  private seen = new Set<string>();
  private held = new Set<string>();

  constructor(private readonly close: (id: string) => void) {}

  /** The chat has its exit notice: close it when nothing needs it on screen. */
  done(id: string, failed: boolean): void {
    this.finished.set(id, failed);
    if (this.watching === id) this.seen.add(id);
    this.tryClose(id);
  }

  /** The terminal now on screen (undefined: none, or the Terminals view is out of sight). */
  watch(id: string | undefined): void {
    const before = this.watching;
    this.watching = id;
    if (id && this.finished.has(id)) this.seen.add(id);
    if (before && before !== id) this.tryClose(before);
  }

  hold(id: string): void {
    this.held.add(id);
  }

  release(id: string): void {
    this.held.delete(id);
    this.tryClose(id);
  }

  /** The terminal was closed some other way: drop what we know about it. */
  forget(id: string): void {
    this.finished.delete(id);
    this.seen.delete(id);
    this.held.delete(id);
  }

  private tryClose(id: string): void {
    const failed = this.finished.get(id);
    if (failed === undefined || this.held.has(id) || this.watching === id) return;
    if (failed && !this.seen.has(id)) return;
    this.forget(id);
    this.close(id);
  }
}
