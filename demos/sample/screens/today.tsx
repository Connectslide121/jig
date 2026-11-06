import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";
import { ChartCard, KpiStrip, StatusBadge } from "@/blocks";
import { Button } from "@/components/ui/button";
import { fmt, Link, Page, Section, today } from "@/kit";
import { cn } from "@/lib/utils";
import { completedTrend, isLate, type Job, PRIORITY, me, techName, technicians, useJobs } from "../data";
import { JobDrawer, JobStatus, NewJobDialog } from "./job-parts";

export function Today() {
  const jobs = useJobs();
  const [open, setOpen] = useState<string>();
  const [creating, setCreating] = useState(false);
  const day = today();
  const todays = jobs.filter((j) => (j.start ?? j.due).toDateString() === day.toDateString());
  const late = jobs.filter(isLate);
  const busy = new Set(todays.filter((j) => j.status === "in-progress").map((j) => j.technician));
  const attention = jobs.filter((j) => j.status === "new" && j.priority === "urgent");
  const list = [...attention, ...todays.filter((j) => !attention.includes(j))].slice(0, 8);
  return (
    <Page
      title={`Good morning, ${me.name.split(" ")[0]}`}
      description={`${day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · ${todays.length} jobs on the schedule`}
      actions={
        <Button onClick={() => setCreating(true)} data-demo="new-job">
          <Plus /> New job
        </Button>
      }
    >
      <div className="grid gap-6">
        <KpiStrip
          items={[
            { label: "Jobs today", value: String(todays.length), demo: "kpi-today", delta: { value: "+3", direction: "up", good: true, against: "vs a week ago" }, trend: completedTrend.map((d) => d.planned) },
            { label: "Late", value: String(late.length), demo: "kpi-late", delta: { value: "−2", direction: "down", good: true, against: "vs yesterday" } },
            { label: "Technicians out", value: `${busy.size} / ${technicians.length}`, delta: { value: "2 on call", direction: "flat", good: true, against: "this week" } },
            { label: "First-visit fix rate", value: fmt.percent(0.86), delta: { value: "+4 pts", direction: "up", good: true, against: "vs last month" }, trend: [78, 80, 79, 83, 82, 85, 86] },
          ]}
        />
        <div className="grid gap-6 @5xl:grid-cols-5">
          <Section
            className="@5xl:col-span-3"
            title="Needs you now"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/jobs">
                  All jobs <ArrowRight />
                </Link>
              </Button>
            }
          >
            <ol className="divide-y overflow-hidden rounded-xl border bg-card shadow-card" data-demo="today-list">
              {list.map((j) => (
                <li key={j.id}>
                  <JobRow job={j} onOpen={() => setOpen(j.id)} />
                </li>
              ))}
            </ol>
          </Section>
          <Section className="@5xl:col-span-2" title="Completed jobs">
            <ChartCard
              title="Last 14 days"
              description="Completed against planned"
              data={completedTrend}
              x="day"
              kind="bar"
              series={[
                { key: "completed", label: "Completed", color: 1 },
                { key: "planned", label: "Planned", color: 3 },
              ]}
            />
          </Section>
        </div>
      </div>
      <JobDrawer job={jobs.find((j) => j.id === open)} onClose={() => setOpen(undefined)} />
      <NewJobDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
}

function JobRow({ job, onOpen }: { job: Job; onOpen: () => void }) {
  const urgent = job.priority === "urgent" && job.status === "new";
  return (
    <button
      type="button"
      onClick={onOpen}
      data-demo={urgent ? "urgent-job" : undefined}
      className={cn("flex h-16 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none", urgent && "bg-destructive/5")}
    >
      <span className="w-12 shrink-0 text-sm text-muted-foreground tabular-nums">{job.start ? fmt.clock(job.start) : "—"}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{job.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {job.customer} · {techName(job.technician)}
        </span>
      </span>
      <span className="w-20 shrink-0 text-right @max-xl:hidden">
        {job.priority === "urgent" || job.priority === "high" ? <StatusBadge tone={PRIORITY[job.priority].tone}>{PRIORITY[job.priority].label}</StatusBadge> : null}
      </span>
      <span className="flex w-36 shrink-0 justify-end @max-md:w-28">
        <JobStatus job={job} />
      </span>
    </button>
  );
}
