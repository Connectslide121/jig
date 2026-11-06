import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, facetFilter, StatusBadge, type Tone } from "@/blocks";
import { fmt, Page } from "@/kit";
import { type Item, items } from "../data";

const TONE: Record<Item["status"], Tone> = { active: "success", paused: "warning", closed: "neutral" };
const columns: ColumnDef<Item, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "owner", header: "Owner", meta: { width: "w-44", hideBelow: "xl" } },
  { accessorKey: "updated", header: "Updated", meta: { width: "w-28", align: "right" }, sortingFn: "datetime", cell: ({ row }) => fmt.date(row.original.updated) },
  { accessorKey: "status", header: "Status", meta: { width: "w-32", align: "right" }, filterFn: facetFilter, cell: ({ row }) => <StatusBadge tone={TONE[row.original.status]}>{row.original.status}</StatusBadge> },
];

export function Items() {
  return (
    <Page title="Items">
      <DataTable
        demo="items"
        data={items}
        columns={columns}
        search={{ placeholder: "Search…", fields: ["name", "owner"] }}
        facets={[{ column: "status", label: "Status", options: ["active", "paused", "closed"].map((v) => ({ value: v, label: v })) }]}
      />
    </Page>
  );
}
