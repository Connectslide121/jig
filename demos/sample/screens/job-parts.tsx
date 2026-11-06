import { CalendarClock, CheckCircle2, UserPlus } from "lucide-react";
import { DetailDrawer, FormDialog, StatusBadge } from "@/blocks";
import { Button } from "@/components/ui/button";
import { daysFromNow, fmt } from "@/kit";
import { type Job, NOW, PRIORITY, STATUS, store, techName, technicians } from "../data";

export function JobStatus({ job }: { job: Job }) {
  return <StatusBadge tone={STATUS[job.status].tone}>{STATUS[job.status].label}</StatusBadge>;
}

/** One job, opened from any screen. */
export function JobDrawer({ job, onClose }: { job?: Job; onClose: () => void }) {
  const open = !!job;
  const j = job;
  const free = technicians.find((t) => t.skill === j?.kind) ?? technicians[0];
  return (
    <DetailDrawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={j?.title ?? ""}
      subtitle={j ? `${j.id} · ${j.customer}` : undefined}
      status={j && <JobStatus job={j} />}
      fields={
        j
          ? [
              { label: "Site", value: j.site },
              { label: "Type", value: j.kind },
              {
                label: "Priority",
                value: <StatusBadge tone={PRIORITY[j.priority].tone}>{PRIORITY[j.priority].label}</StatusBadge>,
              },
              { label: "Technician", value: techName(j.technician) },
              { label: "When", value: j.start && j.end ? `${fmt.weekday(j.start)}, ${fmt.clock(j.start)}–${fmt.clock(j.end)}` : `Due ${fmt.date(j.due)}` },
              { label: "Estimate", value: <span className="tabular-nums">{fmt.money(j.value)}</span> },
            ]
          : []
      }
      activity={
        j
          ? [
              { id: "a3", who: "Selma Andersen", text: j.technician ? `assigned ${techName(j.technician)}` : "flagged it for today", when: "08:02" },
              { id: "a2", who: "Customer", text: "called: residents waiting in the lobby", when: "07:24" },
              { id: "a1", who: "Fabrikam Field", text: "created the job from the service line", when: "07:12" },
            ]
          : undefined
      }
      actions={
        j &&
        (j.status === "new" && free ? (
          <Button
            data-demo="assign"
            onClick={() => {
              const start = new Date(Math.ceil(NOW.getTime() / 1_800_000) * 1_800_000);
              store.update(j.id, { status: "scheduled", technician: free.id, start, end: new Date(start.getTime() + 5_400_000), due: start });
              onClose();
            }}
          >
            <UserPlus /> Assign {free.first}
          </Button>
        ) : j.status !== "done" ? (
          <Button
            onClick={() => {
              store.update(j.id, { status: "done" });
              onClose();
            }}
          >
            <CheckCircle2 /> Mark done
          </Button>
        ) : (
          <Button variant="outline" onClick={onClose}>
            <CalendarClock /> Book a follow-up
          </Button>
        ))
      }
    />
  );
}

export function NewJobDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New job"
      description="It goes on the board as New until someone is assigned."
      submitLabel="Create job"
      fields={[
        { name: "title", label: "What's wrong", placeholder: "Boiler makes a knocking sound", required: true },
        { name: "customer", label: "Customer", placeholder: "Riverline Services", required: true, half: true },
        { name: "site", label: "Site", placeholder: "12 Mill Lane", required: true, half: true },
        {
          name: "kind",
          label: "Type",
          type: "select",
          half: true,
          initial: "Heating",
          options: ["Heating", "Cooling", "Lifts", "Electrical"].map((v) => ({ value: v, label: v })),
        },
        {
          name: "priority",
          label: "Priority",
          type: "select",
          half: true,
          initial: "normal",
          options: Object.entries(PRIORITY).map(([value, p]) => ({ value, label: p.label })),
        },
        { name: "notes", label: "Notes for the technician", type: "textarea" },
      ]}
      onSubmit={(v) =>
        store.add({
          title: v.title ?? "",
          customer: v.customer ?? "",
          site: v.site ?? "",
          kind: v.kind ?? "Heating",
          priority: (v.priority ?? "normal") as Job["priority"],
          status: "new",
          due: daysFromNow(1, 9),
          value: 0,
        })
      }
    />
  );
}
