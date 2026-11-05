import type { TableClient } from "@azure/data-tables";
import { describe, expect, it } from "vitest";
import { TableStore } from "./tableStore.ts";

/** Just enough of a table for the cursor counter and records: ETags, 404, 409 and 412 like Azure's. */
function fakeTable() {
  const rows = new Map<string, Record<string, unknown> & { etag: string }>();
  let etag = 0;
  const err = (statusCode: number) => Object.assign(new Error(String(statusCode)), { statusCode });
  const id = (pk: string, rk: string) => `${pk}|${rk}`;
  const table = {
    createTable: async () => {},
    getEntity: async (pk: string, rk: string) => {
      // Let other appends interleave, as concurrent instances would.
      await new Promise((r) => setTimeout(r, Math.random() * 3));
      const row = rows.get(id(pk, rk));
      if (!row) throw err(404);
      return { ...row };
    },
    createEntity: async (e: { partitionKey: string; rowKey: string }) => {
      if (rows.has(id(e.partitionKey, e.rowKey))) throw err(409);
      rows.set(id(e.partitionKey, e.rowKey), { ...e, etag: String(++etag) });
    },
    updateEntity: async (e: { partitionKey: string; rowKey: string }, _mode: string, o: { etag: string }) => {
      const row = rows.get(id(e.partitionKey, e.rowKey));
      if (!row) throw err(404);
      if (row.etag !== o.etag) throw err(412);
      rows.set(id(e.partitionKey, e.rowKey), { ...e, etag: String(++etag) });
    },
    upsertEntity: async (e: { partitionKey: string; rowKey: string }) => {
      rows.set(id(e.partitionKey, e.rowKey), { ...e, etag: String(++etag) });
    },
    deleteEntity: async (pk: string, rk: string) => {
      if (!rows.delete(id(pk, rk))) throw err(404);
    },
    listEntities: (o: { queryOptions: { filter: string } }) => {
      const pk = /PartitionKey eq '(\w)'/.exec(o.queryOptions.filter)?.[1];
      const list = [...rows.values()].filter((r) => r.partitionKey === pk);
      return (async function* () {
        yield* list;
      })();
    },
  };
  return { table: table as unknown as TableClient, rows };
}

describe("TableStore", () => {
  it("gives concurrent appends distinct cursors without gaps", async () => {
    const { table } = fakeTable();
    const store = new TableStore(table);
    const cursors = await Promise.all(
      Array.from({ length: 8 }, () => store.append({ type: "message", conversation: { id: "a" } }, 1)),
    );
    expect([...cursors].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("stores records under row keys Azure accepts", async () => {
    const { table, rows } = fakeTable();
    const store = new TableStore(table);
    await store.set("channel:19:abc@thread.tacv2;messageid=1/x#y?", { name: "Shop" });
    expect([...rows.keys()].every((k) => !/[/\\#?]/.test(k.split("|")[1]!))).toBe(true);
    expect(await store.get("channel:19:abc@thread.tacv2;messageid=1/x#y?")).toEqual({ name: "Shop" });
    expect(await store.list("channel:")).toEqual([
      { key: "channel:19:abc@thread.tacv2;messageid=1/x#y?", value: { name: "Shop" } },
    ]);
    await store.delete("channel:19:abc@thread.tacv2;messageid=1/x#y?");
    await store.delete("missing");
    expect(await store.get("channel:19:abc@thread.tacv2;messageid=1/x#y?")).toBeUndefined();
  });
});
