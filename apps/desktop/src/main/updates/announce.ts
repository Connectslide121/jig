/**
 * What runs right before Jig closes to install an update (D-395): add-ons hear `app.updating` (the
 * Tasks queue holds, so no task starts while Jig closes). Kept apart so the update code needn't know
 * about add-ons; `main/addons` registers the listener.
 */

/** How long the update waits for its listeners before it goes on anyway. */
export const ANNOUNCE_TIMEOUT_MS = 1_500;

type Listener = (info: { version?: string }) => Promise<unknown>;
const listeners: Listener[] = [];

/** Runs `listener` before Jig closes to install an update. */
export function beforeUpdate(listener: Listener): void {
  listeners.push(listener);
}

/** Tells the listeners and resolves when they answered, or after `ANNOUNCE_TIMEOUT_MS`; never rejects. */
export async function announceUpdate(info: { version?: string } = {}, timeoutMs = ANNOUNCE_TIMEOUT_MS) {
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    Promise.all(
      listeners.map((l) =>
        Promise.resolve()
          .then(() => l(info))
          .catch(() => undefined),
      ),
    ),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  clearTimeout(timer);
}
