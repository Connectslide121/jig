import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useState } from "react";
import { DataTable, facetFilter, StatusBadge } from "@/blocks";
import { Button } from "@/components/ui/button";
import { fmt, Page } from "@/kit";
import { isLate, type Job, PRIORITY, STATUS, techName, useJobs } from "../data";
import { JobDrawer, JobStatus, NewJobDialog } from "./job-parts";

const columns: ColumnDef<Job, unknown>[] = [
  { accessorKey: "id", header: "Job", meta: { width: "w-24" }, cell: ({ row }) => <span className="text-muted-foreground tabular-nums">{row.original.id}</span> },
  {
    accessorKey: "title",
    header: "What",
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.original.title}</p>
        <p className="truncate text-xs text-muted-foreground">{row.original.customer}</p>
      </div>
    ),
  },
  { accessorKey: "technician", header: "Technician", meta: { width: "w-44", hideBelow: "3xl" }, cell: ({ row }) => <span className="truncate">{techName(row.original.technician)}</span> },
  {
    accessorKey: "due",
    header: "Due",
    meta: { width: "w-28", align: "right", hideBelow: "xl" },
    sortingFn: "datetime",
    cell: ({ row }) => <span className={isLate(row.original) ? "font-medium text-destructive" : undefined}>{fmt.date(row.original.due)}</span>,
  },
  { accessorKey: "value", header: "Estimate", meta: { width: "w-28", align: "right", hideBelow: "3xl" }, cell: ({ row }) => fmt.money(row.original.value) },
  {
    accessorKey: "priority",
    header: "Priority",
    meta: { width: "w-24", hideBelow: "xl" },
    filterFn: facetFilter,
    cell: ({ row }) => <span className="text-muted-foreground">{PRIORITY[row.original.priority].label}</span>,
  },
  { accessorKey: "status", header: "Status", meta: { width: "w-40", align: "right" }, filterFn: facetFilter, cell: ({ row }) => <JobStatus job={row.original} /> },
];

export function Jobs() {
  const jobs = useJobs();
  const [open, setOpen] = useState<string>();
  const [creating, setCreating] = useState(false);
  const late = jobs.filter(isLate).length;
  return (
    <Page
      title="Jobs"
      description={
        <>
          {jobs.length} jobs · {late > 0 ? <StatusBadge tone="danger">{late} late</StatusBadge> : "none late"}
        </>
      }
      actions={
        <Button onClick={() => setCreating(true)}>
          <Plus /> New job
        </Button>
      }
    >
      <DataTable
        demo="jobs-table"
        data={jobs}
        columns={columns}
        getRowId={(j) => j.id}
        search={{ placeholder: "Search jobs, customers…", fields: ["title", "customer", "id", "site"] }}
        facets={[
          { column: "status", label: "Status", options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })) },
          { column: "priority", label: "Priority", options: Object.entries(PRIORITY).map(([value, p]) => ({ value, label: p.label })) },
        ]}
        onRowClick={(j) => setOpen(j.id)}
        pageSize={12}
        initialSort={[{ id: "due", desc: true }]}
      />
      <JobDrawer job={jobs.find((j) => j.id === open)} onClose={() => setOpen(undefined)} />
      <NewJobDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
}
