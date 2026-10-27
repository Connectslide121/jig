import { useCallback, useEffect, useRef, useState } from "react";
import { useAddon } from "./context";

/** Calls a host.ts export and keeps the result; `reload()` calls again. Re-runs when `args` change. */
export function useHostCall<T = unknown>(method: string, args?: unknown, options: { skip?: boolean } = {}) {
  const ctx = useAddon();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(!options.skip);
  const key = JSON.stringify(args ?? null);
  const counter = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `args`.
  const reload = useCallback(async () => {
    const n = ++counter.current;
    setLoading(true);
    try {
      const value = await ctx.host.call<T>(method, args);
      if (n === counter.current) {
        setData(value);
        setError(undefined);
      }
    } catch (e) {
      if (n === counter.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (n === counter.current) setLoading(false);
    }
  }, [ctx, method, key]);
  useEffect(() => {
    if (!options.skip) void reload();
  }, [reload, options.skip]);
  return { data, error, loading, reload };
}

/** Listens to an event from the add-on's host code (`api.emit(topic, payload)`). */
export function useAddonEvent(topic: string, listener: (payload: unknown) => void): void {
  const ctx = useAddon();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => ctx.on(topic, (p) => ref.current(p)), [ctx, topic]);
}
