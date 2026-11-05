import { KEEP_MS, type RelayActivity, type RelayUpdate } from "./protocol.ts";

/**
 * The relay's only state (D-370): activities waiting for Jig (kept `KEEP_MS`, then pruned: Table
 * storage has no expiry of its own) and a few small records (the pairing, conversation references).
 * `TableStore` (`tableStore.ts`) keeps them in the Function's storage account; `MemoryStore` is for
 * the tests.
 */
export interface Store {
  /** Stores an activity under the next cursor (1, 2, 3… without gaps or repeats) and returns it. */
  append(activity: RelayActivity, received: number): Promise<number>;
  /** Up to `limit` updates after `after`, oldest first, none older than `KEEP_MS` before `now`. */
  after(after: number, limit: number, now: number): Promise<RelayUpdate[]>;
  /** Deletes the updates up to and including `cursor` (Jig has them). */
  forget(cursor: number): Promise<void>;
  /** Deletes updates received before `before`; returns how many. */
  prune(before: number): Promise<number>;
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** Records whose key starts with `prefix`. */
  list<T>(prefix: string): Promise<{ key: string; value: T }[]>;
}

export class MemoryStore implements Store {
  private updates: RelayUpdate[] = [];
  private next = 1;
  private records = new Map<string, string>();

  async append(activity: RelayActivity, received: number): Promise<number> {
    const cursor = this.next++;
    this.updates.push({ cursor, received, activity: structuredClone(activity) });
    return cursor;
  }

  async after(after: number, limit: number, now: number): Promise<RelayUpdate[]> {
    return this.updates.filter((u) => u.cursor > after && u.received >= now - KEEP_MS).slice(0, limit);
  }

  async forget(cursor: number): Promise<void> {
    this.updates = this.updates.filter((u) => u.cursor > cursor);
  }

  async prune(before: number): Promise<number> {
    const count = this.updates.length;
    this.updates = this.updates.filter((u) => u.received >= before);
    return count - this.updates.length;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = this.records.get(key);
    return raw === undefined ? undefined : (JSON.parse(raw) as T);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.records.set(key, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }

  async list<T>(prefix: string): Promise<{ key: string; value: T }[]> {
    return [...this.records]
      .filter(([k]) => k.startsWith(prefix))
      .map(([key, raw]) => ({ key, value: JSON.parse(raw) as T }));
  }
}
