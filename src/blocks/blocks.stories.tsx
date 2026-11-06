import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ColumnDef } from "@tanstack/react-table";
import { Inbox, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { daysFromNow, fmt, scenarioTime } from "@/kit/data";
import { orders, type Order, team, weeks } from "../stories/fixtures";
import { ChartCard } from "./chart-card";
import { DataTable, facetFilter } from "./data-table";
import { DetailDrawer } from "./detail-drawer";
import { EmptyState } from "./empty-state";
import { FormDialog } from "./form-dialog";
import { Kanban, type KanbanCard } from "./kanban";
import { KpiStrip } from "./kpi-strip";
import { Schedule } from "./schedule";
import { StatusBadge, type Tone } from "./status";

const meta: Meta = { title: "Blocks" };
export default meta;
type Story = StoryObj;

const TONE: Record<Order["status"], Tone> = { paid: "success", pending: "info", overdue: "danger" };

export const Kpis: Story = {
  render: () => (
    <KpiStrip
      items={[
        { label: "Revenue", value: fmt.money(48200), delta: { value: "+8 %", direction: "up", good: true, against: "vs last month" }, trend: weeks.map((w) => w.revenue) },
        { label: "Open orders", value: "37", delta: { value: "−4", direction: "down", good: true, against: "vs last week" } },
        { label: "Overdue", value: "5", delta: { value: "+2", direction: "up", good: false, against: "vs last week" } },
        { label: "On-time delivery", value: fmt.percent(0.94), delta: { value: "flat", direction: "flat", good: true, against: "vs last month" } },
      ]}
    />
  ),
};
export const KpisLoading: Story = { render: () => <KpiStrip items={[]} loading /> };

export const Chart: Story = {
  render: () => (
    <ChartCard
      title="Revenue and costs"
      description="Last 12 weeks, k€"
      data={weeks}
      x="week"
      series={[
        { key: "revenue", label: "Revenue", color: 1 },
        { key: "costs", label: "Costs", color: 3 },
      ]}
    />
  ),
};
export const ChartBars: Story = { render: () => <ChartCard title="Revenue" kind="bar" data={weeks} x="week" series={[{ key: "revenue", label: "Revenue", color: 2 }]} /> };

const columns: ColumnDef<Order, unknown>[] = [
  { accessorKey: "id", header: "Order", meta: { width: "w-28" } },
  { accessorKey: "customer", header: "Customer" },
  { accessorKey: "owner", header: "Owner", meta: { width: "w-44", hideBelow: "3xl" } },
  { accessorKey: "placed", header: "Placed", meta: { width: "w-28", align: "right", hideBelow: "xl" }, sortingFn: "datetime", cell: ({ row }) => fmt.date(row.original.placed) },
  { accessorKey: "total", header: "Total", meta: { width: "w-28", align: "right" }, cell: ({ row }) => fmt.money(row.original.total) },
  {
    accessorKey: "status",
    header: "Status",
    meta: { width: "w-32", align: "right" },
    filterFn: facetFilter,
    cell: ({ row }) => <StatusBadge tone={TONE[row.original.status]}>{row.original.status}</StatusBadge>,
  },
];
export const Table: Story = {
  render: () => (
    <DataTable
      data={orders}
      columns={columns}
      search={{ placeholder: "Search orders…", fields: ["id", "customer", "owner"] }}
      facets={[{ column: "status", label: "Status", options: ["paid", "pending", "overdue"].map((v) => ({ value: v, label: v })) }]}
      onRowClick={() => undefined}
    />
  ),
};
export const TableLoading: Story = { render: () => <DataTable data={[]} columns={columns} loading /> };
export const TableEmpty: Story = {
  render: () => (
    <DataTable
      data={[]}
      columns={columns}
      empty={<EmptyState icon={Inbox} title="No orders yet" description="Orders appear here when a customer checks out." action={<Button><Plus /> New order</Button>} />}
    />
  ),
};

export const DaySchedule: Story = {
  render: () => (
    <Schedule
      now={scenarioTime(10, 15)}
      resources={team.map((p) => ({ id: p.id, name: p.name, initials: p.initials, detail: "Consultant" }))}
      events={team.flatMap((p, i) => [
        { id: `${p.id}-a`, resource: p.id, start: scenarioTime(8 + (i % 2), 0), end: scenarioTime(10 + (i % 2), 0), title: "Workshop", detail: "Room 2", tone: "primary" as const },
        { id: `${p.id}-b`, resource: p.id, start: scenarioTime(12 + (i % 3), 30), end: scenarioTime(14 + (i % 3), 0), title: "Customer visit", tone: "info" as const },
      ])}
    />
  ),
};

function BoardDemo() {
  const [cards, setCards] = useState<KanbanCard[]>(
    orders.slice(0, 10).map((o, i) => ({
      id: o.id,
      column: ["todo", "doing", "review", "done"][i % 4] as string,
      title: `Pack ${o.id}`,
      detail: o.customer,
      tag: { label: o.status, tone: TONE[o.status] },
      meta: fmt.date(o.placed),
      assignee: { name: o.owner, initials: o.owner.split(" ").map((w) => w[0]).join("") },
    })),
  );
  return (
    <Kanban
      columns={[
        { id: "todo", title: "To do", tone: "neutral" },
        { id: "doing", title: "Doing", tone: "warning", limit: 2 },
        { id: "review", title: "Review", tone: "info" },
        { id: "done", title: "Done", tone: "success" },
      ]}
      cards={cards}
      onMove={(card, column) => setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, column } : c)))}
    />
  );
}
export const Board: Story = { render: () => <BoardDemo /> };

export const Drawer: Story = {
  render: () => (
    <DetailDrawer
      open
      onOpenChange={() => undefined}
      title="SO-1040"
      subtitle={orders[0]?.customer}
      status={<StatusBadge tone="success">paid</StatusBadge>}
      fields={[
        { label: "Owner", value: orders[0]?.owner },
        { label: "Placed", value: fmt.date(daysFromNow(-3)) },
        { label: "Total", value: fmt.money(1240) },
      ]}
      activity={[
        { id: "1", who: "Payments", text: "marked it paid", when: "yesterday" },
        { id: "2", who: team[0]?.name ?? "", text: "created the order", when: "3 days ago" },
      ]}
      actions={<Button>Send invoice</Button>}
    />
  ),
};

export const Form: Story = {
  render: () => (
    <FormDialog
      open
      onOpenChange={() => undefined}
      title="New order"
      description="The customer gets a confirmation e-mail."
      fields={[
        { name: "customer", label: "Customer", required: true },
        { name: "total", label: "Total", type: "number", half: true, required: true },
        { name: "due", label: "Due", type: "date", half: true },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      onSubmit={() => undefined}
    />
  ),
};

export const Empty: Story = {
  render: () => <EmptyState icon={Inbox} title="No orders yet" description="Orders appear here when a customer checks out." action={<Button><Plus /> New order</Button>} />,
};
