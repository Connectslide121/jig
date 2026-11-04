/**
 * Time limits for Claude's browser (D-319): nothing it waits on (a load, a page script, a frame, a
 * whole tool call) may wait for ever. `JIG_BROWSER_TIMEOUT_SCALE` shortens them for the e2e tests.
 */
const SCALE = Number(process.env.JIG_BROWSER_TIMEOUT_SCALE) || 1;
const ms = (n: number) => Math.max(200, Math.round(n * SCALE));

export const LIMITS = {
  /** A page load (`loadURL`). */
  load: ms(30_000),
  /** One script in the page (`executeJavaScript`, `insertText`, a DevTools command). */
  script: ms(15_000),
  /** The quick "are you there?" script after a script timed out. */
  probe: ms(3_000),
  /** One `capturePage` (tried twice). */
  capture: ms(15_000),
  /** Waiting for the page to stop loading after an action. */
  settle: ms(15_000),
  /** One browser tool call, whatever it does: the backstop. */
  call: ms(60_000),
};

/** Seconds for messages: "30 s". */
export const secs = (msValue: number) => `${Math.round(msValue / 1000)} s`;

/** A wait ran out of time; `label` says which limit (`call` is the per-call backstop). */
export class TimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly ms: number,
  ) {
    super(`Timed out (${label}, ${secs(ms)})`);
    this.name = "TimeoutError";
  }
}

/**
 * `promise`, or a `TimeoutError` after `limit` ms, or the signal's reason once it aborts, whichever
 * comes first. The promise itself keeps running (nothing in Electron can be cancelled); its late
 * result or error is dropped.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  limit: number,
  label: string,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    promise.catch(() => {});
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      done();
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      done();
      reject(new TimeoutError(label, limit));
    }, limit);
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        done();
        resolve(value);
      },
      (error) => {
        done();
        reject(error);
      },
    );
  });
}
