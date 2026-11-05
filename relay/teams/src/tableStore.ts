import { odata, RestError, TableClient } from "@azure/data-tables";
import { KEEP_MS, type RelayActivity, type RelayUpdate } from "./protocol.ts";
import type { Store } from "./store.ts";

/**
 * `Store` in Azure Table storage (the Function's own storage account), one table:
 * - partition `u`: updates, row key the cursor zero-padded (so rows sort by cursor);
 * - partition `n`: the cursor counter, advanced with its ETag so two instances never share a cursor;
 * - partition `s`: records, row key the URI-encoded record key (Table keys can't hold `/ \ # ?`).
 */
export class TableStore implements Store {
  private ready?: Promise<void>;

  constructor(private readonly table: TableClient) {}

  static fromConnectionString(connection: string, table = "jigrelay"): TableStore {
    return new TableStore(TableClient.fromConnectionString(connection, table));
  }

  private init(): Promise<void> {
    this.ready ??= this.table.createTable().catch((e) => {
      this.ready = undefined;
      throw e;
    });
    return this.ready;
  }

  async append(activity: RelayActivity, received: number): Promise<number> {
    await this.init();
    const cursor = await this.nextCursor();
    await this.table.createEntity({
      partitionKey: "u",
      rowKey: pad(cursor),
      received,
      json: JSON.stringify(activity),
    });
    return cursor;
  }

  private async nextCursor(): Promise<number> {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const row = await this.table.getEntity<{ value: number }>("n", "cursor");
        const value = row.value + 1;
        await this.table.updateEntity({ partitionKey: "n", rowKey: "cursor", value }, "Replace", {
          etag: row.etag,
        });
        return value;
      } catch (e) {
        if (status(e) === 404) {
          try {
            await this.table.createEntity({ partitionKey: "n", rowKey: "cursor", value: 1 });
            return 1;
          } catch (c) {
            if (status(c) !== 409) throw c;
          }
        } else if (status(e) !== 412) throw e;
      }
    }
    throw new Error("cursor busy");
  }

  async after(after: number, limit: number, now: number): Promise<RelayUpdate[]> {
    await this.init();
    const out: RelayUpdate[] = [];
    const rows = this.table.listEntities<{ received: number; json: string }>({
      queryOptions: { filter: odata`PartitionKey eq 'u' and RowKey gt ${pad(after)}` },
    });
    for await (const row of rows) {
      if (row.received < now - KEEP_MS) continue;
      out.push({ cursor: Number(row.rowKey), received: row.received, activity: JSON.parse(row.json) });
      if (out.length >= limit) break;
    }
    return out;
  }

  async forget(cursor: number): Promise<void> {
    await this.init();
    await this.deleteWhere(odata`PartitionKey eq 'u' and RowKey le ${pad(cursor)}`);
  }

  async prune(before: number): Promise<number> {
    await this.init();
    return this.deleteWhere(odata`PartitionKey eq 'u' and received lt ${before}`);
  }

  private async deleteWhere(filter: string): Promise<number> {
    let count = 0;
    const rows = this.table.listEntities({ queryOptions: { filter, select: ["RowKey"] } });
    for await (const row of rows) {
      await this.table.deleteEntity("u", row.rowKey!).catch((e) => {
        if (status(e) !== 404) throw e;
      });
      count++;
    }
    return count;
  }

  async get<T>(key: string): Promise<T | undefined> {
    await this.init();
    try {
      const row = await this.table.getEntity<{ json: string }>("s", encodeURIComponent(key));
      return JSON.parse(row.json) as T;
    } catch (e) {
      if (status(e) === 404) return undefined;
      throw e;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.init();
    await this.table.upsertEntity(
      { partitionKey: "s", rowKey: encodeURIComponent(key), json: JSON.stringify(value) },
      "Replace",
    );
  }

  async delete(key: string): Promise<void> {
    await this.init();
    await this.table.deleteEntity("s", encodeURIComponent(key)).catch((e) => {
      if (status(e) !== 404) throw e;
    });
  }

  async list<T>(prefix: string): Promise<{ key: string; value: T }[]> {
    await this.init();
    // A handful of records: read them all rather than bound a row-key range of encoded keys.
    const out: { key: string; value: T }[] = [];
    const rows = this.table.listEntities<{ json: string }>({
      queryOptions: { filter: "PartitionKey eq 's'" },
    });
    for await (const row of rows) {
      const key = decodeURIComponent(row.rowKey!);
      if (key.startsWith(prefix)) out.push({ key, value: JSON.parse(row.json) as T });
    }
    return out;
  }
}

const pad = (n: number) => String(n).padStart(12, "0");

function status(e: unknown): number | undefined {
  return e instanceof RestError ? e.statusCode : (e as { statusCode?: number })?.statusCode;
}
