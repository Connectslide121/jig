import { useState } from "react";
import { Schedule } from "@/blocks";
import { Page } from "@/kit";
import { NOW, STATUS, technicians, useJobs } from "../data";
import { JobDrawer } from "./job-parts";

export function ScheduleScreen() {
  const jobs = useJobs();
  const [open, setOpen] = useState<string>();
  return (
    <Page title="Schedule" description="Who is where today. Click a job to see it.">
      <Schedule
        demo="schedule"
        hours={[7, 18]}
        now={NOW}
        resources={technicians.map((t) => ({ id: t.id, name: t.name, detail: t.skill, initials: t.initials }))}
        events={jobs
          .filter((j) => j.start && j.end && j.technician)
          .map((j) => ({
            id: j.id,
            resource: j.technician as string,
            start: j.start as Date,
            end: j.end as Date,
            title: j.title,
            detail: j.customer,
            tone: j.priority === "urgent" ? "danger" : STATUS[j.status].tone,
          }))}
        onEventClick={(e) => setOpen(e.id)}
      />
      <JobDrawer job={jobs.find((j) => j.id === open)} onClose={() => setOpen(undefined)} />
    </Page>
  );
}
