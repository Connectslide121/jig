import { useState } from "react";
import { Kanban } from "@/blocks";
import { fmt, Page, today } from "@/kit";
import { type JobStatus, PRIORITY, STATUS, store, technicians, useJobs } from "../data";
import { JobDrawer } from "./job-parts";

const ORDER: JobStatus[] = ["new", "scheduled", "in-progress", "waiting", "done"];

export function Board() {
  const jobs = useJobs();
  const [open, setOpen] = useState<string>();
  // The board shows this week's work: everything open, and what was done in the last two days.
  const since = today().getTime() - 2 * 86_400_000;
  const shown = jobs.filter((j) => j.status !== "done" || j.due.getTime() >= since);
  return (
    <Page title="Board" description="This week's jobs by status. Use a card's menu to move it." width="full">
      <Kanban
        demo="board"
        columns={ORDER.map((id) => ({ id, title: STATUS[id].label, tone: STATUS[id].tone, limit: id === "in-progress" ? technicians.length : undefined }))}
        cards={shown.map((j) => {
          const t = technicians.find((x) => x.id === j.technician);
          return {
            id: j.id,
            column: j.status,
            title: j.title,
            detail: j.customer,
            tag: j.priority === "urgent" || j.priority === "high" ? { label: PRIORITY[j.priority].label, tone: PRIORITY[j.priority].tone } : { label: j.kind, tone: "neutral" },
            meta: fmt.date(j.due),
            assignee: t && { name: t.name, initials: t.initials },
          };
        })}
        onCardClick={(c) => setOpen(c.id)}
        onMove={(c, column) => store.update(c.id, { status: column as JobStatus })}
      />
      <JobDrawer job={jobs.find((j) => j.id === open)} onClose={() => setOpen(undefined)} />
    </Page>
  );
}
