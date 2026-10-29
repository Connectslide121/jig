import type { StorageOptions } from "@jig/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProjects } from "../workbench/projects";
import { useAddon } from "./context";

/**
 * Calls a host.ts export and keeps the result; `reload()` calls again. Re-runs when `args` change, or
 * when the add-on's stored data changes from outside (the `storage` event), and
 * never returns data of earlier `args` (another project's files must not show while the new load runs).
 */
export function useHostCall<T = unknown>(method: string, args?: unknown, options: { skip?: boolean } = {}) {
  const ctx = useAddon();
  const [result, setResult] = useState<{ key: string; value: T }>();
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
        setResult({ key, value });
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
  // Claude changed this add-on's stored data (jig_set_addon_data): show the new state.
  useEffect(() => {
    if (options.skip) return;
    return ctx.on("storage", () => void reload());
  }, [ctx, reload, options.skip]);
  const data = result?.key === key ? result.value : undefined;
  return { data, error, loading, reload };
}

/** Listens to an event from the add-on's host code (`api.emit(topic, payload)`). */
export function useAddonEvent(topic: string, listener: (payload: unknown) => void): void {
  const ctx = useAddon();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => ctx.on(topic, (p) => ref.current(p)), [ctx, topic]);
}

/**
 * A value in the add-on's storage, kept in sync: `[value, set]`. It follows the add-on's declared scope
 * (`"storage": { "scope": "project" }`): switching project (or the project's repository) shows that
 * one's copy. It reloads when the data changes from outside (Claude, host code emitting `storage`).
 */
export function useStorage<T>(key: string, initial: T, options?: StorageOptions) {
  const ctx = useAddon();
  const scope = options?.scope ?? ctx.storage.scope;
  // The active project / repository, so a switch reloads.
  const active = useProjects((s) => {
    const p = s.projects.find((x) => x.id === s.activeId);
    return scope === "project" ? p?.id : scope === "repo" ? (p?.focusRepo ?? p?.path) : "";
  });
  const where = options?.id ?? active;
  const [value, setValue] = useState<{ where?: string; value: T }>({ value: initial });
  // biome-ignore lint/correctness/useExhaustiveDependencies: `initial` is only the first value.
  const load = useCallback(async () => {
    const v = await ctx.storage.get<T>(key, { scope, id: where });
    setValue({ where, value: v === undefined ? initial : v });
  }, [ctx, key, scope, where]);
  useEffect(() => {
    void load();
    return ctx.on("storage", () => void load());
  }, [ctx, load]);
  const set = useCallback(
    async (next: T) => {
      setValue({ where, value: next });
      await ctx.storage.set(key, next, { scope, id: where });
    },
    [ctx, key, scope, where],
  );
  return [value.where === where ? value.value : initial, set] as const;
}
