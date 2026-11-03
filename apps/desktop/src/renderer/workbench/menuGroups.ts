import type { MenuEntry } from "../ui/Menu";
import type { MenuGroupDef } from "./registry";

/** How long a menu waits for an add-on's live entries before it opens with its actions alone (D-305). */
export const LIVE_MENU_TIMEOUT_MS = 500;

/** Live entries per action group. */
export type LiveEntries = Record<string, MenuEntry[]>;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as PromiseLike<unknown> | undefined)?.then === "function";

function checked(def: MenuGroupDef, value: unknown): MenuEntry[] {
  if (Array.isArray(value)) return value as MenuEntry[];
  def.onError?.(new Error("its menu entries aren't a list"));
  return [];
}

function failed(def: MenuGroupDef, error: unknown): MenuEntry[] {
  def.onError?.(error instanceof Error ? error : new Error(String(error)));
  return [];
}

function within<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`its menu entries took longer than ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Asks each provider for its entries. One that throws, rejects, returns something else than a list
 * or takes longer than `timeoutMs` gives none (and is told through `onError`). The answer is
 * synchronous when every provider answers synchronously, so such a menu opens without a delay.
 */
export function collectLiveEntries(
  defs: MenuGroupDef[],
  timeoutMs = LIVE_MENU_TIMEOUT_MS,
): LiveEntries | Promise<LiveEntries> {
  const results = defs.map((def): MenuEntry[] | Promise<MenuEntry[]> => {
    try {
      const value = def.items();
      return isThenable(value)
        ? within(value, timeoutMs).then(
            (v) => checked(def, v),
            (e) => failed(def, e),
          )
        : checked(def, value);
    } catch (error) {
      return failed(def, error);
    }
  });
  const merge = (lists: MenuEntry[][]): LiveEntries => {
    const out: LiveEntries = {};
    defs.forEach((def, i) => {
      const list = lists[i] ?? [];
      if (list.length) out[def.group] = [...(out[def.group] ?? []), ...list];
    });
    return out;
  };
  return results.some(isThenable) ? Promise.all(results).then(merge) : merge(results as MenuEntry[][]);
}

/** A group's live entries above its actions, a separator between (none doubled at the edges). */
export function withLiveEntries(live: MenuEntry[] | undefined, actions: MenuEntry[]): MenuEntry[] {
  const entries = [...(live ?? [])];
  while (entries[0] && "separator" in entries[0]) entries.shift();
  while (entries.length && "separator" in entries[entries.length - 1]!) entries.pop();
  if (!entries.length) return actions;
  return actions.length ? [...entries, { separator: true }, ...actions] : entries;
}
